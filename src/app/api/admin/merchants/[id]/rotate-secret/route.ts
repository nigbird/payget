import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import { generateJweSecret } from "@/lib/jwe"
import { encryptMerchantSecretAtRest } from "@/lib/merchant-secret"
import { auditSecurityEvent, requireCsrf } from "@/lib/request-security"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = await requireCsrf(request)
  if (csrfError) {
    return csrfError
  }

  const user = await requireAuthUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!userHasPermission(user, "MERCHANT_APPROVE")) {
    return NextResponse.json({ error: "Permission denied: MERCHANT_APPROVE required" }, { status: 403 })
  }

  const { id } = await params
  const merchant = await db.getMerchantById(id, { includeSecret: true })
  if (!merchant) return NextResponse.json({ error: "Merchant not found" }, { status: 404 })

  const newRawSecret = generateJweSecret()
  const encrypted = encryptMerchantSecretAtRest(newRawSecret)

  await db.updateMerchant(id, {
    jweSecret: encrypted.ciphertext,
  })

  await auditSecurityEvent({
    action: "MERCHANT_SECRET_ROTATED",
    merchantId: id,
    userId: user.id,
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
    detail: { rotatedByRole: user.role },
  })

  return NextResponse.json({
    merchantId: id,
    status: "rotated",
    rotatedAt: new Date().toISOString(),
    // Only returned once to allow out-of-band distribution to the merchant.
    newJweSecret: newRawSecret,
  })
}
