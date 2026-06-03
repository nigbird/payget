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
    const search = url.searchParams.get("search") ?? undefined
    const page = url.searchParams.get("page") ? Number(url.searchParams.get("page")) : undefined
    const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 200)
    const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined

    const result = await listCashbackTransactions(id, { status, limit, offset, page, search })
    return NextResponse.json({ 
      transactions: result.transactions, 
      total: result.total 
    })
  } catch (e) {
    console.error("Failed to list cashback transactions:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
