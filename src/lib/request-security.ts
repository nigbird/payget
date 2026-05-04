import crypto from "crypto"
import { prisma } from "@/lib/prisma"

const REPLAY_WINDOW_MS = Number(process.env.REQUEST_REPLAY_WINDOW_MS ?? 5 * 60 * 1000)

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
