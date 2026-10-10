import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAuthUser } from "@/lib/request-auth"
import { DASHBOARD_BUSINESS_VIEW } from "@/lib/dashboard-permissions"
import { TZ_INTERVAL, bucketFrame, localDateKey, merchantOptions, parsePeriod, pctChange } from "@/lib/dashboard-period"

/** Upper bound on transaction rows returned for an Excel export. */
const DETAIL_LIMIT = 20000

// The business view reports successful transactions only; failures and
// abandoned payments belong to the technical view.

async function totals(where: Prisma.TransactionWhereInput) {
  const [sum, merchantsWithSales] = await Promise.all([
    prisma.transaction.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.transaction.groupBy({ by: ["merchantId"], where }),
  ])
  return {
    amount: sum._sum.amount ?? 0,
    successCount: sum._count._all,
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
    const where: Prisma.TransactionWhereInput = {
      ...merchantWhere,
      status: "SUCCESS",
      timestamp: { gte: period.from, lt: period.to },
    }

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
          paymentMethod: true,
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
      totals({ ...merchantWhere, status: "SUCCESS", timestamp: { gte: period.prevFrom, lt: period.from } }),
      prisma.$queryRaw<{ bucket: Date; amount: number | null; count: bigint }[]>`
        SELECT date_trunc(${period.bucket}, "timestamp" + ${TZ_INTERVAL}::interval) AS bucket,
               SUM(amount) AS amount,
               COUNT(*) AS count
        FROM "Transaction"
        WHERE status = 'SUCCESS' AND "timestamp" >= ${period.from} AND "timestamp" < ${period.to} ${merchantSql}
        GROUP BY 1`,
      prisma.transaction.groupBy({ by: ["merchantId"], where, _sum: { amount: true }, _count: { _all: true } }),
      merchantOptions(),
    ])

    const rowsByKey = new Map(seriesRows.map((r) => [localDateKey(r.bucket), r]))
    const series = bucketFrame(period).map(({ key, label }) => {
      const r = rowsByKey.get(key)
      return { date: key, label, amount: Number(r?.amount ?? 0), successCount: Number(r?.count ?? 0) }
    })

    const info = new Map(merchants.map((m) => [m.id, m]))
    const byMerchant = perMerchant
      .map((r) => {
        const amount = r._sum.amount ?? 0
        return {
          id: r.merchantId,
          name: info.get(r.merchantId)?.name ?? r.merchantId,
          branchName: info.get(r.merchantId)?.branchName ?? "",
          successCount: r._count._all,
          amount,
          share: current.amount ? (amount / current.amount) * 100 : 0,
        }
      })
      .sort((x, y) => y.amount - x.amount || y.successCount - x.successCount)

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
        merchantsWithSales: pctChange(current.merchantsWithSales, previous.merchantsWithSales),
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
