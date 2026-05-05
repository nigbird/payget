import { NextResponse } from "next/server"
import { db } from "@/app/lib/db"
import { writeAuditLog } from "@/lib/audit-log"
import { requireCsrf } from '@/lib/request-security';

// Assume callback payload is encrypted similarly, but for simplicity, assume it's plain for now
// In reality, need to decrypt using stored shared secret

export async function POST(request: Request) {
  let actorUserId: string | null = null
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const body = await request.json()
    // Decrypt if needed
    // For now, assume body has { transactionRef, status, etc. }

    const { transactionRef, status } = body

    // Find transaction by reference
    const tx = await db.getTransactionByReference(transactionRef)
    if (!tx) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_CALLBACK",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "TRANSACTION_NOT_FOUND", transactionRef, status },
      })

      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    // Update status
    await db.updateTransactionStatus(tx.id, status)

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "PAYMENT_CALLBACK",
      entityType: "TRANSACTION",
      entityId: tx.id,
      oldValue: null,
      newValue: { result: "success", status, transactionRef },
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
