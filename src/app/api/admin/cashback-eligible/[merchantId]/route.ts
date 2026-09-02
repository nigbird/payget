import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"

const DEFAULT_PAGE_SIZE = 25

/** Paginated, searchable view of one merchant's cashback eligible customers. Read-only. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  try {
    const user = await requireAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!userHasPermission(user, "cashback.eligible.view")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const { merchantId } = await params
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, name: true },
    })
    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
    }

    const url = new URL(request.url)
    const search = url.searchParams.get("search")?.trim() ?? ""
    const categoryId = url.searchParams.get("categoryId")?.trim() ?? ""
    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE)
    )
    const requestedPage = Math.max(1, Number(url.searchParams.get("page")) || 1)

    const digitsOnly = search.replace(/\D/g, "")
    const where = {
      merchantId,
      ...(categoryId && categoryId !== "ALL" ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { phone: { contains: search } },
              ...(digitsOnly ? [{ accountNumber: { contains: digitsOnly } }] : []),
              { category: { name: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    }

    const total = await prisma.cashbackEligibleCustomer.count({ where })
    const totalPages = Math.ceil(total / pageSize)
    const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1

    const [rows, categories] = await Promise.all([
      prisma.cashbackEligibleCustomer.findMany({
        where,
        orderBy: [{ importedAt: "desc" }, { phone: "asc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: { category: { select: { id: true, name: true, percent: true } } },
      }),
      prisma.cashbackCategory.findMany({
        where: { merchantId, eligibleCustomers: { some: {} } },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      }),
    ])

    return NextResponse.json({
      merchant,
      categories,
      customers: rows.map((r) => ({
        id: r.id,
        phone: r.phone,
        accountNumber: r.accountNumber,
        categoryId: r.categoryId,
        categoryName: r.category.name,
        categoryPercent: r.category.percent,
        importedAt: r.importedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages,
    })
  } catch (e) {
    console.error("Failed to list cashback eligible customers:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
