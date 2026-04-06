import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// Assume callback payload is encrypted similarly, but for simplicity, assume it's plain for now
// In reality, need to decrypt using stored shared secret

export async function POST(request: Request) {
  try {
    const body = await request.json()
    // Decrypt if needed
    // For now, assume body has { transactionRef, status, etc. }

    const { transactionRef, status } = body

    // Find transaction by reference
    const tx = await db.getTransactionByReference(transactionRef)
    if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 })

    // Update status
    await db.updateTransactionStatus(tx.id, status)

    return NextResponse.json({ message: "Callback processed" })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}