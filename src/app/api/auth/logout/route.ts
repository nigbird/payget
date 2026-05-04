import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashRefreshToken } from "@/lib/token-auth"
import { writeAuditLog } from "@/lib/audit-log"
import { requireAuthUser } from "@/lib/request-auth"

function refreshCookieName() {
  return process.env.REFRESH_TOKEN_COOKIE_NAME || "refresh_token"
}

function isProd() {
  return process.env.NODE_ENV === "production"
}

export async function POST(request: Request) {
  try {
    const name = refreshCookieName()
    const raw = (request as NextRequest).cookies.get(name)?.value || ""
    let userId: string | null = null

    const user = await requireAuthUser(request)
    if (user) {
      userId = user.id
    }

    if (raw) {
      const tokenHash = hashRefreshToken(raw)
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() }
      })
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
    res.cookies.set({
      name,
      value: "",
      httpOnly: true,
      secure: isProd(),
      sameSite: "lax",
      path: "/",
      expires: new Date(0)
    })
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

