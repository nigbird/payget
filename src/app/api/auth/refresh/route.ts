import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { setAccessTokenCookie } from "@/lib/access-token-cookie"
import {
  accessTokenTtlSeconds,
  computeRefreshTokenExpiresAt,
  generateRefreshTokenValue,
  hashRefreshToken,
  signAccessToken,
  SALES_ACCESS_TOKEN_TTL_SECONDS
} from "@/lib/token-auth"
import { touchSession, revokeSession } from "@/lib/session-manager"
import {
  refreshTokenCookieName,
  setRefreshTokenCookie
} from "@/lib/refresh-token-cookie"
import { requireCsrf } from '@/lib/request-security';

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const name = refreshTokenCookieName()
    const raw = (request as NextRequest).cookies.get(name)?.value || ""

    if (!raw) return NextResponse.json({ error: "Missing refresh token" }, { status: 401 })

    const tokenHash = hashRefreshToken(raw)
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        session: {
          select: { id: true, revokedAt: true, expiresAt: true }
        },
        teamMember: {
          include: { merchant: { select: { id: true, name: true, status: true } } }
        },
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

    // Expired refresh token.
    if (existing.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Refresh token expired" }, { status: 401 })
    }

    // Reuse detection: token is already revoked — attacker may hold an old token.
    if (existing.revokedAt) {
      // Revoke entire family and the associated session to cut off the attacker.
      await prisma.$transaction([
        prisma.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt: new Date() }
        }),
        ...(existing.sessionId
          ? [
              prisma.activeSession.updateMany({
                where: { id: existing.sessionId, revokedAt: null },
                data: { revokedAt: new Date() }
              })
            ]
          : [])
      ])
      return NextResponse.json({ error: "Refresh token reuse detected" }, { status: 401 })
    }

    // Validate the associated session.
    if (existing.sessionId) {
      const session = existing.session
      if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
        // Session is gone; revoke this orphaned token too.
        await prisma.refreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() }
        })
        return NextResponse.json({ error: "Session expired or revoked" }, { status: 401 })
      }
    }

    const user = existing.user
    const teamMember = existing.teamMember
    if (!user && !teamMember) {
      return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 })
    }

    const sid = existing.sessionId ?? ""
    let accessToken: string
    let expiresIn: number

    if (teamMember) {
      // Re-check membership on every refresh: deactivating a team member or their
      // merchant now takes effect within one access-token lifetime instead of never.
      if (teamMember.status !== "ACTIVE" || teamMember.merchant?.status !== "ACTIVE") {
        if (sid) await revokeSession(sid)
        return NextResponse.json({ error: "Membership is no longer active" }, { status: 401 })
      }

      // Recompute assignments so merchants added/removed since login are reflected.
      const activeMemberships = teamMember.phone
        ? await prisma.merchantTeamMember.findMany({
            where: {
              phone: teamMember.phone,
              status: "ACTIVE",
              merchant: { status: "ACTIVE" }
            },
            include: { merchant: { select: { id: true, name: true } } }
          })
        : [teamMember]

      const assignedMerchantIds = Array.from(
        new Set(activeMemberships.map((m) => m.merchantId))
      )
      const assignedMerchants = activeMemberships
        .filter((m) => (m as any).merchant)
        .map((m) => ({ id: m.merchantId, name: (m as any).merchant.name as string }))

      expiresIn = SALES_ACCESS_TOKEN_TTL_SECONDS
      accessToken = await signAccessToken(
        {
          sub: `sales-${teamMember.phone ?? teamMember.id}`,
          sid,
          role: "SALES",
          merchantId: teamMember.merchantId,
          assignedMerchantIds,
          assignedMerchants,
          permissions: [],
          teamRole: String(teamMember.role).toLowerCase(),
          teamMemberId: teamMember.id
        },
        SALES_ACCESS_TOKEN_TTL_SECONDS
      )
    } else {
      const permissions =
        (user as any).customRole?.permissions?.map((p: any) => p.permission?.name).filter(Boolean) || []

      expiresIn = accessTokenTtlSeconds()
      accessToken = await signAccessToken({
        sub: user!.id,
        sid,
        role: (user as any).role,
        merchantId: (user as any).merchantId,
        permissions,
        isHeadOffice: (user as any).isHeadOffice,
        district: (user as any).district,
        branch: (user as any).branch,
        sessionVersion: user!.sessionVersion
      })
    }

    const newRefresh = generateRefreshTokenValue()
    const newHash = hashRefreshToken(newRefresh)
    const newExpiresAt = computeRefreshTokenExpiresAt()

    const created = await prisma.$transaction(async (tx) => {
      const next = await tx.refreshToken.create({
        data: {
          tokenHash: newHash,
          userId: existing.userId,
          teamMemberId: existing.teamMemberId,
          sessionId: existing.sessionId,
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

    // Update session activity timestamp without blocking the response.
    if (sid) touchSession(sid)

    const res = NextResponse.json({ expiresIn })

    await setAccessTokenCookie(res, accessToken, expiresIn)
    setRefreshTokenCookie(res, newRefresh, created.expiresAt)

    return res
  } catch (e) {
    console.error("auth refresh error", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
