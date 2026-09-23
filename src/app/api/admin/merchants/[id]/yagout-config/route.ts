import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import { encryptMerchantSecretAtRest } from "@/lib/merchant-secret"
import { auditSecurityEvent, requireCsrf } from "@/lib/request-security"
import { isValidYagoutKey } from "@/lib/yagout-crypto"

/**
 * Per-merchant YagoutPay credentials. A merchant with its own me_id here has
 * payments settled to its own Yagout account; merchants without one fall back to
 * the platform-wide YAGOUT_* env credentials. See resolveYagoutConfigForMerchant.
 *
 * The encryption key is write-only: it goes in encrypted and is never returned,
 * the same contract as mpgsPassword and jweSecret.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuthUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!userHasPermission(user, "MERCHANT_APPROVE")) {
    return NextResponse.json({ error: "Permission denied: MERCHANT_APPROVE required" }, { status: 403 })
  }

  const { id } = await params
  const merchant = await db.getMerchantById(id)
  if (!merchant) return NextResponse.json({ error: "Merchant not found" }, { status: 404 })

  return NextResponse.json({
    configured: Boolean(merchant.yagoutMeId),
    yagoutMeId: merchant.yagoutMeId ?? null,
    yagoutPostUrl: merchant.yagoutPostUrl ?? null,
  })
}

const YagoutConfigSchema = z.object({
  // Yagout issues numeric merchant ids, but they are identifiers rather than
  // numbers — kept as a string so a leading zero can never be lost.
  yagoutMeId: z.string().trim().min(1).max(20),
  // Optional on update: omit to keep the currently stored key unchanged.
  yagoutEncryptionKey: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(isValidYagoutKey, {
      message: "Encryption key must be base64 that decodes to exactly 32 bytes (AES-256).",
    })
    .optional(),
  yagoutPostUrl: z.string().trim().url().optional().or(z.literal("")),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = await requireCsrf(request)
  if (csrfError) return csrfError

  const user = await requireAuthUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!userHasPermission(user, "MERCHANT_APPROVE")) {
    return NextResponse.json({ error: "Permission denied: MERCHANT_APPROVE required" }, { status: 403 })
  }

  const { id } = await params
  const merchant = await db.getMerchantById(id, { includeSecret: true })
  if (!merchant) return NextResponse.json({ error: "Merchant not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = YagoutConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }

  if (!parsed.data.yagoutEncryptionKey && !merchant.yagoutEncryptionKey) {
    return NextResponse.json(
      { error: "yagoutEncryptionKey is required the first time this merchant's gateway is configured." },
      { status: 400 },
    )
  }

  await db.updateMerchant(id, {
    yagoutMeId: parsed.data.yagoutMeId,
    ...(parsed.data.yagoutEncryptionKey
      ? { yagoutEncryptionKey: encryptMerchantSecretAtRest(parsed.data.yagoutEncryptionKey).ciphertext }
      : {}),
    yagoutPostUrl: parsed.data.yagoutPostUrl || null,
  })

  await auditSecurityEvent({
    action: "MERCHANT_YAGOUT_CONFIG_UPDATED",
    merchantId: id,
    userId: user.id,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
    detail: {
      yagoutMeId: parsed.data.yagoutMeId,
      keyRotated: Boolean(parsed.data.yagoutEncryptionKey),
    },
  })

  return NextResponse.json({ configured: true, yagoutMeId: parsed.data.yagoutMeId })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = await requireCsrf(request)
  if (csrfError) return csrfError

  const user = await requireAuthUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!userHasPermission(user, "MERCHANT_APPROVE")) {
    return NextResponse.json({ error: "Permission denied: MERCHANT_APPROVE required" }, { status: 403 })
  }

  const { id } = await params
  const merchant = await db.getMerchantById(id)
  if (!merchant) return NextResponse.json({ error: "Merchant not found" }, { status: 404 })

  // Clears this merchant's own Yagout account; payments fall back to the platform-wide one.
  await db.updateMerchant(id, {
    yagoutMeId: null,
    yagoutEncryptionKey: null,
    yagoutPostUrl: null,
  })

  await auditSecurityEvent({
    action: "MERCHANT_YAGOUT_CONFIG_CLEARED",
    merchantId: id,
    userId: user.id,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  })

  return NextResponse.json({ configured: false })
}
