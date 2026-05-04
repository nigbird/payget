import { NextResponse } from "next/server"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { requireAuthUser } from "@/lib/request-auth"
import { db } from "@/app/lib/db"
import { decryptPayload } from "@/lib/jwe"
import { decryptMerchantSecretInMemory } from "@/lib/merchant-secret"
import { auditSecurityEvent, enforceReplayProtection, verifyHmacSignature } from "@/lib/request-security"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))

    let authenticatedMerchantId: string | null = null
    let initiatedBy: { id: string; name?: string } | undefined
    let paymentInput: any = null

    // 1. Try Session/Bearer Auth first
    const sessionUser = await requireAuthUser(request)
    if (sessionUser) {
      const parsed = PaymentInitiateSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
      }
      const isAssignedMerchant =
        sessionUser.merchantId === parsed.data.merchantId ||
        sessionUser.assignedMerchantIds?.includes(parsed.data.merchantId)

      if (
        (sessionUser.role === 'MERCHANT' && sessionUser.merchantId !== parsed.data.merchantId) ||
        (sessionUser.role === 'SALES' && !isAssignedMerchant)
      ) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      
      authenticatedMerchantId = parsed.data.merchantId
      paymentInput = parsed.data
      initiatedBy = {
        id: sessionUser.id,
        name: sessionUser.name ?? undefined,
      }
    } else {
      // Signature auth requires encrypted JWE payload + HMAC + anti-replay headers.
      const merchantIdHeader = request.headers.get("x-merchant-id")
      const signatureHeader = request.headers.get("x-signature")
      const timestampHeader = request.headers.get("x-timestamp")
      const nonceHeader = request.headers.get("x-nonce")
      const encryptedPayload = request.headers.get("x-encrypted-payload")

      if (merchantIdHeader && signatureHeader && timestampHeader && nonceHeader && encryptedPayload) {
        await enforceReplayProtection(merchantIdHeader, nonceHeader, timestampHeader)

        const merchant = await db.getMerchantById(merchantIdHeader, { includeSecret: true })
        if (!merchant) {
          return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
        }
        const { plaintext: merchantSecret } = decryptMerchantSecretInMemory(merchant.jweSecret)

        const path = new URL(request.url).pathname
        if (
          !verifyHmacSignature({
            method: request.method,
            path,
            timestamp: timestampHeader,
            nonce: nonceHeader,
            encryptedPayload,
            merchantSecret,
            signature: signatureHeader,
          })
        ) {
          await auditSecurityEvent({ action: "PAYMENT_API_SIGNATURE_INVALID", merchantId: merchant.id, detail: { path } })
          return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
        }

        const decrypted = await decryptPayload(encryptedPayload, merchantSecret)
        const parsed = PaymentInitiateSchema.safeParse(decrypted)
        if (!parsed.success) {
          return NextResponse.json({ error: "Invalid encrypted payload", details: parsed.error.flatten() }, { status: 400 })
        }
        if (merchantIdHeader !== parsed.data.merchantId) {
          return NextResponse.json({ error: "Merchant ID mismatch" }, { status: 400 })
        }

        authenticatedMerchantId = merchant.id
        paymentInput = parsed.data
        initiatedBy = { id: `api_${merchant.id}`, name: `API (${merchant.name})` }
      } else {
        return NextResponse.json({
          error: "Missing required security headers. Required: x-merchant-id, x-signature, x-timestamp, x-nonce, x-encrypted-payload",
        }, { status: 401 })
      }
    }

    if (!authenticatedMerchantId) {
      return NextResponse.json({ error: 'Unauthorized: Session or valid signature required' }, { status: 401 })
    }

    const result = await createGatewayTransactionAndToken(paymentInput, { initiatedBy })
    if (!result.ok) {
      const status =
        result.error === "Merchant not found"
          ? 404
          : result.error === "Merchant account is not active"
            ? 403
            : result.error === "Transaction ID already exists"
              ? 409
              : 400

      return NextResponse.json({ error: result.error, limit: (result as any).limit }, { status })
    }

    if (paymentInput.method === "TELEBIRR") {
      console.log('Telebirr payment link requested (not yet available)')
      return NextResponse.json({ 
        message: "Telebirr integration is coming soon.",
        transactionReference: result.transactionReference,
        status: "pending"
      }, { status: 202 })
    }

    const token = result.token
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
    const paymentUrl = `${baseUrl}/pay/link?token=${encodeURIComponent(token)}`

    return NextResponse.json({
      transactionId: result.tx.id,
      transactionReference: result.transactionReference,
      status: result.tx.status,
      paymentUrl,
      token,
    })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Nonce") ||
        error.message.includes("timestamp") ||
        error.message.includes("signature"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

