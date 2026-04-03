import { NextResponse } from "next/server"
import { db, type TransactionStatus } from "@/app/lib/db"
import { resolveEncryptedToken } from "@/app/api/payments/_shared"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token, pin } = body ?? {}

    if (typeof token !== "string" || !token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }
    if (typeof pin !== "string" || pin.length < 4) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 400 })
    }

    const resolved = await resolveEncryptedToken(token)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }

    const { merchant, tx } = resolved

    // Move into processing state (mock provider execution).
    await db.updateTransactionStatus(tx.id, "processing")

    const finalStatus: TransactionStatus = pin === "1234" ? "success" : "failed"
    await db.updateTransactionStatus(tx.id, finalStatus)

    // Relay status to merchant callback URL (best-effort).
    try {
      await fetch(merchant.callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant.id,
          transactionId: tx.id,
          transactionReference: tx.transactionReference,
          amount: tx.amount,
          status: finalStatus,
          processedAt: new Date().toISOString(),
        }),
      })
    } catch {
      // Callback failures shouldn't break the payment.
    }

    return NextResponse.json({
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      status: finalStatus,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

