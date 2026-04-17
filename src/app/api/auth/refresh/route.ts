import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  accessTokenTtlSeconds,
  computeRefreshTokenExpiresAt,
  generateRefreshTokenValue,
  hashRefreshToken,
  signAccessToken
} from "@/lib/token-auth"

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

    if (!raw) return NextResponse.json({ error: "Missing refresh token" }, { status: 401 })

    const tokenHash = hashRefreshToken(raw)
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            merchant: true,
            customRole: {
              include: {
                permissions: { include: { permission: true } }
              }
            }
          }
        }
      }
    })

    if (!existing) return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 })

    // Expired
    if (existing.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Refresh token expired" }, { status: 401 })
    }

    // Reuse detection (token already rotated/revoked)
    if (existing.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() }
      })
      return NextResponse.json({ error: "Refresh token reuse detected" }, { status: 401 })
    }

    const user = existing.user
    if (!user) return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 })

    const permissions =
      (user as any).customRole?.permissions?.map((p: any) => p.permission?.name).filter(Boolean) || []

    const newRefresh = generateRefreshTokenValue()
    const newHash = hashRefreshToken(newRefresh)
    const newExpiresAt = computeRefreshTokenExpiresAt()

    const accessToken = await signAccessToken({
      sub: user.id,
      role: (user as any).role,
      merchantId: (user as any).merchantId,
      permissions,
      isHeadOffice: (user as any).isHeadOffice,
      district: (user as any).district,
      branch: (user as any).branch
    })

    const created = await prisma.$transaction(async (tx) => {
      const next = await tx.refreshToken.create({
        data: {
          tokenHash: newHash,
          userId: user.id,
          familyId: existing.familyId,
          expiresAt: newExpiresAt,
          userAgent: request.headers.get("user-agent") ?? undefined,
          ipAddress: request.headers.get("x-forwarded-for") ?? undefined
        }
      })

      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedById: next.id }
      })

      return next
    })

    const res = NextResponse.json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: accessTokenTtlSeconds()
    })

    res.cookies.set({
      name,
      value: newRefresh,
      httpOnly: true,
      secure: isProd(),
      sameSite: "lax",
      path: "/",
      expires: created.expiresAt
    })

    return res
  } catch (e) {
    console.error("auth refresh error", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

