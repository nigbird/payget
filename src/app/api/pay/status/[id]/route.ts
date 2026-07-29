import { NextResponse } from "next/server"
import { db } from "@/app/lib/db"
import { checkTransactionStatusAtProvider } from "@/lib/provider-encryption"

// In-memory rate limit: only call provider once per 10s per transaction ID.
// Prevents hammering the provider on every 3s poll from the customer page.
const lastProviderCheck = new Map<string, number>()
const PROVIDER_CHECK_INTERVAL_MS = 10_000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const tx = await db.getTransactionById(id)
  if (!tx) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
  }

  // Already settled — return immediately without calling provider
  if (tx.status === "success" || tx.status === "failed") {
    return NextResponse.json({ status: tx.status })
  }

  // Not awaiting_pin or no shared secret — nothing we can check
  const sharedSecret = tx.userCredentials?.providerSharedSecret
  if (tx.status !== "awaiting_pin" || !sharedSecret) {
    return NextResponse.json({ status: tx.status })
  }

  // Rate-limit provider calls per transaction
  const now = Date.now()
  const lastCheck = lastProviderCheck.get(id) ?? 0
  if (now - lastCheck < PROVIDER_CHECK_INTERVAL_MS) {
    return NextResponse.json({ status: tx.status })
  }
  lastProviderCheck.set(id, now)

  // Clean up stale entries (keep map bounded)
  if (lastProviderCheck.size > 2000) {
    const cutoff = now - 5 * 60_000
    for (const [key, ts] of lastProviderCheck) {
      if (ts < cutoff) lastProviderCheck.delete(key)
    }
  }

  try {
    const result = await checkTransactionStatusAtProvider(tx.transactionReference, sharedSecret)

    if (!result.ok) {
      // Provider unreachable — return current DB status, don't fail the customer
      return NextResponse.json({ status: tx.status })
    }

    const STATUS_MAP = { PAID: "success", NOT_PAID: "failed", PENDING: null } as const
    const resolved = STATUS_MAP[result.paymentStatus]

    if (resolved) {
      await db.updateTransactionStatus(tx.id, resolved)

      if (result.cbsreference) {
        await db.updateTransaction(tx.id, {
          cbsreference: result.cbsreference,
          userCredentials: {
            ...tx.userCredentials,
            cbsreference: result.cbsreference,
          },
        })
      }

      return NextResponse.json({ status: resolved })
    }

    return NextResponse.json({ status: tx.status })
  } catch {
    return NextResponse.json({ status: tx.status })
  }
}
