import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuthUser } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { writeAuditLog } from "@/lib/audit-log"

const MAX_FIELD_LENGTH = 20

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const user = await requireAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const tx = await db.getTransactionById(id)
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    const merchant = await db.getMerchantById(tx.merchantId)
    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
    }

    const isAssigned =
      user.merchantId === merchant.id ||
      (user.assignedMerchantIds && user.assignedMerchantIds.includes(merchant.id))

    if (user.role !== "ADMIN" && !isAssigned) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const data: { tableNo?: string | null; shift?: string | null } = {}

    if (body.tableNo !== undefined) {
      const tableNo = body.tableNo === null ? null : String(body.tableNo).trim().slice(0, MAX_FIELD_LENGTH)
      data.tableNo = tableNo || null
    }
    if (body.shift !== undefined) {
      const shift = body.shift === null ? null : String(body.shift).trim().slice(0, MAX_FIELD_LENGTH)
      data.shift = shift || null
    }

    const printInfo = await db.upsertOrderPrintInfo(tx.id, data)

    await writeAuditLog({
      request,
      userId: user.id,
      action: "ORDER_PRINT_INFO_UPDATE",
      entityType: "TRANSACTION",
      entityId: tx.id,
      newValue: printInfo,
    })

    return NextResponse.json(printInfo)
  } catch (error) {
    console.error("Failed to update order print info:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
