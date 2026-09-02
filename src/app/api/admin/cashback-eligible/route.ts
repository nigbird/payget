import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"

/**
 * Read-only roster of merchants that have a cashback eligible-customer list.
 * Nothing here is approvable — the list is owned by the merchant; admins only
 * need to see it while working through cashback reconciliation.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!userHasPermission(user, "cashback.eligible.view")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const search = new URL(request.url).searchParams.get("search")?.trim() ?? ""

    const merchants = await prisma.merchant.findMany({
      where: {
        cashbackEligibleCustomers: { some: {} },
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      select: {
        id: true,
        name: true,
        cashbackConfig: { select: { enabled: true, mode: true } },
        _count: { select: { cashbackEligibleCustomers: true } },
      },
      orderBy: { name: "asc" },
      take: 200,
    })

    const merchantIds = merchants.map((m) => m.id)

    // Latest import timestamp per merchant, so the list shows how fresh each roster is.
    const lastImports = merchantIds.length
      ? await prisma.cashbackEligibleCustomer.groupBy({
          by: ["merchantId"],
          where: { merchantId: { in: merchantIds } },
          _max: { importedAt: true },
        })
      : []
    const lastImportByMerchant = new Map(
      lastImports.map((row) => [row.merchantId, row._max.importedAt])
    )

    return NextResponse.json({
      merchants: merchants.map((m) => ({
        id: m.id,
        name: m.name,
        totalCustomers: m._count.cashbackEligibleCustomers,
        cashbackEnabled: m.cashbackConfig?.enabled ?? false,
        cashbackMode: m.cashbackConfig?.mode ?? null,
        lastImportedAt: lastImportByMerchant.get(m.id)?.toISOString() ?? null,
      })),
    })
  } catch (e) {
    console.error("Failed to list cashback eligible merchants:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
