import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import { encryptMerchantSecretAtRest } from "@/lib/merchant-secret"
import { auditSecurityEvent, requireCsrf } from "@/lib/request-security"

/**
 * Per-merchant MPGS (Mastercard Payment Gateway Services) gateway credentials.
 * A merchant with its own MPGS merchant id here settles card payments to its own
 * bank via its own Mastercard merchant profile; merchants without one fall back
 * to the platform-wide MPGS_* env credentials. See resolveMpgsConfigForMerchant.
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
    configured: Boolean(merchant.mpgsMerchantId),
    mpgsMerchantId: merchant.mpgsMerchantId ?? null,
    mpgsBaseUrl: merchant.mpgsBaseUrl ?? null,
    mpgsCurrency: merchant.mpgsCurrency ?? null,
  })
}

const MpgsConfigSchema = z.object({
  mpgsMerchantId: z.string().trim().min(1).max(200),
  // Optional on update: omit to keep the currently stored password unchanged.
  mpgsPassword: z.string().trim().min(1).max(200).optional(),
  mpgsBaseUrl: z.string().trim().url().optional().or(z.literal("")),
  mpgsCurrency: z.string().trim().length(3).optional().or(z.literal("")),
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
  const parsed = MpgsConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
  }

  if (!parsed.data.mpgsPassword && !merchant.mpgsPassword) {
    return NextResponse.json(
      { error: "mpgsPassword is required the first time this merchant's gateway is configured." },
      { status: 400 },
    )
  }

  await db.updateMerchant(id, {
    mpgsMerchantId: parsed.data.mpgsMerchantId,
    ...(parsed.data.mpgsPassword
      ? { mpgsPassword: encryptMerchantSecretAtRest(parsed.data.mpgsPassword).ciphertext }
      : {}),
    mpgsBaseUrl: parsed.data.mpgsBaseUrl || null,
    mpgsCurrency: parsed.data.mpgsCurrency ? parsed.data.mpgsCurrency.toUpperCase() : null,
  })

  await auditSecurityEvent({
    action: "MERCHANT_MPGS_CONFIG_UPDATED",
    merchantId: id,
    userId: user.id,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
    detail: {
      mpgsMerchantId: parsed.data.mpgsMerchantId,
      passwordRotated: Boolean(parsed.data.mpgsPassword),
    },
  })

  return NextResponse.json({ configured: true, mpgsMerchantId: parsed.data.mpgsMerchantId })
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

  // Clears this merchant's own gateway account; card payments fall back to the platform-wide one.
  await db.updateMerchant(id, {
    mpgsMerchantId: null,
    mpgsPassword: null,
    mpgsBaseUrl: null,
    mpgsCurrency: null,
  })

  await auditSecurityEvent({
    action: "MERCHANT_MPGS_CONFIG_CLEARED",
    merchantId: id,
    userId: user.id,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  })

  return NextResponse.json({ configured: false })
}
