import { NextResponse } from "next/server"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { requireAuthUser } from "@/lib/request-auth"
import { db } from "@/lib/db"
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
  positiveEnvNumber,
  resolveMpgsConfigForMerchant,
} from "@/lib/mpgs-client"
import { resolveYagoutConfigForMerchant, yagoutReturnUrls } from "@/lib/yagout-client"
import { encryptYagout, yagoutHash } from "@/lib/yagout-crypto"
import {
  buildHostedMerchantRequest,
  YAGOUT_CHANNEL_WEB,
  YAGOUT_COUNTRY,
  YAGOUT_CURRENCY,
  YAGOUT_TXN_TYPE,
} from "@/lib/yagout-request"

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

    if (paymentInput.method === "YAGOUT") {
      const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, "")

      // order_no is specified alphanumeric, and it is the only key correlating
      // Yagout's response back to us, so the transaction reference is used
      // as-is rather than given a prefix that could carry a hyphen.
      const orderNo = result.transactionReference

      // The same string is hashed and sent. Formatting it once and reusing it
      // is the point: a hash over "1" against a request carrying "1.00" is
      // rejected by the gateway with nothing to indicate why.
      const amount = result.tx.amount.toFixed(2)

      let config
      try {
        config = await resolveYagoutConfigForMerchant(paymentInput.merchantId)
      } catch (configError) {
        console.error("[YAGOUT] Configuration missing:", configError)
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "PAYMENT_LINK_CREATE",
          entityType: "TRANSACTION",
          entityId: result.tx.id,
          newValue: {
            result: "failed",
            reason: "YAGOUT_NOT_CONFIGURED",
            paymentMethod: "YAGOUT",
            merchantId: paymentInput.merchantId,
            transactionReference: result.transactionReference,
          },
        })
        return NextResponse.json({ error: "YagoutPay is not configured." }, { status: 503 })
      }

      const { successUrl, failureUrl } = yagoutReturnUrls(baseUrl)

      let merchantRequest: string
      let hash: string
      try {
        const plaintext = buildHostedMerchantRequest({
          txn: {
            agId: config.aggregatorId,
            meId: config.meId,
            orderNo,
            amount,
            country: YAGOUT_COUNTRY,
            currency: YAGOUT_CURRENCY,
            txnType: YAGOUT_TXN_TYPE,
            successUrl,
            failureUrl,
            channel: YAGOUT_CHANNEL_WEB,
          },
          cust: {
            emailId: paymentInput.customerEmail ?? "",
            mobileNo: paymentInput.userCredentials.phone ?? "",
            isLoggedIn: "Y",
          },
        })

        merchantRequest = encryptYagout(plaintext, config.encryptionKey)
        hash = yagoutHash(
          { meId: config.meId, orderNo, amount, country: YAGOUT_COUNTRY, currency: YAGOUT_CURRENCY },
          config.encryptionKey
        )
      } catch (buildError: any) {
        // A framing character in a free-text field, or a malformed key. Both
        // would otherwise reach the gateway as an opaque rejection.
        console.error("[YAGOUT] Could not build the request:", buildError)
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: "PAYMENT_LINK_CREATE",
          entityType: "TRANSACTION",
          entityId: result.tx.id,
          newValue: {
            result: "failed",
            reason: "YAGOUT_REQUEST_INVALID",
            detail: buildError?.message,
            merchantId: paymentInput.merchantId,
            transactionReference: result.transactionReference,
          },
        })
        return NextResponse.json({ error: buildError?.message || "Could not build the Yagout request." }, { status: 400 })
      }

      // The form fields are stored rather than rebuilt when the customer opens
      // the hand-off page: rebuilding could produce a different hash if any
      // input changed in between, and the stored pair is what Yagout accepted.
      const handoffExpiresAt = new Date(
        Date.now() + positiveEnvNumber(process.env.YAGOUTPAY_LINK_EXPIRY_MINUTES, 60) * 60_000
      ).toISOString()

      await db.updateTransaction(result.tx.id, {
        userCredentials: {
          ...result.tx.userCredentials,
          yagout: {
            orderNo,
            amount,
            currency: YAGOUT_CURRENCY,
            country: YAGOUT_COUNTRY,
            meId: config.meId,
            postUrl: config.postUrl,
            merchantRequest,
            hash,
            createdAt: new Date().toISOString(),
          },
          link: {
            ...(result.tx.userCredentials?.link ?? {}),
            expiresAt: handoffExpiresAt,
            status: "PENDING" as const,
          },
        },
      })

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_LINK_CREATE",
        entityType: "TRANSACTION",
        entityId: result.tx.id,
        newValue: {
          result: "success",
          paymentMethod: "YAGOUT",
          status: "initiated",
          merchantId: paymentInput.merchantId,
          merchantName: merchant?.name,
          transactionId: result.tx.id,
          transactionReference: result.transactionReference,
          amount: result.tx.amount,
          orderNo,
          meId: config.meId,
        },
      })

      return NextResponse.json({
        transactionId: result.tx.id,
        transactionReference: result.transactionReference,
        status: "initiated",
        // Our own hand-off page, not Yagout's: the gateway only accepts a
        // browser form POST from a whitelisted domain, so there is no URL we
        // could send the customer to directly. Kept as a fallback link.
        paymentUrl: `${baseUrl}/pay/yagout/${result.token}`,
        // The signed form fields, so the merchant portal can POST straight to
        // Yagout's checkout without the hand-off page in between. They are
        // already encrypted and hashed; the hand-off page renders the same.
        yagoutForm: {
          postUrl: config.postUrl,
          meId: config.meId,
          merchantRequest,
          hash,
        },
        orderNo,
      })
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
      let mpgsConfig: Awaited<ReturnType<typeof resolveMpgsConfigForMerchant>>
      try {
        mpgsConfig = await resolveMpgsConfigForMerchant(paymentInput.merchantId)
        mpgs = await createMpgsPaymentLink(mpgsConfig, {
          orderId,
          amount: result.tx.amount,
          currency: mpgsConfig.currency,
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
            // Recorded so the portal can label the amount in the currency the
            // link was actually raised in, without re-reading gateway config.
            currency: mpgsConfig.currency,
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
          currency: mpgsConfig.currency,
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
        itemsReceived: paymentInput.items ?? null,
        itemsPersisted: result.itemsPersisted,
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
