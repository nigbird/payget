import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashRefreshToken } from "@/lib/token-auth"

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

    if (raw) {
      const tokenHash = hashRefreshToken(raw)
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    }

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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

