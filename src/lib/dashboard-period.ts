// Server-side date-period helpers shared by the business and technical dashboard APIs.
import { prisma } from "@/lib/prisma"

// Ethiopia has no DST, so a fixed offset keeps day/hour buckets aligned with
// what merchants and staff see on their clocks.
export const TZ_OFFSET_MS = 3 * 60 * 60 * 1000
export const TZ_INTERVAL = "3 hours"
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_SPAN_DAYS = 731

export type Bucket = "day" | "week" | "month"

export type Period = {
  /** Inclusive local (EAT) calendar dates, YYYY-MM-DD. */
  fromDate: string
  toDate: string
  /** UTC instants: [from, to) is the period, [prevFrom, from) the comparison period. */
  from: Date
  to: Date
  prevFrom: Date
  days: number
  bucket: Bucket
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Local midnight of a YYYY-MM-DD date, expressed as a UTC-field Date (no offset applied). */
function parseLocalDate(s: string | null): Date | null {
  if (!s || !DATE_RE.test(s)) return null
  const d = new Date(`${s}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export const localDateKey = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Reads `from` / `to` (inclusive local dates) from the query string. Missing or
 * invalid values fall back to the last 30 days; spans are capped at two years.
 */
export function parsePeriod(params: URLSearchParams): Period | { error: string } {
  const localToday = new Date(Math.floor((Date.now() + TZ_OFFSET_MS) / DAY_MS) * DAY_MS)
  let toLocal = parseLocalDate(params.get("to")) ?? localToday
  let fromLocal = parseLocalDate(params.get("from")) ?? new Date(toLocal.getTime() - 29 * DAY_MS)
  if (fromLocal > toLocal) [fromLocal, toLocal] = [toLocal, fromLocal]

  const days = Math.round((toLocal.getTime() - fromLocal.getTime()) / DAY_MS) + 1
  if (days > MAX_SPAN_DAYS) return { error: "Date range cannot exceed two years." }

  const from = new Date(fromLocal.getTime() - TZ_OFFSET_MS)
  const to = new Date(toLocal.getTime() + DAY_MS - TZ_OFFSET_MS)
  const prevFrom = new Date(from.getTime() - days * DAY_MS)
  const bucket: Bucket = days <= 45 ? "day" : days <= 200 ? "week" : "month"

  return { fromDate: localDateKey(fromLocal), toDate: localDateKey(toLocal), from, to, prevFrom, days, bucket }
}

/** Truncates a local (offset-shifted) date to the start of its bucket, matching Postgres date_trunc. */
function truncLocal(d: Date, bucket: Bucket): Date {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  if (bucket === "week") t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7))
  else if (bucket === "month") t.setUTCDate(1)
  return t
}

function stepLocal(d: Date, bucket: Bucket): Date {
  const t = new Date(d)
  if (bucket === "day") t.setUTCDate(t.getUTCDate() + 1)
  else if (bucket === "week") t.setUTCDate(t.getUTCDate() + 7)
  else t.setUTCMonth(t.getUTCMonth() + 1)
  return t
}

function bucketLabel(d: Date, bucket: Bucket): string {
  return bucket === "month"
    ? d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" })
    : d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
}

/**
 * Every bucket start in the period, so charts show empty buckets as zero
 * rather than skipping them. Keys match `localDateKey(date_trunc(...))` rows.
 */
export function bucketFrame(period: Period): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  const start = new Date(`${period.fromDate}T00:00:00.000Z`)
  const end = new Date(`${period.toDate}T00:00:00.000Z`)
  for (let d = truncLocal(start, period.bucket); d <= end; d = stepLocal(d, period.bucket)) {
    // A first week/month that began before the range is labelled from the range start.
    out.push({ key: localDateKey(d), label: bucketLabel(d < start ? start : d, period.bucket) })
  }
  return out
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

/** Merchants offered in the dashboard merchant filter. */
export async function merchantOptions() {
  return prisma.merchant.findMany({
    where: { OR: [{ status: { in: ["APPROVED", "ACTIVE"] } }, { transactions: { some: {} } }] },
    select: { id: true, name: true, branchName: true },
    orderBy: { name: "asc" },
  })
}
