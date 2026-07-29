import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(request.url)
    const search = url.searchParams.get("search")?.trim() ?? ""
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 50))
    const requestedPage = Math.max(1, Number(url.searchParams.get("page")) || 1)

    const where = {
      merchantId: id,
      ...(search ? { phone: { contains: search } } : {}),
    }

    const total = await prisma.paymentEligibleCustomer.count({ where })
    const totalPages = Math.ceil(total / limit)
    // Clamp so a shrinking result set can't strand the caller on an empty page.
    const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1

    const customers = await prisma.paymentEligibleCustomer.findMany({
      where,
      orderBy: { phone: "asc" },
      take: limit,
      skip: (page - 1) * limit,
    })

    return NextResponse.json({
      customers: customers.map((c) => ({ id: c.id, phone: c.phone, approvedAt: c.approvedAt.toISOString() })),
      total,
      page,
      pageSize: limit,
      totalPages,
    })
  } catch (e) {
    console.error("Failed to list approved eligible customers:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
