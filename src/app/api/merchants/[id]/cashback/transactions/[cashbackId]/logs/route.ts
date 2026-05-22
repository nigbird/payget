import { NextResponse } from "next/server"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"
import { listCashbackLogs } from "@/lib/cashback/service"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; cashbackId: string }> }
) {
  try {
    const { id, cashbackId } = await params
    const { error } = await requireMerchantCashbackAccess(request, id)
    if (error) return error

    const logs = await listCashbackLogs(cashbackId, id)
    return NextResponse.json({ logs })
  } catch (e) {
    console.error("Failed to list cashback logs:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
