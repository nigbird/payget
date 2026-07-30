import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuthUser } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import {
  sendProviderPushPayment,
  ProviderPushPayloadSchema,
  isProviderPushSuccess,
  generateProviderTransactionRef,
} from "@/lib/provider-encryption"
import { writeAuditLog } from "@/lib/audit-log"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

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

    const isAssigned =
      user.merchantId === merchant.id ||
      (user.assignedMerchantIds && user.assignedMerchantIds.includes(merchant.id))

    if (user.role !== "ADMIN" && !isAssigned) {
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

    const previousTransactionReference = tx.transactionReference
    const newTransactionRef = generateProviderTransactionRef()

    const providerPayload = ProviderPushPayloadSchema.parse({
      transactionRef: newTransactionRef,
      customerPhone: tx.userCredentials.phone,
      creditAccount: merchant.accountNumber,
      amount: tx.amount,
      company: "NTMerchant",
      merchantName: merchant.name,
      description: tx.description,
      callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/provider/callback`,
    })

    console.log("Re-initiating USSD push for transaction %s with new ref %s", tx.id, newTransactionRef)
    const providerResponse = await sendProviderPushPayment(providerPayload)

    if (!isProviderPushSuccess(providerResponse)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_RESEND_PUSH",
        entityType: "TRANSACTION",
        entityId: tx.id,
        newValue: {
          result: "failed",
          reason: "PROVIDER_REJECTED",
          statusCode: providerResponse.statusCode,
          attemptedTransactionRef: newTransactionRef,
        },
      })

      return NextResponse.json({
        error: providerResponse.message || "Provider rejected the USSD push",
        details: providerResponse.details || providerResponse.error,
      }, { status: 400 })
    }

    const previousRefs = tx.userCredentials.previousTransactionReferences ?? []
    await db.updateTransaction(tx.id, {
      transactionReference: newTransactionRef,
      userCredentials: {
        ...tx.userCredentials,
        providerSharedSecret: providerResponse.sharedSecret,
        previousTransactionReferences: [...previousRefs, previousTransactionReference],
      },
    })

    await db.updateTransactionStatus(tx.id, "awaiting_pin")

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "TRANSACTION_RESEND_PUSH",
      entityType: "TRANSACTION",
      entityId: tx.id,
      oldValue: { transactionReference: previousTransactionReference },
      newValue: {
        result: "success",
        status: "awaiting_pin",
        transactionReference: newTransactionRef,
        previousTransactionReference,
      },
    })

    return NextResponse.json({
      success: true,
      message: "USSD push re-sent successfully",
      status: "awaiting_pin",
      transactionReference: newTransactionRef,
    })
  } catch (error) {
    console.error("USSD re-send error:", error)

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
