import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { sendPaymentLinkEmail } from "@/lib/notifications"
import { writeAuditLog } from "@/lib/audit-log"

const SendSchema = z.object({
  merchantId: z.string().min(1),
  transactionReference: z.string().min(1),
})


export async function POST(request: Request) {
  try {
    const user = await requireAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = SendSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { merchantId, transactionReference } = parsed.data

    if (!canAccessMerchant(user, merchantId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const [transaction] = await db.getTransactions({
      merchantId,
      transactionReference,
      limit: 1,
    })

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    if (transaction.paymentMethod !== "MPGS") {
      return NextResponse.json({ error: "Not an MPGS transaction" }, { status: 400 })
    }

    const paymentUrl = transaction.userCredentials?.mpgs?.paymentLinkUrl
    const customerEmail = transaction.userCredentials?.customerEmail

    if (!paymentUrl) {
      return NextResponse.json(
        { error: "No payment link has been generated for this transaction." },
        { status: 409 }
      )
    }

    if (!customerEmail) {
      return NextResponse.json(
        { error: "No customer email is recorded for this transaction." },
        { status: 409 }
      )
    }

    const merchant = await db.getMerchantById(merchantId)

    const delivery = await sendPaymentLinkEmail({
      to: customerEmail,
      merchantName: merchant?.name ?? "Merchant",
      amount: transaction.amount,
      currency: process.env.MPGS_CURRENCY?.trim() || "USD",
      description: transaction.serviceDescription,
      paymentUrl,
      expiresAt: transaction.userCredentials?.mpgs?.expiresAt,
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "PAYMENT_LINK_SEND",
      entityType: "TRANSACTION",
      entityId: transaction.id,
      newValue: {
        result: delivery.ok ? "success" : "failed",
        paymentMethod: "MPGS",
        merchantId,
        merchantName: merchant?.name,
        transactionReference,
        reusedExistingLink: true,
        error: delivery.ok ? undefined : delivery.error,
      },
    })

    if (!delivery.ok) {
      return NextResponse.json({ error: delivery.error }, { status: 502 })
    }

    return NextResponse.json({
      emailSent: true,
      sentTo: customerEmail,
      transactionReference,
    })
  } catch (error) {
    console.error("[mpgs-send-email] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
