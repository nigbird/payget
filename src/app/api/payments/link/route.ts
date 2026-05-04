import { NextResponse } from "next/server"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { requireAuthUser } from "@/lib/request-auth"
import { db } from "@/app/lib/db"
import { decryptPayload } from "@/lib/jwe"
import { decryptMerchantSecretInMemory } from "@/lib/merchant-secret"
import { auditSecurityEvent, enforceReplayProtection, verifyHmacSignature } from "@/lib/request-security"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/audit-log"

export async function POST(request: Request) {
  let actorUserId: string | null = null
  try {
    const body = await request.json().catch(() => ({}))
    const body = await request.json()
    const parsed = PaymentInitiateSchema.safeParse(body)
    if (!parsed.success) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_LINK_CREATE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "INVALID_PAYLOAD", details: parsed.error.flatten() },
      })
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
    }

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
      actorUserId = sessionUser.id
      const isAssignedMerchant =
        sessionUser.merchantId === parsed.data.merchantId ||
        sessionUser.assignedMerchantIds?.includes(parsed.data.merchantId)

      if (
        (sessionUser.role === 'MERCHANT' && sessionUser.merchantId !== parsed.data.merchantId) ||
        (sessionUser.role === 'SALES' && !isAssignedMerchant)
      ) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "PAYMENT_LINK_CREATE",
          entityType: "TRANSACTION",
          entityId: null,
          newValue: { result: "failed", reason: "FORBIDDEN" },
        })
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
          await writeAuditLog({
            request,
            userId: actorUserId,
            action: "PAYMENT_LINK_CREATE",
            entityType: "TRANSACTION",
            entityId: null,
            newValue: { result: "failed", reason: "MERCHANT_ID_MISMATCH" },
          })
          return NextResponse.json({ error: "Merchant ID mismatch" }, { status: 400 })
        }

        const merchant = await db.getMerchantById(merchantIdHeader)
        if (!merchant) {
          await writeAuditLog({
            request,
            userId: actorUserId,
            action: "PAYMENT_LINK_CREATE",
            entityType: "TRANSACTION",
            entityId: null,
            newValue: { result: "failed", reason: "MERCHANT_NOT_FOUND" },
          })
          return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
        }

        // Verify HMAC signature: HMAC-SHA256(JSON.stringify(body), jweSecret)
        const expectedSignature = crypto
          .createHmac("sha256", merchant.jweSecret)
          .update(JSON.stringify(body))
          .digest("hex")

        if (signatureHeader !== expectedSignature) {
          actorUserId = `api_${merchantIdHeader}`
          await writeAuditLog({
            request,
            userId: actorUserId,
            action: "PAYMENT_LINK_CREATE",
            entityType: "TRANSACTION",
            entityId: null,
            newValue: { result: "failed", reason: "INVALID_SIGNATURE" },
          })
          return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
        }

        authenticatedMerchantId = merchant.id
        paymentInput = parsed.data
        initiatedBy = { id: `api_${merchant.id}`, name: `API (${merchant.name})` }
      } else {
        return NextResponse.json({
          error: "Missing required security headers. Required: x-merchant-id, x-signature, x-timestamp, x-nonce, x-encrypted-payload",
        }, { status: 401 })
        actorUserId = initiatedBy.id
      }
    }

    if (!authenticatedMerchantId) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_LINK_CREATE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      })
      return NextResponse.json({ error: 'Unauthorized: Session or valid signature required' }, { status: 401 })
    }

    const result = await createGatewayTransactionAndToken(paymentInput, { initiatedBy })
    if (!result.ok) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_LINK_CREATE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { 
          result: "failed", 
          reason: "GATEWAY_TRANSACTION_FAILED", 
          error: result.error, 
          limit: (result as any).limit,
          merchantId: parsed.data.merchantId,
        },
      })
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
    const merchant = await db.getMerchantById(parsed.data.merchantId);

    if (parsed.data.method === "TELEBIRR") {
      console.log('Telebirr payment link requested (not yet available)')

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_LINK_CREATE",
        entityType: "TRANSACTION",
        entityId: result.tx.id,
        newValue: { 
          result: "success", 
          method: "TELEBIRR", 
          status: "pending",
          merchantId: parsed.data.merchantId,
          merchantName: merchant?.name,
          transactionId: result.tx.id,
          transactionReference: result.transactionReference,
          amount: result.tx.amount,
        },
      })

      return NextResponse.json({ 
        message: "Telebirr integration is coming soon.",
        transactionReference: result.transactionReference,
        status: "pending"
      }, { status: 202 })
    }

    const token = result.token
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
    const paymentUrl = `${baseUrl}/pay/link?token=${encodeURIComponent(token)}`

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "PAYMENT_LINK_CREATE",
      entityType: "TRANSACTION",
      entityId: result.tx.id,
      oldValue: null,
      newValue: {
        result: "success",
        status: result.tx.status,
        paymentMethod: parsed.data.method,
        merchantId: parsed.data.merchantId,
        merchantName: merchant?.name,
        transactionId: result.tx.id,
        transactionReference: result.transactionReference,
        amount: result.tx.amount,
      },
    })

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
    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "PAYMENT_LINK_CREATE",
      entityType: "TRANSACTION",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
