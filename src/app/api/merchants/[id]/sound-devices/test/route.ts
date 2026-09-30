import { NextResponse } from "next/server"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { publishPaymentEvent } from "@/lib/payment-events"

/**
 * Sends a test announcement to every connected device of this merchant, so a
 * shop can check its speakers end to end without a real payment. Records
 * nothing.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = requireCsrf(request)
  if (csrf) return csrf

  const { id: merchantId } = await params
  const user = await requireAuthUser(request)
  if (!user || !canAccessMerchant(user, merchantId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  publishPaymentEvent({
    type: "test",
    merchantId,
    transactionId: null,
    amount: 1,
    currency: "ETB",
    payerName: null,
    channel: null,
    reference: null,
    occurredAt: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
