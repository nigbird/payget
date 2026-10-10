import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser } from "@/lib/request-auth"

// Ethiopia has no DST, so a fixed offset keeps day/hour buckets aligned with
// what merchants and staff see on their clocks.
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000
const TZ_INTERVAL = "3 hours"

type Bucket = "day" | "week" | "month"

const RANGES: Record<string, { bucket: Bucket; count: number; label: string }> = {
  "7d": { bucket: "day", count: 7, label: "Last 7 days" },
  "30d": { bucket: "day", count: 30, label: "Last 30 days" },
  "90d": { bucket: "week", count: 13, label: "Last 13 weeks" },
  "12m": { bucket: "month", count: 12, label: "Last 12 months" },
}

/** Truncates a local (offset-shifted) date to the start of its bucket, using UTC fields. */
function truncLocal(d: Date, bucket: Bucket): Date {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  if (bucket === "week") {
    const dow = (t.getUTCDay() + 6) % 7 // Monday = 0, matching Postgres date_trunc('week')
    t.setUTCDate(t.getUTCDate() - dow)
  } else if (bucket === "month") {
    t.setUTCDate(1)
  }
  return t
}

function stepLocal(d: Date, bucket: Bucket, n: number): Date {
  const t = new Date(d)
  if (bucket === "day") t.setUTCDate(t.getUTCDate() + n)
  else if (bucket === "week") t.setUTCDate(t.getUTCDate() + 7 * n)
  else t.setUTCMonth(t.getUTCMonth() + n)
  return t
}

function bucketLabel(d: Date, bucket: Bucket): string {
  return bucket === "month"
    ? d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" })
    : d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
}

const bucketKey = (d: Date) => d.toISOString().slice(0, 10)

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

