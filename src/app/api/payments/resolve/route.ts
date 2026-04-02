import { NextResponse } from "next/server"
import { resolveEncryptedToken } from "@/app/api/payments/_shared"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get("token")
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    const result = await resolveEncryptedToken(token)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const { merchant, payload, tx } = result
    return NextResponse.json({
      merchantId: merchant.id,
      merchantName: merchant.name,
      transactionId: payload.transactionId,
      transactionReference: payload.transactionReference,
      amount: payload.amount,
      serviceDescription: payload.serviceDescription,
      status: tx.status,
      transactionTimestamp: tx.transactionTimestamp,
      payerPhone: payload.userCredentials.phone,
    })
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 })
  }
}

