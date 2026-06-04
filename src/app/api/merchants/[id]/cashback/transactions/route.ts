import { NextResponse } from "next/server"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"
import { listCashbackTransactions } from "@/lib/cashback/service"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { error } = await requireMerchantCashbackAccess(request, id)
    if (error) return error

    const url = new URL(request.url)
    const status = url.searchParams.get("status") ?? undefined
    const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 200)
    const offset = Number(url.searchParams.get("offset")) || 0

    const result = await listCashbackTransactions(id, { status, limit, offset })
    return NextResponse.json({ 
      transactions: result.transactions, 
      total: result.total 
    })
  } catch (e) {
    console.error("Failed to list cashback transactions:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
