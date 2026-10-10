import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAuthUser } from "@/lib/request-auth"
import { DASHBOARD_BUSINESS_VIEW } from "@/lib/dashboard-permissions"
import { TZ_INTERVAL, bucketFrame, localDateKey, merchantOptions, parsePeriod, pctChange } from "@/lib/dashboard-period"

/** Upper bound on transaction rows returned for an Excel export. */
const DETAIL_LIMIT = 20000

async function totals(where: Prisma.TransactionWhereInput) {
  const [byStatus, merchantsWithSales] = await Promise.all([
    prisma.transaction.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.transaction.groupBy({ by: ["merchantId"], where: { ...where, status: "SUCCESS" } }),
  ])
  const success = byStatus.find((s) => s.status === "SUCCESS")
  const amount = success?._sum.amount ?? 0
  const successCount = success?._count._all ?? 0
  const totalCount = byStatus.reduce((sum, s) => sum + s._count._all, 0)
  return {
    amount,
    successCount,
    totalCount,
    failedCount: byStatus.find((s) => s.status === "FAILED")?._count._all ?? 0,
    avgTicket: successCount ? amount / successCount : 0,
    merchantsWithSales: merchantsWithSales.length,
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!user.permissions?.includes(DASHBOARD_BUSINESS_VIEW)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const params = new URL(request.url).searchParams
    const period = parsePeriod(params)
    if ("error" in period) return NextResponse.json({ error: period.error }, { status: 400 })

    const merchantId = params.get("merchantId") || null
    const merchantWhere = merchantId ? { merchantId } : {}
    const where: Prisma.TransactionWhereInput = { ...merchantWhere, timestamp: { gte: period.from, lt: period.to } }

    // Full transaction list, only requested when exporting.
    if (params.get("detail") === "1") {
      const rows = await prisma.transaction.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: DETAIL_LIMIT + 1,
        select: {
          id: true,
          transactionReference: true,
          cbsreference: true,
          amount: true,
          status: true,
          paymentMethod: true,
          origin: true,
          timestamp: true,
          merchant: { select: { id: true, name: true, branchName: true } },
        },
      })
      return NextResponse.json({
        truncated: rows.length > DETAIL_LIMIT,
        limit: DETAIL_LIMIT,
        transactions: rows.slice(0, DETAIL_LIMIT),
      })
    }

    const merchantSql = merchantId ? Prisma.sql`AND "merchantId" = ${merchantId}` : Prisma.empty

    const [current, previous, seriesRows, perMerchant, merchants] = await Promise.all([
      totals(where),
      totals({ ...merchantWhere, timestamp: { gte: period.prevFrom, lt: period.from } }),
      prisma.$queryRaw<{ bucket: Date; amount: number | null; success: bigint; total: bigint }[]>`
        SELECT date_trunc(${period.bucket}, "timestamp" + ${TZ_INTERVAL}::interval) AS bucket,
               SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) AS amount,
               COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success,
               COUNT(*) AS total
        FROM "Transaction"
        WHERE "timestamp" >= ${period.from} AND "timestamp" < ${period.to} ${merchantSql}
        GROUP BY 1`,
      prisma.transaction.groupBy({
        by: ["merchantId", "status"],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      merchantOptions(),
    ])

    const rowsByKey = new Map(seriesRows.map((r) => [localDateKey(r.bucket), r]))
    const series = bucketFrame(period).map(({ key, label }) => {
      const r = rowsByKey.get(key)
      return {
        date: key,
        label,
        amount: Number(r?.amount ?? 0),
        successCount: Number(r?.success ?? 0),
        totalCount: Number(r?.total ?? 0),
      }
    })

    const info = new Map(merchants.map((m) => [m.id, m]))
    const agg = new Map<string, { successCount: number; totalCount: number; failedCount: number; amount: number }>()
    for (const row of perMerchant) {
      const a = agg.get(row.merchantId) ?? { successCount: 0, totalCount: 0, failedCount: 0, amount: 0 }
      a.totalCount += row._count._all
      if (row.status === "SUCCESS") {
        a.successCount += row._count._all
        a.amount += row._sum.amount ?? 0
      } else if (row.status === "FAILED") {
        a.failedCount += row._count._all
      }
      agg.set(row.merchantId, a)
    }
    const byMerchant = [...agg.entries()]
      .map(([id, a]) => ({
        id,
        name: info.get(id)?.name ?? id,
        branchName: info.get(id)?.branchName ?? "",
        ...a,
        share: current.amount ? (a.amount / current.amount) * 100 : 0,
      }))
      .sort((x, y) => y.amount - x.amount || y.totalCount - x.totalCount)

    return NextResponse.json({
      period: {
        fromDate: period.fromDate,
        toDate: period.toDate,
        days: period.days,
        bucket: period.bucket,
        prevFrom: period.prevFrom,
      },
      merchant: merchantId ? { id: merchantId, name: info.get(merchantId)?.name ?? merchantId } : null,
      current,
      previous,
      changes: {
        amount: pctChange(current.amount, previous.amount),
        successCount: pctChange(current.successCount, previous.successCount),
        totalCount: pctChange(current.totalCount, previous.totalCount),
        avgTicket: pctChange(current.avgTicket, previous.avgTicket),
      },
      series,
      byMerchant,
      merchants,
    })
  } catch (error) {
    console.error("Error fetching business dashboard stats:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
