import { NextResponse } from "next/server"
import { db } from "@/app/lib/db"
import { writeAuditLog } from "@/lib/audit-log"
import { requireCsrf } from '@/lib/request-security';
import { z } from 'zod'

const ProviderCallbackSchema = z.object({
  transactionRef: z.string().min(1),
  statusCode: z.union([z.number(), z.string()]).optional(),
  status: z.string().optional(),
})

const TERMINAL_STATUSES = new Set(['success', 'failed'])

export async function POST(request: Request) {
  let actorUserId: string | null = null
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const rawBody = await request.json()
    const parsed = ProviderCallbackSchema.safeParse(rawBody)
    if (!parsed.success) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_CALLBACK",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "INVALID_PAYLOAD", rawBody },
      })
      return NextResponse.json({ error: "Invalid callback payload" }, { status: 400 })
    }

    const { transactionRef, statusCode, status } = parsed.data

    // Find transaction by reference
    const tx = await db.getTransactionByReference(transactionRef)
    if (!tx) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_CALLBACK",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "TRANSACTION_NOT_FOUND", transactionRef, statusCode, status },
      })
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    // Terminal state protection: never downgrade from success or failed
    if (TERMINAL_STATUSES.has(tx.status)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_CALLBACK",
        entityType: "TRANSACTION",
        entityId: tx.id,
        newValue: { result: "no_op", reason: "TRANSACTION_ALREADY_TERMINAL", currentStatus: tx.status, incomingStatusCode: statusCode, incomingStatus: status },
      })
      return NextResponse.json({ message: "Callback received (transaction already in terminal state)" })
    }

    // Determine final status based on provider callback (statusCode is source of truth)
    let finalStatus: 'success' | 'failed' | null = null
    const normalizedStatusCode = Number(statusCode)
    
    if (normalizedStatusCode === 0) {
      finalStatus = 'success'
    } else if (normalizedStatusCode === 1) {
      finalStatus = 'failed'
    } else {
      // Fallback to incoming status if statusCode not present
      if (status) {
        const lowerStatus = status.toLowerCase()
        if (TERMINAL_STATUSES.has(lowerStatus)) {
          finalStatus = lowerStatus as 'success' | 'failed'
        }
      }
    }

    if (!finalStatus) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_CALLBACK",
        entityType: "TRANSACTION",
        entityId: tx.id,
        newValue: { result: "failed", reason: "AMBIGUOUS_PROVIDER_STATUS", transactionRef, statusCode, status },
      })
      return NextResponse.json({ error: "Ambiguous provider status" }, { status: 400 })
    }

    // Update transaction status
    await db.updateTransactionStatus(tx.id, finalStatus)

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "PAYMENT_CALLBACK",
      entityType: "TRANSACTION",
      entityId: tx.id,
      oldValue: { previousStatus: tx.status },
      newValue: { result: "success", finalStatus, transactionRef, statusCode, status },
    })

    return NextResponse.json({ message: "Callback processed" })
  } catch (error) {
    console.error(error)

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "PAYMENT_CALLBACK",
      entityType: "TRANSACTION",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
