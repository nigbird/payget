import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifySalesOtp } from "@/lib/otp"
import { writeAuditLog } from "@/lib/audit-log"
import { signAccessToken, accessTokenTtlSeconds } from "@/lib/token-auth"
import { setAccessTokenCookie } from "@/lib/access-token-cookie"
import { requireCsrf } from "@/lib/request-security"
import { checkIpLockout, recordFailedLoginAttempt, resetIpLockout } from "@/lib/rate-limit"

// SALES sessions are purely JWT-based — no ActiveSession or RefreshToken because
// MerchantTeamMember records are not User records and cannot satisfy the FK.
const SALES_SESSION_TTL_SECONDS = 30 * 60 // 30 minutes, matching the old NextAuth maxAge

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const xForwardedFor = request.headers.get("x-forwarded-for")
    const ip = xForwardedFor ? xForwardedFor.split(",")[0].trim() : "127.0.0.1"

    const ipLockout = await checkIpLockout(ip)
    if (ipLockout.locked) {
      return NextResponse.json(
        { error: "Too many failed attempts. Try again later.", code: "IP_LOCKOUT", retryAfterSeconds: ipLockout.retryAfterSeconds },
        { status: 429 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const phone = typeof body.phone === "string" ? body.phone.trim() : ""
    const otp = typeof body.otp === "string" ? body.otp.trim() : ""
    const merchantId = typeof body.merchantId === "string" ? body.merchantId.trim() : ""

    if (!phone || !otp) {
      await writeAuditLog({
        request,
        userId: null,
        action: "LOGIN_FAILURE",
        entityType: "USER",
        entityId: null,
        newValue: { result: "failed", reason: "MISSING_FIELDS", loginType: "SALES_OTP" },
      })
      return NextResponse.json({ error: "phone and otp are required" }, { status: 400 })
    }

    const validOtp = await verifySalesOtp(phone, otp)
    if (!validOtp) {
      await writeAuditLog({
        request,
        userId: null,
        action: "LOGIN_FAILURE",
        entityType: "USER",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "INVALID_OTP",
          phone: phone.substring(0, 10) + "...",
        },
      })
      await recordFailedLoginAttempt(ip, phone)
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 401 })
    }

    const members = (await db.findMerchantTeamMembersByPhone(phone)) as any[]
    const activeMembers = members.filter(
      (m) => m.status === "ACTIVE" && m.merchant?.status === "ACTIVE"
    )

    if (activeMembers.length === 0) {
      await writeAuditLog({
        request,
        userId: null,
        action: "LOGIN_FAILURE",
        entityType: "USER",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "NO_ACTIVE_MEMBERS",
          phone: phone.substring(0, 10) + "...",
        },
      })
      return NextResponse.json({ error: "No active merchant membership found" }, { status: 401 })
    }

    await resetIpLockout(ip)

    let selectedMember = activeMembers[0]
    if (merchantId) {
      const found = activeMembers.find((m) => m.merchantId === merchantId)
      if (found) selectedMember = found
    }

    const assignedMerchantIds = Array.from(new Set(activeMembers.map((m) => m.merchantId))) as string[]
    const assignedMerchants = activeMembers
      .filter((m) => m.merchant)
      .map((m) => ({ id: m.merchantId as string, name: m.merchant.name as string }))

    // Virtual user ID — not a real User row.
    const virtualUserId = `sales-${phone}`

    const accessToken = await signAccessToken(
      {
        sub: virtualUserId,
        sid: "", // No ActiveSession for SALES users
        role: "SALES",
        merchantId: selectedMember.merchantId,
        assignedMerchantIds,
        permissions: [],
      },
      SALES_SESSION_TTL_SECONDS
    )

    await writeAuditLog({
      request,
      userId: null,
      action: "LOGIN_SUCCESS",
      entityType: "USER",
      entityId: virtualUserId,
      newValue: {
        result: "success",
        loginType: "SALES_OTP",
        memberName: selectedMember.name,
        merchantId: selectedMember.merchantId,
        merchantName: selectedMember.merchant?.name,
      },
    })

    const res = NextResponse.json({
      expiresIn: SALES_SESSION_TTL_SECONDS,
      user: {
        id: virtualUserId,
        email: selectedMember.email,
        name: selectedMember.name,
        role: "SALES",
        merchantId: selectedMember.merchantId,
        teamMemberId: selectedMember.id,
        assignedMerchantIds,
        assignedMerchants,
      },
    })

    await setAccessTokenCookie(res, accessToken, SALES_SESSION_TTL_SECONDS)
    // No refresh token for SALES — session ends when the access token expires.
    return res
  } catch (e) {
    console.error("[sales-otp login]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
