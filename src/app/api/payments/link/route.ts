import { NextResponse } from "next/server"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { requireAuthUser } from "@/lib/request-auth"
import { db } from "@/app/lib/db"
import { decryptPayload } from "@/lib/jwe"
import { withMerchantSecret } from "@/lib/merchant-secret"
import { auditSecurityEvent, enforceReplayProtection, verifyHmacSignature } from "@/lib/request-security"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/audit-log"
import { createOpaqueToken } from "@/lib/opaque-tokens"
import {
  createMpgsPaymentLink,
  mpgsAllowedAttempts,
  mpgsLinkLifetimeMs,
} from "@/lib/mpgs-client"

export async function POST(request: Request) {
  let actorUserId: string | null = null
  try {
    let authenticatedMerchantId: string | null = null
    let initiatedBy: { id: string; name?: string } | undefined
    let paymentInput: any = null

    const sessionUser = await requireAuthUser(request)
    if (sessionUser) {
      const body = await request.json().catch(() => ({}))
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
      const salesTeamMemberId = (sessionUser as { teamMemberId?: string }).teamMemberId
      initiatedBy = {
        id:
          sessionUser.role === "SALES" && salesTeamMemberId
            ? salesTeamMemberId
            : sessionUser.id,
        name: sessionUser.name ?? undefined,
      }
      actorUserId = sessionUser.id
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
        const { authenticatedMerchantId: authId, paymentInput: input, initiatedBy: initBy, actorUserId: actorId, errorResponse } = await withMerchantSecret(merchant.jweSecret, async (merchantSecret) => {
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
            return { errorResponse: NextResponse.json({ error: "Invalid signature" }, { status: 401 }) }
          }

          const decrypted = await decryptPayload(encryptedPayload, merchantSecret)
          const decryptedParsed = PaymentInitiateSchema.safeParse(decrypted)
          if (!decryptedParsed.success) {
            return { errorResponse: NextResponse.json({ error: "Invalid encrypted payload", details: decryptedParsed.error.flatten() }, { status: 400 }) }
          }
          if (merchantIdHeader !== decryptedParsed.data.merchantId) {
            return { errorResponse: NextResponse.json({ error: "Merchant ID mismatch" }, { status: 400 }) }
          }

          return {
            authenticatedMerchantId: merchant.id,
            paymentInput: decryptedParsed.data,
            initiatedBy: { id: `api_${merchant.id}`, name: `API (${merchant.name})` },
            actorUserId: `api_${merchant.id}`
          }
        })

        if (errorResponse) return errorResponse
        authenticatedMerchantId = authId!
        paymentInput = input!
        initiatedBy = initBy!
        actorUserId = actorId!
      } else {
        return NextResponse.json({
          error: "Missing required security headers. Required: x-merchant-id, x-signature, x-timestamp, x-nonce, x-encrypted-payload",
        }, { status: 401 })
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
          merchantId: paymentInput.merchantId,
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

    const merchant = await db.getMerchantById(paymentInput.merchantId)

    if (paymentInput.method === "TELEBIRR") {
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
          merchantId: paymentInput.merchantId,
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

    if (paymentInput.method === "MPGS") {
      const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, "")
      const orderId = `ORDER-${result.transactionReference}`
      const allowedAttempts = mpgsAllowedAttempts()

      const linkExpiresAt = new Date(Date.now() + mpgsLinkLifetimeMs()).toISOString()

      const linkErrorToken = await createOpaqueToken(
        "PAYMENT",
        {
          purpose: "MPGS_LINK_ERROR",
          transactionId: result.tx.id,
          transactionReference: result.transactionReference,
        },
        new Date(linkExpiresAt)
      )

      let mpgs: Awaited<ReturnType<typeof createMpgsPaymentLink>>
      try {
        mpgs = await createMpgsPaymentLink({
          orderId,
          amount: result.tx.amount,
          currency: process.env.MPGS_CURRENCY?.trim() || "USD",
          description: result.tx.serviceDescription,
          merchantName: merchant?.name ?? "Merchant",
          merchantUrl: baseUrl,
          errorUrl: `${baseUrl}/api/payments/mpgs/link-error?t=${linkErrorToken}`,
          expiryDateTime: linkExpiresAt,
          numberOfAllowedAttempts: allowedAttempts,
        })
      } catch (configError) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "PAYMENT_LINK_CREATE",
          entityType: "TRANSACTION",
          entityId: result.tx.id,
          newValue: {
            result: "failed",
            reason: "MPGS_NOT_CONFIGURED",
            merchantId: paymentInput.merchantId,
            transactionReference: result.transactionReference,
          },
        })
        return NextResponse.json({ error: "Mastercard gateway is not configured." }, { status: 503 })
      }

      if (!mpgs.ok) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "PAYMENT_LINK_CREATE",
          entityType: "TRANSACTION",
          entityId: result.tx.id,
          newValue: {
            result: "failed",
            reason: "MPGS_LINK_FAILED",
            error: mpgs.error,
            merchantId: paymentInput.merchantId,
            merchantName: merchant?.name,
            transactionReference: result.transactionReference,
            orderId,
          },
        })
        return NextResponse.json({ error: mpgs.error }, { status: 502 })
      }

      // Record the gateway order so settlement (RETRIEVE_ORDER) can find it later,
      // and correct the link expiry to the gateway's own window.
      await db.updateTransaction(result.tx.id, {
        userCredentials: {
          ...result.tx.userCredentials,
          mpgs: {
            orderId,
            paymentLinkId: mpgs.paymentLinkId ?? null,
            paymentLinkUrl: mpgs.paymentLinkUrl,
            successIndicator: mpgs.successIndicator ?? null,
            expiresAt: linkExpiresAt,
            createdAt: new Date().toISOString(),
          },
          link: {
            ...((result.tx.userCredentials as Record<string, any>)?.link ?? {}),
            expiresAt: linkExpiresAt,
            status: "PENDING",
          },
        },
      })

      let emailSent = false
      let emailError: string | null = null
      if (paymentInput.sendEmail) {
        const { sendPaymentLinkEmail } = await import("@/lib/notifications")
        const delivery = await sendPaymentLinkEmail({
          to: paymentInput.customerEmail!,
          merchantName: merchant?.name ?? "Merchant",
          amount: result.tx.amount,
          currency: process.env.MPGS_CURRENCY?.trim() || "USD",
          description: result.tx.serviceDescription,
          paymentUrl: mpgs.paymentLinkUrl,
          expiresAt: linkExpiresAt,
        })
        emailSent = delivery.ok
        emailError = delivery.ok ? null : delivery.error
      }

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_LINK_CREATE",
        entityType: "TRANSACTION",
        entityId: result.tx.id,
        newValue: {
          result: "success",
          status: result.tx.status,
          paymentMethod: "MPGS",
          merchantId: paymentInput.merchantId,
          merchantName: merchant?.name,
          transactionId: result.tx.id,
          transactionReference: result.transactionReference,
          amount: result.tx.amount,
          orderId,
          mpgsSessionId: mpgs.sessionId,
          emailRequested: Boolean(paymentInput.sendEmail),
          emailSent,
          emailError,
        },
      })

      if (paymentInput.sendEmail && !emailSent) {
        return NextResponse.json(
          {
            error: emailError ?? "Could not send the payment link email.",
            transactionReference: result.transactionReference,
            linkCreated: true,
          },
          { status: 502 }
        )
      }

      return NextResponse.json({
        transactionId: result.tx.id,
        transactionReference: result.transactionReference,
        status: result.tx.status,
        paymentUrl: mpgs.paymentLinkUrl,
        orderId,
        emailSent,
        sentTo: emailSent ? paymentInput.customerEmail : undefined,
      })
    }

    const token = result.token
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
    const { generatePaymentLink } = await import('@/lib/notifications')
    const paymentUrl = await generatePaymentLink(token)

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
        paymentMethod: paymentInput.method,
        merchantId: paymentInput.merchantId,
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
