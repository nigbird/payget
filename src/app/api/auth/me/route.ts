import { NextRequest, NextResponse } from "next/server"
import { getAccessTokenFromCookie, accessTokenCookieName } from "@/lib/access-token-cookie"
import { getBearerTokenFromHeaders, verifyAccessToken } from "@/lib/token-auth"
import { validateSession, touchSession } from "@/lib/session-manager"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const token =
      getBearerTokenFromHeaders(request.headers) ??
      (await getAccessTokenFromCookie(request))

    if (!token) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
    }

    let payload: Awaited<ReturnType<typeof verifyAccessToken>>
    try {
      payload = await verifyAccessToken(token)
    } catch {
      return NextResponse.json({ error: "Token invalid or expired" }, { status: 401 })
    }

    const userId = typeof payload.sub === "string" ? payload.sub : null
    if (!userId) {
      return NextResponse.json({ error: "Token missing subject" }, { status: 401 })
    }

    const sid = typeof (payload as any).sid === "string" ? (payload as any).sid as string : undefined

    // SALES users (id = 'sales-${phone}') have no ActiveSession record — trust the JWT.
    const isSales = userId.startsWith("sales-")

    if (!isSales && sid) {
      const valid = await validateSession(sid)
      if (!valid) {
        return NextResponse.json({ error: "Session expired or revoked" }, { status: 401 })
      }
      touchSession(sid)
    }

    // Fetch fresh fields that may change between token issuance and now.
    let dbFields: { email: string | null; name: string | null; firstLogin: boolean } | null = null
    if (!isSales) {
      dbFields = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true, firstLogin: true }
      })
      if (!dbFields) {
        return NextResponse.json({ error: "User not found" }, { status: 401 })
      }
    }

    return NextResponse.json({
      id: userId,
      sid,
      email: dbFields?.email ?? (payload as any).email ?? null,
      name: dbFields?.name ?? null,
      firstLogin: dbFields?.firstLogin ?? false,
      role: typeof payload.role === "string" ? payload.role : null,
      merchantId: typeof payload.merchantId === "string" ? payload.merchantId : null,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      isHeadOffice: typeof payload.isHeadOffice === "boolean" ? payload.isHeadOffice : false,
      district: typeof payload.district === "string" ? payload.district : null,
      branch: typeof payload.branch === "string" ? payload.branch : null,
      assignedMerchantIds: Array.isArray((payload as any).assignedMerchantIds)
        ? (payload as any).assignedMerchantIds
        : [],
      assignedMerchants: Array.isArray((payload as any).assignedMerchants)
        ? (payload as any).assignedMerchants
        : [],
      teamMemberId: typeof (payload as any).teamMemberId === "string"
        ? (payload as any).teamMemberId
        : undefined,
    })
  } catch (e) {
    console.error("[/api/auth/me]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
