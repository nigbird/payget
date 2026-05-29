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
import { requireCsrf } from '@/lib/request-security';
import {
  type ActiveLockout,
  checkIpLockout,
  checkLoginIdentifierLockout,
  recordFailedLoginAttempt,
  resetIpLockout,
  resetLoginIdentifierLockout,
  resetUserLockout,
} from "@/lib/rate-limit";
import { normalizeLoginIdentifierForLockout } from "@/lib/login-identifier-normalize";

function lockoutResponseIp(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: "Too many failed login attempts from this network. Try again after the cooldown.",
      code: "IP_LOCKOUT" as const,
      retryAfterSeconds,
    },
    { status: 429 }
  )
}

function lockoutResponseIdentifier(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: "Too many failed attempts for this login. Try again after the cooldown.",
      code: "IDENTIFIER_LOCKOUT" as const,
      retryAfterSeconds,
    },
    { status: 429 }
  )
}

function firstLockoutResponse(ip: ActiveLockout, identifier: ActiveLockout) {
  if (ip.locked) return lockoutResponseIp(ip.retryAfterSeconds)
  if (identifier.locked) return lockoutResponseIdentifier(identifier.retryAfterSeconds)
  return null
}

function refreshCookieName() {
  return process.env.REFRESH_TOKEN_COOKIE_NAME || "refresh_token"
}

function isProd() {
  return process.env.NODE_ENV === "production"
}

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const xForwardedFor = request.headers.get("x-forwarded-for")
    const ip = xForwardedFor ? xForwardedFor.split(",")[0].trim() : "127.0.0.1"
    
    console.log('[Login] Login attempt from IP: %s', ip)

    const ipLockout = await checkIpLockout(ip)
    if (ipLockout.locked) {
      console.log('[Login] IP %s is currently locked', ip)
      return lockoutResponseIp(ipLockout.retryAfterSeconds)
    }

    const body = await request.json().catch(() => ({}))
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : ""
    const password = typeof body.password === "string" ? body.password : ""
    const normalizedKey = normalizeLoginIdentifierForLockout(identifier)

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

    const identifierLockoutEarly = await checkLoginIdentifierLockout(normalizedKey)
    if (identifierLockoutEarly.locked) {
      return lockoutResponseIdentifier(identifierLockoutEarly.retryAfterSeconds)
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
      const after = await recordFailedLoginAttempt(ip, normalizedKey)
      const lr = firstLockoutResponse(after.ip, after.identifier)
      if (lr) return lr
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
        const after = await recordFailedLoginAttempt(ip, normalizedKey)
        const lr = firstLockoutResponse(after.ip, after.identifier)
        if (lr) return lr
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
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
        const after = await recordFailedLoginAttempt(ip, normalizedKey)
        const lr = firstLockoutResponse(after.ip, after.identifier)
        if (lr) return lr
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
      }
      const provided = normalizeLoginIdentifierForLockout(identifier)
      const expected = normalizeLoginIdentifierForLockout(currentUsername)
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
        const after = await recordFailedLoginAttempt(ip, normalizedKey)
        const lr = firstLockoutResponse(after.ip, after.identifier)
        if (lr) return lr
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
      }
    }

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) {
      console.log('[Login] Password mismatch for user: %s', user.id)
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
      const after = await recordFailedLoginAttempt(ip, normalizedKey)
      const lr = firstLockoutResponse(after.ip, after.identifier)
      if (lr) return lr
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

    await resetIpLockout(ip)
    await resetLoginIdentifierLockout(normalizedKey)
    await resetUserLockout(user.id)

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

