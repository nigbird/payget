import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/app/lib/db"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { settleMpgsTransaction } from "@/lib/mpgs-settlement"

const VerifySchema = z.object({
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
    const parsed = VerifySchema.safeParse(body)
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

    const result = await settleMpgsTransaction(transaction.id, {
      request,
      actorUserId: user.id,
    })

    return NextResponse.json({
      transactionReference: result.transactionReference,
      status: result.status,
      action: result.action,
      gatewayStatus: result.gatewayStatus,
      reason: result.reason,
    })
  } catch (error) {
    console.error("[mpgs-verify] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
