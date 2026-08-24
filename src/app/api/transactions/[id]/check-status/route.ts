import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuthUser } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { checkTransactionStatusAtProvider } from "@/lib/provider-encryption"
import { writeAuditLog } from "@/lib/audit-log"

const PROVIDER_STATUS_TO_INTERNAL = {
  PAID: "success",
  NOT_PAID: "failed",
  PENDING: null, // no state change
} as const

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let txId: string | null = null

  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const user = await requireAuthUser(request)
    const actorUserId = user?.id ?? null

    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: "TRANSACTION_STATUS_CHECK",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    txId = id

    const tx = await db.getTransactionById(id)
    if (!tx) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_STATUS_CHECK",
        entityType: "TRANSACTION",
        entityId: id,
        newValue: { result: "failed", reason: "TRANSACTION_NOT_FOUND" },
      })
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    txId = tx.id

    // Verify the requesting user has access to this transaction's merchant
    const isAssigned =
      user.merchantId === tx.merchantId ||
      (user.assignedMerchantIds && user.assignedMerchantIds.includes(tx.merchantId))

    if (user.role !== "ADMIN" && !isAssigned) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_STATUS_CHECK",
        entityType: "TRANSACTION",
        entityId: tx.id,
        newValue: { result: "failed", reason: "FORBIDDEN" },
      })
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const sharedSecretBase64 = tx.userCredentials.providerSharedSecret
    if (!sharedSecretBase64) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_STATUS_CHECK",
        entityType: "TRANSACTION",
        entityId: tx.id,
        newValue: { result: "failed", reason: "NO_SHARED_SECRET" },
      })
      return NextResponse.json(
        { error: "No provider shared secret for this transaction — it may not have been initiated yet" },
        { status: 400 }
      )
    }

    const statusResult = await checkTransactionStatusAtProvider(
      tx.transactionReference,
      sharedSecretBase64
    )

    if (!statusResult.ok) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_STATUS_CHECK",
        entityType: "TRANSACTION",
        entityId: tx.id,
        newValue: {
          result: "failed",
          reason: "PROVIDER_STATUS_CHECK_FAILED",
          providerError: statusResult.error,
          providerStatusCode: statusResult.statusCode,
        },
      })
      return NextResponse.json(
        { error: statusResult.error },
        { status: statusResult.statusCode >= 400 && statusResult.statusCode < 600 ? statusResult.statusCode : 502 }
      )
    }

    const internalStatus = PROVIDER_STATUS_TO_INTERNAL[statusResult.paymentStatus]
    const oldStatus = tx.status

    // Only update if provider returned a terminal state and local is not already terminal
    const TERMINAL = new Set(["success", "failed"])
    if (internalStatus && !TERMINAL.has(tx.status)) {
      await db.updateTransactionStatus(tx.id, internalStatus)

      // Persist the FT number (cbsreference) into both the column (searchable,
      // unique) and userCredentials so receipt generation can find it
      if (statusResult.cbsreference) {
        await db.updateTransaction(tx.id, {
          cbsreference: statusResult.cbsreference,
          userCredentials: {
            ...tx.userCredentials,
            cbsreference: statusResult.cbsreference,
          },
        })
      }

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_STATUS_CHECK",
        entityType: "TRANSACTION",
        entityId: tx.id,
        oldValue: { status: oldStatus },
        newValue: {
          result: "success",
          status: internalStatus,
          providerPaymentStatus: statusResult.paymentStatus,
          cbsreference: statusResult.cbsreference,
          source: "provider_status_poll",
        },
      })
    } else {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "TRANSACTION_STATUS_CHECK",
        entityType: "TRANSACTION",
        entityId: tx.id,
        newValue: {
          result: "success",
          status: tx.status,
          providerPaymentStatus: statusResult.paymentStatus,
          noUpdate: !internalStatus || TERMINAL.has(tx.status),
        },
      })
    }

    return NextResponse.json({
      transactionId: statusResult.transactionId,
      customerPhone: statusResult.customerPhone,
      amount: statusResult.amount,
      paymentStatus: statusResult.paymentStatus,
      cbsreference: statusResult.cbsreference,
      message: statusResult.message,
      updatedAt: statusResult.updatedAt,
      localStatus: internalStatus ?? tx.status,
    })
  } catch (error) {
    console.error("Transaction status check error:", error)

    await writeAuditLog({
      request,
      userId: null,
      action: "TRANSACTION_STATUS_CHECK",
      entityType: "TRANSACTION",
      entityId: txId,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
