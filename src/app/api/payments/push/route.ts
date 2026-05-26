import { NextResponse } from "next/server"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { requireAuthUser } from "@/lib/request-auth"
import { sendProviderPushRequest } from "@/lib/provider-client"
import { db } from "@/app/lib/db"
import { prepareEncryptedPushRequest, sendPushToProvider, ProviderPushPayloadSchema } from "@/lib/provider-encryption"
import { decryptPayload } from "@/lib/jwe"
import { decryptMerchantSecretInMemory } from "@/lib/merchant-secret"
import { auditSecurityEvent, enforceReplayProtection, verifyHmacSignature } from "@/lib/request-security"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/audit-log"

export async function POST(request: Request) {
  let actorUserId: string | null = null
  let merchantIdForLog: string | null = null
  try {
    const body = await request.json().catch(() => ({}))

    let authenticatedMerchantId: string | null = null
    let initiatedBy: { id: string; name?: string } | undefined
    let paymentInput: any = null

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
      const salesTeamMemberId = (sessionUser as { teamMemberId?: string }).teamMemberId
      initiatedBy = {
        id:
          sessionUser.role === "SALES" && salesTeamMemberId
            ? salesTeamMemberId
            : sessionUser.id,
        name: sessionUser.name ?? undefined,
      }
      actorUserId = sessionUser.id
      merchantIdForLog = parsed.data.merchantId
    } else {
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
        actorUserId = initiatedBy.id
        merchantIdForLog = parsed.data.merchantId
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
      console.log('Telebirr push requested (not yet available)')
      await db.updateTransactionStatus(result.tx.id, "pending")
      return NextResponse.json({ 
        message: "Telebirr integration is coming soon.",
        transactionReference: result.transactionReference,
        status: "pending"
      }, { status: 202 })
    }

    const providerRequest = {
      transactionRef: result.transactionReference,
      customerPhone: paymentInput.userCredentials.phone,
      creditAccount: result.merchant.accountNumber,
      amount: paymentInput.amount,
      company: "NTMerchant",
      merchantName: result.merchant.name,
      description: paymentInput.description || paymentInput.serviceDescription,
      callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/provider/callback`
    }

    console.log('Starting legacy provider push request...')
    let providerResponse = await sendProviderPushRequest(providerRequest)
    console.log('Legacy provider response status:', providerResponse.statusCode)

    if (providerResponse.statusCode !== 200) {
      console.log('Legacy flow failed. Trying new encrypted provider flow...', {
        message: providerResponse.message,
        error: providerResponse.error,
        details: providerResponse.details
      })
      const providerPayload = ProviderPushPayloadSchema.parse({
        transactionRef: result.transactionReference,
        customerPhone: result.tx.userCredentials.phone,
        creditAccount: result.merchant.accountNumber,
        amount: result.tx.amount,
        company: "NTMerchant",
        merchantName: result.merchant.name,
        description: result.tx.description || result.tx.serviceDescription,
        callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/provider/callback`
      })

      const baseUrl = process.env.PROVIDER_BASE_URL!
      const username = process.env.PROVIDER_USERNAME!
      const password = process.env.PROVIDER_PASSWORD!
      const { request: encryptedRequest } = await prepareEncryptedPushRequest(providerPayload, baseUrl, username, password)

      providerResponse = await sendPushToProvider(encryptedRequest, baseUrl, username, password)
      console.log('New encrypted provider flow response status:', providerResponse.statusCode || (providerResponse as any).status)
    }

    if (providerResponse.statusCode !== 200 && (providerResponse as any).status !== 200) {
      console.error('All provider flows failed:', providerResponse)
      await db.updateTransactionStatus(result.tx.id, "failed")

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_PUSH",
        entityType: "TRANSACTION",
        entityId: result.tx.id,
        newValue: {
          result: "failed",
          reason: "PROVIDER_REJECTED",
          statusCode: providerResponse.statusCode || (providerResponse as any).status,
          merchantId: result.merchant.id,
          merchantName: result.merchant.name,
          transactionId: result.tx.id,
          transactionReference: result.transactionReference,
          amount: result.tx.amount,
        },
      })

      return NextResponse.json({ 
        error: providerResponse.message || "Provider rejected the request",
        details: providerResponse.details || providerResponse.error,
        statusCode: providerResponse.statusCode
      }, { status: 400 })
    }

    if (providerResponse.sharedSecret) {
      await db.updateTransaction(result.tx.id, {
        userCredentials: {
          ...result.tx.userCredentials,
          providerSharedSecret: providerResponse.sharedSecret
        }
      })
    }
    await db.updateTransactionStatus(result.tx.id, "awaiting_pin")

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "PAYMENT_PUSH",
      entityType: "TRANSACTION",
      entityId: result.tx.id,
      newValue: {
        result: "success",
        status: "awaiting_pin",
        merchantId: result.merchant.id,
        merchantName: result.merchant.name,
        transactionId: result.tx.id,
        transactionReference: result.transactionReference,
        amount: result.tx.amount,
      },
    })

    return NextResponse.json({
      transactionId: result.tx.id,
      transactionReference: result.transactionReference,
      status: "awaiting_pin",
      ussdInitiatedTo: result.tx.userCredentials.phone,
      message: providerResponse.details || "Push payment request initiated successfully.",
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
    console.error('Push payment error:', error)

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "PAYMENT_PUSH",
      entityType: "TRANSACTION",
      entityId: null,
      newValue: {
        result: "failed",
        reason: "INTERNAL_ERROR",
        merchantId: merchantIdForLog,
      },
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
