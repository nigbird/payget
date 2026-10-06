import { NextResponse } from "next/server"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"
import { listCashbackTransactions } from "@/lib/cashback/service"

/** ISO timestamp from the client's date-range picker; anything unparseable is ignored. */
function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

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
    const from = parseDateParam(url.searchParams.get("from"))
    const to = parseDateParam(url.searchParams.get("to"))
    const download = url.searchParams.get("download") === "true"

    if (download) {
      // For download, we get all transactions matching filters without pagination
      const result = await listCashbackTransactions(id, { status, search, from, to, limit: 10000 })
      return NextResponse.json({ 
        transactions: result.transactions, 
        total: result.total 
      })
    }

    const page = url.searchParams.get("page") ? Number(url.searchParams.get("page")) : undefined
    const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 200)
    const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined

    const result = await listCashbackTransactions(id, { status, limit, offset, page, search, from, to })
    return NextResponse.json({ 
      transactions: result.transactions, 
      total: result.total 
    })
  } catch (e) {
    console.error("Failed to list cashback transactions:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
