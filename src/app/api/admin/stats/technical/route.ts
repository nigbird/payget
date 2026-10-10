import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAuthUser } from "@/lib/request-auth"
import { DASHBOARD_TECHNICAL_VIEW } from "@/lib/dashboard-permissions"
import { TZ_INTERVAL, bucketFrame, localDateKey, merchantOptions, parsePeriod, pctChange } from "@/lib/dashboard-period"

/** A non-terminal payment older than this is reported as stuck. */
const STUCK_AFTER_MS = 30 * 60 * 1000
const IN_FLIGHT = ["INITIATED", "PENDING", "AWAITING_PIN", "PROCESSING"] as const

async function periodTotals(where: Prisma.TransactionWhereInput) {
  const [byStatus, payingMerchants] = await Promise.all([
    prisma.transaction.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.transaction.groupBy({ by: ["merchantId"], where: { ...where, status: "SUCCESS" } }),
  ])
  const success = byStatus.find((s) => s.status === "SUCCESS")
  const volume = success?._sum.amount ?? 0
  const successCount = success?._count._all ?? 0
  const failedCount = byStatus.find((s) => s.status === "FAILED")?._count._all ?? 0
  const totalCount = byStatus.reduce((sum, s) => sum + s._count._all, 0)
  const settled = successCount + failedCount
  return {
    volume,
    successCount,
    failedCount,
    pendingCount: totalCount - settled,
    totalCount,
    avgTicket: successCount ? volume / successCount : 0,
    successRate: settled ? (successCount / settled) * 100 : null,
    payingMerchants: payingMerchants.length,
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!user.permissions?.includes(DASHBOARD_TECHNICAL_VIEW)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const params = new URL(request.url).searchParams
    const period = parsePeriod(params)
    if ("error" in period) return NextResponse.json({ error: period.error }, { status: 400 })

    const merchantId = params.get("merchantId") || null
    const merchantWhere = merchantId ? { merchantId } : {}
    const merchantSql = merchantId ? Prisma.sql`AND "merchantId" = ${merchantId}` : Prisma.empty
    const where: Prisma.TransactionWhereInput = { ...merchantWhere, timestamp: { gte: period.from, lt: period.to } }
    const now = new Date()
    const stuckWhere: Prisma.TransactionWhereInput = {
      ...merchantWhere,
      status: { in: [...IN_FLIGHT] },
      timestamp: { gte: period.from, lt: new Date(Math.min(period.to.getTime(), now.getTime() - STUCK_AFTER_MS)) },
    }

    const [
      current,
      previous,
      seriesRows,
      hourlyRows,
      byMethodStatus,
      byOrigin,
      byMerchantStatus,
      providerRows,
      stuckCount,
      stuckOldest,
      callbackRows,
      paymentReconPending,
      mpgsReconPending,
      cashbackRows,
      activeSessions,
      ipLockouts,
      identifierLockouts,
      pipeline,
      activeUsers,
      newMerchants,
      prevNewMerchants,
      merchants,
    ] = await Promise.all([
      periodTotals(where),
      periodTotals({ ...merchantWhere, timestamp: { gte: period.prevFrom, lt: period.from } }),
      prisma.$queryRaw<{ bucket: Date; volume: number | null; success: bigint; failed: bigint; total: bigint }[]>`
        SELECT date_trunc(${period.bucket}, "timestamp" + ${TZ_INTERVAL}::interval) AS bucket,
               SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) AS volume,
               COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success,
               COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
               COUNT(*) AS total
        FROM "Transaction"
        WHERE "timestamp" >= ${period.from} AND "timestamp" < ${period.to} ${merchantSql}
        GROUP BY 1`,
      prisma.$queryRaw<{ hour: number; count: bigint; failed: bigint; volume: number | null }[]>`
        SELECT EXTRACT(HOUR FROM "timestamp" + ${TZ_INTERVAL}::interval)::int AS hour,
               COUNT(*) FILTER (WHERE status = 'SUCCESS') AS count,
               COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
               SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) AS volume
        FROM "Transaction"
        WHERE "timestamp" >= ${period.from} AND "timestamp" < ${period.to} ${merchantSql}
        GROUP BY 1`,
      prisma.transaction.groupBy({ by: ["paymentMethod", "status"], where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.transaction.groupBy({
        by: ["origin"],
        where: { ...where, status: "SUCCESS" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({ by: ["merchantId", "status"], where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.transaction.groupBy({
        by: ["providerStatusCode", "providerStatusDesc"],
        where: { ...where, status: "FAILED" },
        _count: { _all: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
      prisma.transaction.count({ where: stuckWhere }),
      prisma.transaction.findMany({
        where: stuckWhere,
        orderBy: { timestamp: "asc" },
        take: 8,
        select: {
          id: true,
          transactionReference: true,
          amount: true,
          status: true,
          paymentMethod: true,
          timestamp: true,
          merchant: { select: { name: true } },
        },
      }),
      prisma.merchantCallbackQueue.groupBy({ by: ["status"], where: merchantWhere, _count: { _all: true } }),
      prisma.paymentReconciliationRequest.count({
        where: { status: "PENDING", ...(merchantId ? { transaction: { merchantId } } : {}) },
      }),
      prisma.mpgsReconciliationRequest.count({
        where: { status: "PENDING", ...(merchantId ? { transaction: { merchantId } } : {}) },
      }),
      prisma.cashbackTransaction.groupBy({
        by: ["status"],
        where: { ...merchantWhere, createdAt: { gte: period.from, lt: period.to } },
        _sum: { cashbackAmount: true },
        _count: { _all: true },
      }),
      prisma.activeSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
      prisma.ipLockout.count({ where: { lockoutUntil: { gt: now } } }),
      prisma.loginIdentifierLockout.count({ where: { lockoutUntil: { gt: now } } }),
      prisma.merchant.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.merchant.count({ where: { createdAt: { gte: period.from, lt: period.to } } }),
      prisma.merchant.count({ where: { createdAt: { gte: period.prevFrom, lt: period.from } } }),
      merchantOptions(),
    ])

    // Time series, zero-filled.
    const seriesByKey = new Map(seriesRows.map((r) => [localDateKey(r.bucket), r]))
    const series = bucketFrame(period).map(({ key, label }) => {
      const r = seriesByKey.get(key)
      const success = Number(r?.success ?? 0)
      const failed = Number(r?.failed ?? 0)
      const total = Number(r?.total ?? 0)
      return {
        date: key,
        label,
        volume: Number(r?.volume ?? 0),
        success,
        failed,
        pending: total - success - failed,
        successRate: success + failed ? (success / (success + failed)) * 100 : null,
      }
    })

    const hourlyByHour = new Map(hourlyRows.map((r) => [Number(r.hour), r]))
    const hourly = Array.from({ length: 24 }, (_, hour) => {
      const r = hourlyByHour.get(hour)
      return { hour, count: Number(r?.count ?? 0), failed: Number(r?.failed ?? 0), volume: Number(r?.volume ?? 0) }
    })

    // Per payment method health.
    const methodAgg = new Map<string, { total: number; success: number; failed: number; volume: number }>()
    for (const r of byMethodStatus) {
      const a = methodAgg.get(r.paymentMethod) ?? { total: 0, success: 0, failed: 0, volume: 0 }
      a.total += r._count._all
      if (r.status === "SUCCESS") {
        a.success += r._count._all
        a.volume += r._sum.amount ?? 0
      } else if (r.status === "FAILED") a.failed += r._count._all
      methodAgg.set(r.paymentMethod, a)
    }
    const methodHealth = [...methodAgg.entries()]
      .map(([method, a]) => ({
        method,
        ...a,
        pending: a.total - a.success - a.failed,
        successRate: a.success + a.failed ? (a.success / (a.success + a.failed)) * 100 : null,
      }))
      .sort((x, y) => y.total - x.total)

    const statusBreakdown: Record<string, number> = {}
    for (const r of byMethodStatus) statusBreakdown[r.status] = (statusBreakdown[r.status] ?? 0) + r._count._all

    // Per merchant: volume ranking and failure ranking.
    const info = new Map(merchants.map((m) => [m.id, m]))
    const merchantAgg = new Map<string, { total: number; success: number; failed: number; volume: number }>()
    for (const r of byMerchantStatus) {
      const a = merchantAgg.get(r.merchantId) ?? { total: 0, success: 0, failed: 0, volume: 0 }
      a.total += r._count._all
      if (r.status === "SUCCESS") {
        a.success += r._count._all
        a.volume += r._sum.amount ?? 0
      } else if (r.status === "FAILED") a.failed += r._count._all
      merchantAgg.set(r.merchantId, a)
    }
    const merchantRows = [...merchantAgg.entries()].map(([id, a]) => ({
      id,
      name: info.get(id)?.name ?? id,
      branchName: info.get(id)?.branchName ?? "",
      ...a,
      successRate: a.success + a.failed ? (a.success / (a.success + a.failed)) * 100 : null,
    }))

    const top = merchantRows.filter((m) => m.volume > 0).sort((x, y) => y.volume - x.volume).slice(0, 10)
    const topPrev = top.length
      ? await prisma.transaction.groupBy({
          by: ["merchantId"],
          where: { merchantId: { in: top.map((m) => m.id) }, status: "SUCCESS", timestamp: { gte: period.prevFrom, lt: period.from } },
          _sum: { amount: true },
        })
      : []
    const prevById = new Map(topPrev.map((p) => [p.merchantId, p._sum.amount ?? 0]))
    const topMerchants = top.map((m) => ({
      ...m,
      count: m.success,
      share: current.volume ? (m.volume / current.volume) * 100 : 0,
      change: pctChange(m.volume, prevById.get(m.id) ?? 0),
    }))

    const failingMerchants = merchantRows
      .filter((m) => m.failed > 0)
      .sort((x, y) => y.failed - x.failed)
      .slice(0, 6)

    const pipelineCounts = Object.fromEntries(pipeline.map((p) => [p.status, p._count._all])) as Record<string, number>
    const count = (rows: { status: string; _count: { _all: number } }[], status: string) =>
      rows.find((r) => r.status === status)?._count._all ?? 0

    return NextResponse.json({
      period: {
        fromDate: period.fromDate,
        toDate: period.toDate,
        days: period.days,
        bucket: period.bucket,
        prevFrom: period.prevFrom,
      },
      merchant: merchantId ? { id: merchantId, name: info.get(merchantId)?.name ?? merchantId } : null,
      current: { ...current, newMerchants },
      previous: { ...previous, newMerchants: prevNewMerchants },
      changes: {
        volume: pctChange(current.volume, previous.volume),
        successCount: pctChange(current.successCount, previous.successCount),
        avgTicket: pctChange(current.avgTicket, previous.avgTicket),
        payingMerchants: pctChange(current.payingMerchants, previous.payingMerchants),
        newMerchants: pctChange(newMerchants, prevNewMerchants),
        // Success rate moves in percentage points, not percent.
        successRate:
          current.successRate !== null && previous.successRate !== null ? current.successRate - previous.successRate : null,
      },
      series,
      hourly,
      statusBreakdown,
      methodHealth,
      origins: byOrigin
        .map((o) => ({ origin: o.origin, volume: o._sum.amount ?? 0, count: o._count._all }))
        .sort((a, b) => b.volume - a.volume),
      providerErrors: providerRows.map((r) => ({
        code: r.providerStatusCode ?? "",
        reason: r.providerStatusDesc?.trim() || "No reason reported",
        count: r._count._all,
      })),
      stuck: {
        count: stuckCount,
        thresholdMinutes: STUCK_AFTER_MS / 60000,
        oldest: stuckOldest.map((t) => ({
          id: t.id,
          reference: t.transactionReference,
          merchant: t.merchant.name,
          amount: t.amount,
          status: t.status,
          method: t.paymentMethod,
          timestamp: t.timestamp,
        })),
      },
      topMerchants,
      failingMerchants,
      operations: {
        callbacks: {
          pending: count(callbackRows, "PENDING"),
          delivered: count(callbackRows, "DELIVERED"),
          exhausted: count(callbackRows, "EXHAUSTED"),
        },
        paymentReconPending,
        mpgsReconPending,
        cashback: cashbackRows.map((r) => ({ status: r.status, count: r._count._all, amount: r._sum.cashbackAmount ?? 0 })),
        activeSessions,
        ipLockouts,
        identifierLockouts,
      },
      merchantPipeline: pipelineCounts,
      totalMerchants: pipeline.reduce((sum, p) => sum + p._count._all, 0),
      activeMerchants: (pipelineCounts.APPROVED ?? 0) + (pipelineCounts.ACTIVE ?? 0),
      pendingMerchants:
        (pipelineCounts.PENDING ?? 0) + (pipelineCounts.BRANCH_APPROVED ?? 0) + (pipelineCounts.RESUBMITTED ?? 0),
      activeUsers,
      merchants,
    })
  } catch (error) {
    console.error("Error fetching technical dashboard stats:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
