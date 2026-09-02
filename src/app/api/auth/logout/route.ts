import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { clearAccessTokenCookie } from "@/lib/access-token-cookie"
import { refreshTokenCookieName, clearRefreshTokenCookie } from "@/lib/refresh-token-cookie"
import { hashRefreshToken } from "@/lib/token-auth"
import { revokeSession } from "@/lib/session-manager"
import { writeAuditLog } from "@/lib/audit-log"
import { requireAuthUser } from "@/lib/request-auth"
import { requireCsrf } from '@/lib/request-security';

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const name = refreshTokenCookieName()
    const raw = (request as NextRequest).cookies.get(name)?.value || ""
    let userId: string | null = null

    const user = await requireAuthUser(request)
    if (user) {
      userId = user.id
    }

    // Prefer to revoke by sid (covers both active session and all its refresh tokens atomically).
    const sid = user?.sid
    if (sid) {
      await revokeSession(sid)
    } else if (raw) {
      // Fallback: no sid available (expired access token). Look up the session via the refresh token.
      const tokenHash = hashRefreshToken(raw)
      const rt = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { sessionId: true }
      })
      if (rt?.sessionId) {
        await revokeSession(rt.sessionId)
      } else {
        // Last resort: revoke just this refresh token by hash.
        await prisma.refreshToken.updateMany({
          where: { tokenHash, revokedAt: null },
          data: { revokedAt: new Date() }
        })
      }
    }

    await writeAuditLog({
      request,
      userId,
      action: "LOGOUT",
      entityType: "USER",
      entityId: userId,
      newValue: { result: "success" },
    })

    const res = NextResponse.json({ success: true })
    clearAccessTokenCookie(res)
    clearRefreshTokenCookie(res)
    return res
  } catch (e) {
    console.error("auth logout error", e)
    await writeAuditLog({
      request,
      userId: null,
      action: "LOGOUT",
      entityType: "USER",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
