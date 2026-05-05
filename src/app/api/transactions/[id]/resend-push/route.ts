import { NextResponse } from "next/server"
import { db } from "@/app/lib/db"
import { requireAuthUser } from "@/lib/request-auth"
import { requireCsrf } from '@/lib/request-security';
import { sendProviderPushRequest } from "@/lib/provider-client"
import { prepareEncryptedPushRequest, sendPushToProvider, ProviderPushPayloadSchema } from "@/lib/provider-encryption"
import { writeAuditLog } from "@/lib/audit-log"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const user = await requireAuthUser(request)
    const actorUserId = user?.id ?? null

    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: "TRANSACTION_RESEND_PUSH",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      })

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const tx = await db.getTransactionById(id)
    if (!tx) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_RESEND_PUSH",
        entityType: "TRANSACTION",
        entityId: id,
        newValue: { result: "failed", reason: "TRANSACTION_NOT_FOUND" },
      })

      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    const merchant = await db.getMerchantById(tx.merchantId)
    if (!merchant) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_RESEND_PUSH",
        entityType: "TRANSACTION",
        entityId: id,
        newValue: { result: "failed", reason: "MERCHANT_NOT_FOUND" },
      })

      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
    }

    // Verify ownership
    const isAssigned =
      user.merchantId === merchant.id || (user.assignedMerchantIds && user.assignedMerchantIds.includes(merchant.id))
    
    if (user.role !== 'ADMIN' && !isAssigned) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_RESEND_PUSH",
        entityType: "TRANSACTION",
        entityId: tx.id,
        newValue: { result: "failed", reason: "FORBIDDEN" },
      })

      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // 1. Prepare request for the external provider (legacy flow)
    const providerRequest = {
      transactionRef: tx.transactionReference,
      customerPhone: tx.userCredentials.phone,
      creditAccount: merchant.accountNumber,
      amount: tx.amount,
      company: "NibterMerchant"
    }

    // 2. Call the external provider API (legacy flow)
    console.log(`Re-initiating USSD push for transaction ${tx.id} (legacy flow)...`)
    let providerResponse = await sendProviderPushRequest(providerRequest)
    
    // If legacy provider fails, try the new encrypted provider flow
    if (providerResponse.statusCode !== 200) {
      console.log('Legacy flow failed. Trying new encrypted provider flow...')
      const providerPayload = ProviderPushPayloadSchema.parse({
        transactionRef: tx.transactionReference,
        customerPhone: tx.userCredentials.phone,
        creditAccount: merchant.accountNumber,
        amount: tx.amount,
        company: "NibterMerchant",
      })

      const baseUrl = process.env.PROVIDER_BASE_URL!
      const username = process.env.PROVIDER_USERNAME!
      const password = process.env.PROVIDER_PASSWORD!
      const { request: encryptedRequest } = await prepareEncryptedPushRequest(providerPayload, baseUrl, username, password)

      providerResponse = await sendPushToProvider(encryptedRequest, baseUrl, username, password)
    }

    if (providerResponse.statusCode !== 200 && (providerResponse as any).status !== 200) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_RESEND_PUSH",
        entityType: "TRANSACTION",
        entityId: tx.id,
        newValue: {
          result: "failed",
          reason: "PROVIDER_REJECTED",
          statusCode: providerResponse.statusCode || (providerResponse as any).status,
        },
      })

      return NextResponse.json({ 
        error: providerResponse.message || "Provider rejected the USSD push",
        details: providerResponse.details || providerResponse.error
      }, { status: 400 })
    }

    // 3. Update local transaction with shared secret if returned
    if (providerResponse.sharedSecret) {
      await db.updateTransaction(tx.id, {
        userCredentials: {
          ...tx.userCredentials,
          providerSharedSecret: providerResponse.sharedSecret
        }
      })
    }

    // Reset status to awaiting_pin if it was failed or something else
    await db.updateTransactionStatus(tx.id, "awaiting_pin")

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "TRANSACTION_RESEND_PUSH",
      entityType: "TRANSACTION",
      entityId: tx.id,
      oldValue: null,
      newValue: { result: "success", status: "awaiting_pin" },
    })

    return NextResponse.json({
      success: true,
      message: "USSD push re-sent successfully",
      status: "awaiting_pin"
    })
  } catch (error) {
    console.error('USSD re-send error:', error)

    await writeAuditLog({
      request,
      userId: null,
      action: "TRANSACTION_RESEND_PUSH",
      entityType: "TRANSACTION",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
