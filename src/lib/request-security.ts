import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

const REPLAY_WINDOW_MS = Number(process.env.REQUEST_REPLAY_WINDOW_MS ?? 5 * 60 * 1000)

function createHash(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex")
}

function randomString(length: number) {
  return crypto.randomBytes(length).toString("hex")
}

export async function verifyCsrfToken(request: Request): Promise<boolean> {
  try {
    const cookieName = "next-auth.csrf-token"
    const cookieValue = request.headers.get("cookie")?.split("; ").find(c => c.startsWith(`${cookieName}=`))?.split("=")[1]
    
    if (!cookieValue) {
      return false
    }

    const [csrfToken, csrfTokenHash] = decodeURIComponent(cookieValue).split("|")
    const expectedCsrfTokenHash = createHash(`${csrfToken}${process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || ""}`)
    if (csrfTokenHash !== expectedCsrfTokenHash) {
      return false
    }

    let bodyCsrfToken: string | undefined
    const contentType = request.headers.get("content-type")
    if (contentType?.includes("application/json")) {
      try {
        const clonedRequest = request.clone()
        const body = await clonedRequest.json()
        bodyCsrfToken = body.csrfToken
      } catch {
      }
    } else if (contentType?.includes("application/x-www-form-urlencoded") || contentType?.includes("multipart/form-data")) {
      try {
        const clonedRequest = request.clone()
        const formData = await clonedRequest.formData()
        bodyCsrfToken = formData.get("csrfToken") as string | undefined
      } catch {
      }
    }
    
    const headerCsrfToken = request.headers.get("x-csrf-token")
    
    const tokenFromRequest = bodyCsrfToken || headerCsrfToken
    
    if (tokenFromRequest) {
      return csrfToken === tokenFromRequest
    }
    
    return false
  } catch (error) {
    console.error("CSRF verification error:", error)
    return false
  }
}

export async function requireCsrf(request: Request): Promise<Response | null> {
  const isCsrfValid = await verifyCsrfToken(request)
  if (!isCsrfValid) {
    return NextResponse.json({ error: "CSRF token invalid or missing" }, { status: 403 })
  }
  return null
}

function safeEqualHex(a: string, b: string): boolean {
  const aa = Buffer.from(a, "hex")
  const bb = Buffer.from(b, "hex")
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb)
}

export async function enforceReplayProtection(merchantId: string, nonce: string, timestamp: string) {
  const ts = Date.parse(timestamp)
  if (Number.isNaN(ts)) {
    throw new Error("Invalid timestamp")
  }
  const delta = Math.abs(Date.now() - ts)
  if (delta > REPLAY_WINDOW_MS) {
    throw new Error("Request timestamp outside allowed window")
  }
  if (!nonce || nonce.length < 16) {
    throw new Error("Nonce is required and must be at least 16 characters")
  }

  const now = new Date()
  const expiresAt = new Date(ts + REPLAY_WINDOW_MS)

  await prisma.$transaction(async (tx) => {
    await tx.requestNonce.deleteMany({
      where: {
        expiresAt: { lt: now }
      }
    })

    const existing = await tx.requestNonce.findUnique({
      where: {
        merchantId_nonce: {
          merchantId,
          nonce
        }
      }
    })

    if (existing) {
      throw new Error("Nonce already used")
    }

    await tx.requestNonce.create({
      data: {
        merchantId,
        nonce,
        expiresAt,
        usedAt: now
      }
    })
  })
}

export function verifyHmacSignature({
  method,
  path,
  timestamp,
  nonce,
  encryptedPayload,
  merchantSecret,
  signature,
}: {
  method: string
  path: string
  timestamp: string
  nonce: string
  encryptedPayload: string
  merchantSecret: string
  signature: string
}): boolean {
  const canonical = [method.toUpperCase(), path, timestamp, nonce, encryptedPayload].join(".")
  const expected = crypto.createHmac("sha256", merchantSecret).update(canonical).digest("hex")
  return safeEqualHex(expected, signature.toLowerCase())
}

export async function auditSecurityEvent(input: {
  action: string
  merchantId?: string
  userId?: string
  ipAddress?: string | null
  userAgent?: string | null
  detail?: Record<string, unknown>
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: "SECURITY",
      entityId: input.merchantId ?? null,
      newValue: input.detail ?? undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  })
}
