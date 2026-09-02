import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { prisma } from "@/lib/prisma"
import { verifySalesOtp } from "@/lib/otp"
import { writeAuditLog } from "@/lib/audit-log"
import {
  signAccessToken,
  generateRefreshTokenValue,
  hashRefreshToken,
  computeRefreshTokenExpiresAt,
  SALES_ACCESS_TOKEN_TTL_SECONDS
} from "@/lib/token-auth"
import { setAccessTokenCookie } from "@/lib/access-token-cookie"
import {
  enforceSessionLimitTx,
  createActiveSessionTx,
  cleanupExpiredSessions,
  teamMemberPrincipal
} from "@/lib/session-manager"
import { setRefreshTokenCookie } from "@/lib/refresh-token-cookie"
import { requireCsrf } from "@/lib/request-security"
import { checkIpLockout, recordFailedLoginAttempt, resetIpLockout } from "@/lib/rate-limit"
import crypto from "crypto"

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

    // Passive cleanup of stale sessions (non-blocking; runs in background).
    cleanupExpiredSessions().catch(() => {})

    let selectedMember = activeMembers[0]
    if (merchantId) {
      const found = activeMembers.find((m) => m.merchantId === merchantId)
      if (found) selectedMember = found
    }

    const assignedMerchantIds = Array.from(new Set(activeMembers.map((m) => m.merchantId))) as string[]
    const assignedMerchants = activeMembers
      .filter((m) => m.merchant)
      .map((m) => ({ id: m.merchantId as string, name: m.merchant.name as string }))

    // Virtual user ID — not a real User row. The session itself is a real
    // ActiveSession row keyed by teamMemberId, so it can be revoked and refreshed.
    const virtualUserId = `sales-${phone}`
    const teamRole = String(selectedMember.role).toLowerCase()

    const familyId = crypto.randomUUID()
    const refreshValue = generateRefreshTokenValue()
    const refreshHash = hashRefreshToken(refreshValue)
    const expiresAt = computeRefreshTokenExpiresAt()
    const userAgent = request.headers.get("user-agent")

    // Atomic transaction: enforce session limit -> create ActiveSession -> bind RefreshToken.
    const sid = await prisma.$transaction(async (tx) => {
      const principal = teamMemberPrincipal(selectedMember.id as string)

      await enforceSessionLimitTx(tx, principal)

      const sessionId = await createActiveSessionTx(tx, {
        principal,
        expiresAt,
        userAgent,
        ipAddress: ip
      })

      await tx.refreshToken.create({
        data: {
          tokenHash: refreshHash,
          teamMemberId: selectedMember.id as string,
          sessionId,
          familyId,
          expiresAt,
          userAgent: userAgent ?? undefined,
          ipAddress: ip
        }
      })

      return sessionId
    })

    const accessToken = await signAccessToken(
      {
        sub: virtualUserId,
        sid,
        role: "SALES",
        merchantId: selectedMember.merchantId,
        assignedMerchantIds,
        assignedMerchants,
        permissions: [],
        teamRole,
        teamMemberId: selectedMember.id,
      },
      SALES_ACCESS_TOKEN_TTL_SECONDS
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
        sessionId: sid,
      },
    })

    const res = NextResponse.json({
      expiresIn: SALES_ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: virtualUserId,
        email: selectedMember.email,
        name: selectedMember.name,
        role: "SALES",
        teamRole,
        merchantId: selectedMember.merchantId,
        teamMemberId: selectedMember.id,
        assignedMerchantIds,
        assignedMerchants,
      },
    })

    await setAccessTokenCookie(res, accessToken, SALES_ACCESS_TOKEN_TTL_SECONDS)
    setRefreshTokenCookie(res, refreshValue, expiresAt)
    return res
  } catch (e) {
    console.error("[sales-otp login]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
