import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"
import { listEligibleCustomers } from "@/lib/cashback/service"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { error } = await requireMerchantCashbackAccess(request, id)
    if (error) return error

    const url = new URL(request.url)
    const categoryId = url.searchParams.get("categoryId") ?? undefined
    const search = url.searchParams.get("search") ?? undefined

    const customers = await listEligibleCustomers(id, { categoryId, search, limit: 500 })
    return NextResponse.json({ customers })
  } catch (e) {
    console.error("Failed to list eligible customers:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId } = await params
    const { error } = await requireMerchantCashbackAccess(request, merchantId)
    if (error) return error

    const body = await request.json().catch(() => ({}))
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : []

    if (ids.length === 0) {
      return NextResponse.json({ error: "No customer ids provided" }, { status: 400 })
    }

    const result = await prisma.cashbackEligibleCustomer.deleteMany({
      where: { merchantId, id: { in: ids } },
    })

    return NextResponse.json({ deleted: result.count })
  } catch (e) {
    console.error("Failed to delete eligible customers:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
