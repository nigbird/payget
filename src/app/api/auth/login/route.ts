import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/app/lib/db"
import { prisma } from "@/lib/prisma"
import {
  generateRefreshTokenValue,
  hashRefreshToken,
  computeRefreshTokenExpiresAt,
  signAccessToken,
  accessTokenTtlSeconds
} from "@/lib/token-auth"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/audit-log"

function normalizeLoginIdentifier(value: string) {
  const v = value.trim()
  if (v.includes("@")) return v.toLowerCase()
  return v.replace(/[\s\-\(\)]/g, "")
}

function refreshCookieName() {
  return process.env.REFRESH_TOKEN_COOKIE_NAME || "refresh_token"
}

function isProd() {
  return process.env.NODE_ENV === "production"
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!identifier || !password) {
      await writeAuditLog({
        request,
        userId: null,
        action: "LOGIN_FAILURE",
        entityType: "USER",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "MISSING_FIELDS",
          identifier: identifier ? identifier.substring(0, 20) + "..." : null,
        },
      })
      return NextResponse.json({ error: "identifier and password are required" }, { status: 400 })
    }

    let user = await db.findUserByEmail(identifier)

    // Fallback: allow merchant login by contact username (email or phone).
    if (!user) {
      const merchant = await db.findMerchantByIdentifier(identifier)
      if (merchant?.id) {
        user = await db.findMerchantUserByMerchantId(merchant.id)
      }
    }

    if (!user || !user.password) {
      await writeAuditLog({
        request,
        userId: null,
        action: "LOGIN_FAILURE",
        entityType: "USER",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "USER_NOT_FOUND",
          identifier: identifier.substring(0, 20) + "...",
        },
      })
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    // If the user is a merchant, ensure the merchant account is ACTIVE and username matches.
    if ((user as any).role === "MERCHANT" && (user as any).merchantId) {
      if ((user as any).merchant?.status !== "ACTIVE") {
        await writeAuditLog({
          request,
          userId: user.id,
          action: "LOGIN_FAILURE",
          entityType: "USER",
          entityId: user.id,
          newValue: {
            result: "failed",
            reason: "ACCOUNT_NOT_ACTIVE",
            merchantId: (user as any).merchantId,
            merchantName: (user as any).merchant?.name,
          },
        })
        return NextResponse.json({ error: "Account not active" }, { status: 401 })
      }

      const currentUsername = (user as any).merchant?.contactUsername
      if (!currentUsername) {
        await writeAuditLog({
          request,
          userId: user.id,
          action: "LOGIN_FAILURE",
          entityType: "USER",
          entityId: user.id,
          newValue: {
            result: "failed",
            reason: "INVALID_CREDENTIALS",
          },
        })
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
      }
      const provided = normalizeLoginIdentifier(identifier)
      const expected = normalizeLoginIdentifier(currentUsername)
      if (provided !== expected) {
        await writeAuditLog({
          request,
          userId: user.id,
          action: "LOGIN_FAILURE",
          entityType: "USER",
          entityId: user.id,
          newValue: {
            result: "failed",
            reason: "INVALID_CREDENTIALS",
          },
        })
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
      }
    }

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) {
      await writeAuditLog({
        request,
        userId: user.id,
        action: "LOGIN_FAILURE",
        entityType: "USER",
        entityId: user.id,
        newValue: {
          result: "failed",
          reason: "INCORRECT_PASSWORD",
        },
      })
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const permissions =
      (user as any).customRole?.permissions?.map((p: any) => p.permission?.name).filter(Boolean) || []

    const accessToken = await signAccessToken({
      sub: user.id,
      role: (user as any).role,
      merchantId: (user as any).merchantId,
      permissions,
      isHeadOffice: (user as any).isHeadOffice,
      district: (user as any).district,
      branch: (user as any).branch
    })

    const familyId = crypto.randomUUID()
    const refreshValue = generateRefreshTokenValue()
    const refreshHash = hashRefreshToken(refreshValue)
    const expiresAt = computeRefreshTokenExpiresAt()

    await prisma.refreshToken.create({
      data: {
        tokenHash: refreshHash,
        userId: user.id,
        familyId,
        expiresAt,
        userAgent: request.headers.get("user-agent") ?? undefined
      }
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "LOGIN_SUCCESS",
      entityType: "USER",
      entityId: user.id,
      newValue: {
        result: "success",
        role: (user as any).role,
        merchantId: (user as any).merchantId,
        merchantName: (user as any).merchant?.name,
      },
    })

    const res = NextResponse.json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: accessTokenTtlSeconds(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: (user as any).role,
        merchantId: (user as any).merchantId,
        permissions
      }
    })

    res.cookies.set({
      name: refreshCookieName(),
      value: refreshValue,
      httpOnly: true,
      secure: isProd(),
      sameSite: "lax",
      path: "/",
      expires: expiresAt
    })

    return res
  } catch (e) {
    console.error("auth login error", e)
    await writeAuditLog({
      request,
      userId: null,
      action: "LOGIN_FAILURE",
      entityType: "USER",
      entityId: null,
      newValue: {
        result: "failed",
        reason: "INTERNAL_ERROR",
      },
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