async function periodTotals(from: Date, to: Date) {
  const [byStatus, payingMerchants, newMerchants] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["status"],
      where: { timestamp: { gte: from, lt: to } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["merchantId"],
      where: { status: "SUCCESS", timestamp: { gte: from, lt: to } },
    }),
    prisma.merchant.count({ where: { createdAt: { gte: from, lt: to } } }),
  ])

  const success = byStatus.find((s) => s.status === "SUCCESS")
  const failed = byStatus.find((s) => s.status === "FAILED")
  const volume = success?._sum.amount ?? 0
  const successCount = success?._count._all ?? 0
  const failedCount = failed?._count._all ?? 0
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
    newMerchants,
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only allow users whose assigned role grants dashboard access
    const isAllowed = user.permissions?.includes("DASHBOARD_VIEW")
    if (!isAllowed) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const rangeKey = new URL(request.url).searchParams.get("range") ?? "30d"
    const range = RANGES[rangeKey] ?? RANGES["30d"]
    const { bucket } = range

    // Period boundaries are computed in local time, then shifted back to UTC for queries.
    const now = new Date()
    const localNow = new Date(now.getTime() + TZ_OFFSET_MS)
    const firstBucket = stepLocal(truncLocal(localNow, bucket), bucket, -(range.count - 1))
    const from = new Date(firstBucket.getTime() - TZ_OFFSET_MS)
    const prevFrom = new Date(from.getTime() - (now.getTime() - from.getTime()))
    const periodWhere = { timestamp: { gte: from, lt: now } }

    const [
      current,
      previous,
      seriesRows,
      hourlyRows,
      byMethod,
      byOrigin,
      topMerchantRows,
      failureRows,
      pipeline,
      activeUsers,
    ] = await Promise.all([
      periodTotals(from, now),
      periodTotals(prevFrom, from),
      prisma.$queryRaw<{ bucket: Date; volume: number | null; success: bigint; failed: bigint; total: bigint }[]>`
        SELECT date_trunc(${bucket}, "timestamp" + ${TZ_INTERVAL}::interval) AS bucket,
               SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END) AS volume,
               COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success,
               COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
               COUNT(*) AS total
        FROM "Transaction"
        WHERE "timestamp" >= ${from} AND "timestamp" < ${now}
        GROUP BY 1
        ORDER BY 1`,
      prisma.$queryRaw<{ hour: number; count: bigint; volume: number | null }[]>`
        SELECT EXTRACT(HOUR FROM "timestamp" + ${TZ_INTERVAL}::interval)::int AS hour,
               COUNT(*) AS count,
               SUM(amount) AS volume
        FROM "Transaction"
        WHERE status = 'SUCCESS' AND "timestamp" >= ${from} AND "timestamp" < ${now}
        GROUP BY 1`,
      prisma.transaction.groupBy({
        by: ["paymentMethod"],
        where: { ...periodWhere, status: "SUCCESS" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ["origin"],
        where: { ...periodWhere, status: "SUCCESS" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ["merchantId"],
        where: { ...periodWhere, status: "SUCCESS" },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 10,
      }),
      prisma.transaction.groupBy({
        by: ["providerStatusDesc"],
        where: { ...periodWhere, status: "FAILED" },
        _count: { _all: true },
        orderBy: { _count: { id: "desc" } },
        take: 6,
      }),
      prisma.merchant.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
    ])

    // Zero-fill the time series so gaps show as real zeros rather than missing points.
    const seriesByKey = new Map(seriesRows.map((r) => [bucketKey(r.bucket), r]))
    const series = Array.from({ length: range.count }, (_, i) => {
      const start = stepLocal(firstBucket, bucket, i)
      const row = seriesByKey.get(bucketKey(start))
      const success = Number(row?.success ?? 0)
      const failed = Number(row?.failed ?? 0)
      const total = Number(row?.total ?? 0)
      return {
        date: bucketKey(start),
        label: bucketLabel(start, bucket),
        volume: Number(row?.volume ?? 0),
        success,
        failed,
        pending: total - success - failed,
      }
    })

    const hourlyByHour = new Map(hourlyRows.map((r) => [Number(r.hour), r]))
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: Number(hourlyByHour.get(hour)?.count ?? 0),
      volume: Number(hourlyByHour.get(hour)?.volume ?? 0),
    }))

    // Previous-period volume for the top merchants, so each row can show its own trend.
    const topIds = topMerchantRows.map((r) => r.merchantId)
    const [merchantInfo, topPrev] = topIds.length
      ? await Promise.all([
          prisma.merchant.findMany({
            where: { id: { in: topIds } },
            select: { id: true, name: true, branchName: true, category: true },
          }),
          prisma.transaction.groupBy({
            by: ["merchantId"],
            where: { merchantId: { in: topIds }, status: "SUCCESS", timestamp: { gte: prevFrom, lt: from } },
            _sum: { amount: true },
          }),
        ])
      : [[], []]
    const infoById = new Map(merchantInfo.map((m) => [m.id, m]))
    const prevById = new Map(topPrev.map((p) => [p.merchantId, p._sum.amount ?? 0]))

    const topMerchants = topMerchantRows.map((r) => {
      const volume = r._sum.amount ?? 0
      const info = infoById.get(r.merchantId)
      return {
        id: r.merchantId,
        name: info?.name ?? r.merchantId,
        branchName: info?.branchName ?? "",
        category: info?.category ?? "",
        volume,
        count: r._count._all,
        share: current.volume ? (volume / current.volume) * 100 : 0,
        change: pctChange(volume, prevById.get(r.merchantId) ?? 0),
      }
    })

    const pipelineCounts = Object.fromEntries(pipeline.map((p) => [p.status, p._count._all])) as Record<string, number>
    const totalMerchants = pipeline.reduce((sum, p) => sum + p._count._all, 0)
    const activeMerchants = (pipelineCounts.APPROVED ?? 0) + (pipelineCounts.ACTIVE ?? 0)
    const pendingMerchants =
      (pipelineCounts.PENDING ?? 0) + (pipelineCounts.BRANCH_APPROVED ?? 0) + (pipelineCounts.RESUBMITTED ?? 0)

    return NextResponse.json({
      range: { key: RANGES[rangeKey] ? rangeKey : "30d", label: range.label, bucket, from, to: now, prevFrom },
      current,
      previous,
      changes: {
        volume: pctChange(current.volume, previous.volume),
        successCount: pctChange(current.successCount, previous.successCount),
        avgTicket: pctChange(current.avgTicket, previous.avgTicket),
        payingMerchants: pctChange(current.payingMerchants, previous.payingMerchants),
        newMerchants: pctChange(current.newMerchants, previous.newMerchants),
        // Success rate moves in percentage points, not percent.
        successRate:
          current.successRate !== null && previous.successRate !== null
            ? current.successRate - previous.successRate
            : null,
      },
      series,
      hourly,
      paymentMethods: byMethod
        .map((m) => ({ method: m.paymentMethod, volume: m._sum.amount ?? 0, count: m._count._all }))
        .sort((a, b) => b.volume - a.volume),
      origins: byOrigin
        .map((o) => ({ origin: o.origin, volume: o._sum.amount ?? 0, count: o._count._all }))
        .sort((a, b) => b.volume - a.volume),
      topMerchants,
      failureReasons: failureRows.map((f) => ({
        reason: f.providerStatusDesc?.trim() || "No reason reported",
        count: f._count._all,
      })),
      merchantPipeline: pipelineCounts,
      totalMerchants,
      activeMerchants,
      pendingMerchants,
      activeUsers,
    })
  } catch (error) {
    console.error("Error fetching admin stats:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
