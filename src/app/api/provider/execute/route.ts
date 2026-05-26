import { NextResponse } from "next/server"
import { db } from "@/app/lib/db"
import { resolveEncryptedToken } from "@/app/api/payments/_shared"
import { sendProviderPushRequest } from "@/lib/provider-client"
import {
  prepareEncryptedPushRequest,
  sendPushToProvider,
  ProviderPushPayloadSchema,
} from "@/lib/provider-encryption"
import { decryptSessionToken } from "@/lib/jwe"
import { decryptMerchantSecretInMemory } from "@/lib/merchant-secret"
import bcrypt from "bcryptjs"
import { writeAuditLog } from "@/lib/audit-log"

export async function POST(request: Request) {
  let txId: string | null = null
  let merchantId: string | null = null

  // Provider execute is invoked via secure tokens; we may not have a User.id here.
  // We log actorId as null and include merchant/tx ids in metadata.
  try {
    const body = await request.json()
    const { token, merchantSessionToken, merchantCredentials } = body ?? {}

    if (typeof token !== "string" || !token) {
      await writeAuditLog({
        request,
        userId: null,
        action: "PROVIDER_EXECUTE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", status: "FAILED", reason: "MISSING_TOKEN" },
      })
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    if (typeof merchantSessionToken !== "string" || !merchantSessionToken) {
      await writeAuditLog({
        request,
        userId: null,
        action: "PROVIDER_EXECUTE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", status: "FAILED", reason: "MISSING_MERCHANT_SESSION_TOKEN" },
      })
      return NextResponse.json({ error: "Missing merchantSessionToken" }, { status: 400 })
    }

    // 1. Decrypt link token to ensure integrity and enforce expiration/usage rules
    const resolved = await resolveEncryptedToken(token)
    if (!resolved.ok) {
      await writeAuditLog({
        request,
        userId: null,
        action: "PROVIDER_EXECUTE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", status: "FAILED", reason: "INVALID_ENCRYPTED_TOKEN", error: resolved.error },
      })
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }

    const { merchant, tx } = resolved
    txId = tx.id
    merchantId = merchant.id

    // 2. Verify the merchant session token
    try {
      const { plaintext: merchantSecret } = decryptMerchantSecretInMemory(merchant.jweSecret)
      const sessionPayload = await decryptSessionToken(merchantSessionToken, merchantSecret)

      if (sessionPayload.merchantId !== merchant.id) {
        await writeAuditLog({
          request,
          userId: null,
          action: "PROVIDER_EXECUTE",
          entityType: "TRANSACTION",
          entityId: txId,
          newValue: {
            result: "failed",
            status: "FAILED",
            reason: "SESSION_MERCHANT_MISMATCH",
            merchantId: merchant.id,
          },
        })
        return NextResponse.json({ error: "Invalid session token: merchant mismatch" }, { status: 401 })
      }

      if (sessionPayload.transactionId !== tx.id) {
        await writeAuditLog({
          request,
          userId: null,
          action: "PROVIDER_EXECUTE",
          entityType: "TRANSACTION",
          entityId: txId,
          newValue: {
            result: "failed",
            status: "FAILED",
            reason: "SESSION_TRANSACTION_MISMATCH",
            transactionId: tx.id,
          },
        })
        return NextResponse.json({ error: "Invalid session token: transaction mismatch" }, { status: 401 })
      }

      if (Date.now() > sessionPayload.exp) {
        await writeAuditLog({
          request,
          userId: null,
          action: "PROVIDER_EXECUTE",
          entityType: "TRANSACTION",
          entityId: txId,
          newValue: {
            result: "failed",
            status: "FAILED",
            reason: "SESSION_TOKEN_EXPIRED",
          },
        })
        return NextResponse.json({ error: "Session token expired" }, { status: 401 })
      }
    } catch {
      await writeAuditLog({
        request,
        userId: null,
        action: "PROVIDER_EXECUTE",
        entityType: "TRANSACTION",
        entityId: txId,
        newValue: { result: "failed", status: "FAILED", reason: "INVALID_SESSION_TOKEN" },
      })
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 })
    }

    // 3. Revalidate merchant credentials if provided (high-risk assurance)
    if (merchantCredentials) {
      if (
        typeof merchantCredentials.userId !== "string" ||
        typeof merchantCredentials.password !== "string"
      ) {
        await writeAuditLog({
          request,
          userId: null,
          action: "PROVIDER_EXECUTE",
          entityType: "TRANSACTION",
          entityId: txId,
          newValue: {
            result: "failed",
            status: "FAILED",
            reason: "INVALID_MERCHANT_CREDENTIALS_FORMAT",
          },
        })
        return NextResponse.json({ error: "Invalid merchantCredentials format" }, { status: 400 })
      }

      const isUserIdValid =
        merchantCredentials.userId === merchant.id || merchantCredentials.userId === merchant.email
      if (!isUserIdValid) {
        await writeAuditLog({
          request,
          userId: null,
          action: "PROVIDER_EXECUTE",
          entityType: "TRANSACTION",
          entityId: txId,
          newValue: {
            result: "failed",
            status: "FAILED",
            reason: "MERCHANT_CREDENTIALS_USER_ID_MISMATCH",
          },
        })
        return NextResponse.json({ error: "Invalid merchant credentials: user ID mismatch" }, { status: 401 })
      }

      if (!merchant.password) {
        await writeAuditLog({
          request,
          userId: null,
          action: "PROVIDER_EXECUTE",
          entityType: "TRANSACTION",
          entityId: txId,
          newValue: { result: "failed", status: "FAILED", reason: "MERCHANT_PASSWORD_NOT_SET" },
        })
        return NextResponse.json({ error: "Merchant password not set" }, { status: 401 })
      }

      const isPasswordValid = await bcrypt.compare(merchantCredentials.password, merchant.password)
      if (!isPasswordValid) {
        // Do NOT log the password.
        await writeAuditLog({
          request,
          userId: null,
          action: "PROVIDER_EXECUTE",
          entityType: "TRANSACTION",
          entityId: txId,
          newValue: { result: "failed", status: "FAILED", reason: "MERCHANT_CREDENTIALS_PASSWORD_MISMATCH" },
        })
        return NextResponse.json({ error: "Invalid merchant credentials: password mismatch" }, { status: 401 })
      }
    }

    // 4. Prepare request for the external provider (legacy flow)
    const providerRequest = {
      transactionRef: tx.transactionReference,
      customerPhone: tx.userCredentials.phone,
      creditAccount: merchant.accountNumber,
      amount: tx.amount,
      company: "NTMerchant",
      merchantName: merchant.name,
      description: tx.serviceDescription || tx.description,
      callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/provider/callback`,
    }

    console.log("Initiating USSD push from link page (legacy flow)...")
    let providerResponse = await sendProviderPushRequest(providerRequest)

    // If legacy provider fails, try the new encrypted provider flow
    if (providerResponse.statusCode !== 200) {
      console.log("Legacy flow failed. Trying new encrypted provider flow...", {
        message: providerResponse.message,
        error: providerResponse.error,
        details: providerResponse.details,
      })

      const providerPayload = ProviderPushPayloadSchema.parse({
        transactionRef: tx.transactionReference,
        customerPhone: tx.userCredentials.phone,
        creditAccount: merchant.accountNumber,
        amount: tx.amount,
        company: "NTMerchant",
        merchantName: merchant.name,
        description: tx.serviceDescription || tx.description,
        callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/provider/callback`,
      })

      const baseUrl = process.env.PROVIDER_BASE_URL!
      const username = process.env.PROVIDER_USERNAME!
      const password = process.env.PROVIDER_PASSWORD!
      const { request: encryptedRequest } = await prepareEncryptedPushRequest(
        providerPayload,
        baseUrl,
        username,
        password
      )

      providerResponse = await sendPushToProvider(encryptedRequest, baseUrl, username, password)
    }

    if (providerResponse.statusCode !== 200 && (providerResponse as any).status !== 200) {
      console.error("All provider flows failed for link-initiated push:", providerResponse)

      await db.updateTransactionStatus(tx.id, "failed")

      await writeAuditLog({
        request,
        userId: null,
        action: "PROVIDER_EXECUTE",
        entityType: "TRANSACTION",
        entityId: txId,
        newValue: {
          result: "failed",
          status: "FAILED",
          reason: "PROVIDER_REJECTED",
          merchantId,
          providerStatusCode: providerResponse.statusCode || (providerResponse as any).status,
        },
      })

      return NextResponse.json(
        {
          error: providerResponse.message || "Provider rejected the USSD push",
          details: providerResponse.details || providerResponse.error,
          statusCode: providerResponse.statusCode,
        },
        { status: 400 }
      )
    }

    // 3. Update local transaction with shared secret if returned (do NOT audit-log secrets)
    if (providerResponse.sharedSecret) {
      await db.updateTransaction(tx.id, {
        userCredentials: {
          ...tx.userCredentials,
          providerSharedSecret: providerResponse.sharedSecret,
        },
      })
    }

    // 4. Mark transaction as awaiting PIN after successful push initiation
    await db.updateTransactionStatus(tx.id, "awaiting_pin")

    await writeAuditLog({
      request,
      userId: null,
      action: "PROVIDER_EXECUTE",
      entityType: "TRANSACTION",
      entityId: txId,
      oldValue: null,
      newValue: {
        result: "success",
        status: "SUCCESS",
        merchantId,
        transactionStatus: "awaiting_pin",
      },
    })

    return NextResponse.json({
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      status: "awaiting_pin",
      message: "USSD push initiated successfully",
    })
  } catch (error) {
    console.error("USSD execution error:", error)

    await writeAuditLog({
      request,
      userId: null,
      action: "PROVIDER_EXECUTE",
      entityType: "TRANSACTION",
      entityId: txId ?? null,
      newValue: { result: "failed", status: "FAILED", reason: "INTERNAL_ERROR" },
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
