"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  Lightbulb,
  Loader2,
  Minus,
  Receipt,
  RefreshCw,
  Store,
  TrendingUp,
  UserPlus,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ORIGIN_LABELS,
  PAYMENT_METHOD_LABELS,
  PIPELINE_STAGES,
  exportDashboardWorkbook,
  formatHour,
  type DashboardStats,
} from "@/lib/admin-dashboard-export"

const RANGE_OPTIONS = [
  { key: "7d", label: "7D", long: "7 days" },
  { key: "30d", label: "30D", long: "30 days" },
  { key: "90d", label: "90D", long: "13 weeks" },
  { key: "12m", label: "12M", long: "12 months" },
] as const

// Status hues are reserved for outcome states and always ship with a label.
const STATUS_COLORS = { success: "#0ca30c", failed: "#d03b3b", pending: "#a8a29e" }
const GOLD = "#f8b513"
const BROWN = "#754319"

const etb = (n: number, digits = 2) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ETB`
const compact = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })
const int = (n: number) => n.toLocaleString("en-US")
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa" })

function Delta({ value, unit = "%", invert = false }: { value: number | null; unit?: "%" | "pts"; invert?: boolean }) {
  if (value === null) {
    return <span className="text-xs font-medium text-[#6B7280]">New</span>
  }
  const rounded = Math.round(value * 10) / 10
  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#6B7280]">
        <Minus className="h-3.5 w-3.5" /> 0{unit === "%" ? "%" : " pts"}
      </span>
    )
  }
  const up = rounded > 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", good ? "text-emerald-700" : "text-rose-700")}>
      <Icon className="h-3.5 w-3.5" />
      {up ? "+" : ""}
      {rounded.toLocaleString("en-US")}
      {unit === "%" ? "%" : " pts"}
    </span>
  )
}

function KpiTile({
  title,
  value,
  sub,
  delta,
  icon: Icon,
}: {
  title: string
  value: string
  sub: string
  delta: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-[18px] border border-[#F1E7D0] bg-[#FFFDF7] p-4 shadow-sm shadow-black/5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold text-[#6B7280]">{title}</div>
        <span className="rounded-xl bg-[#f8b513]/10 p-1.5 text-[#754319]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-xl font-semibold tracking-tight text-[#1F2937] tabular-nums">{value}</div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-[#6B7280]">{sub}</span>
        {delta}
      </div>
    </div>
  )
}

/** Labelled horizontal bars: magnitude in one hue, every value printed beside its bar. */
function BarList({
  rows,
  format,
  empty,
}: {
  rows: { key: string; label: string; value: number; detail?: string }[]
  format: (n: number) => string
  empty: string
}) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (!rows.length || max === 0) {
    return <div className="py-6 text-center text-xs text-[#6B7280]">{empty}</div>
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium text-[#1F2937]">{r.label}</span>
            <span className="shrink-0 tabular-nums text-[#4B5563]">
              {format(r.value)}
              {r.detail ? <span className="ml-1.5 text-[#9CA3AF]">{r.detail}</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#F4ECDB]">
            <div
              className="h-2 rounded-full bg-[#f8b513]"
              style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ChartTooltip({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-[14px] border border-[#F1E7D0] bg-white px-3 py-2 text-xs shadow-md shadow-black/10">
      <div className="mb-1 font-semibold text-[#1F2937]">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 text-[#6B7280]">
          <span className="flex items-center gap-1.5">
            {r.color ? <span className="h-2 w-2 rounded-full" style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className="font-mono font-semibold text-[#1F2937]">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function buildHighlights(s: DashboardStats): string[] {
  const out: string[] = []
  const { current: c, changes } = s
  const prevWord = `the previous ${RANGE_OPTIONS.find((r) => r.key === s.range.key)?.long ?? "period"}`

  if (c.successCount === 0) {
    out.push(`No successful transactions in this period.`)
  } else if (changes.volume !== null) {
    const dir = changes.volume >= 0 ? "up" : "down"
    out.push(`Volume is ${dir} ${Math.abs(changes.volume).toFixed(1)}% on ${prevWord}, at ${etb(c.volume, 0)} across ${int(c.successCount)} payments.`)
  } else {
    out.push(`${etb(c.volume, 0)} processed across ${int(c.successCount)} payments — no activity in ${prevWord} to compare against.`)
  }

  const best = s.series.reduce((a, b) => (b.volume > a.volume ? b : a), s.series[0])
  if (best && best.volume > 0) out.push(`Busiest ${s.range.bucket} was ${best.label} with ${etb(best.volume, 0)}.`)

  const peak = s.hourly.reduce((a, b) => (b.count > a.count ? b : a), s.hourly[0])
  if (peak && peak.count > 0) {
    out.push(`Peak trading hour is ${formatHour(peak.hour)}–${formatHour((peak.hour + 1) % 24)} (${int(peak.count)} payments).`)
  }

  const top = s.topMerchants[0]
  if (top && top.share > 0) {
    const top3 = s.topMerchants.slice(0, 3).reduce((sum, m) => sum + m.share, 0)
    out.push(
      `${top.name} leads with ${top.share.toFixed(1)}% of volume; the top 3 merchants account for ${top3.toFixed(1)}%.`,
    )
  }

  if (c.successRate !== null && c.successRate < 90) {
    const reason = s.failureReasons[0]
    out.push(
      `Success rate is ${c.successRate.toFixed(1)}%${reason ? ` — most common failure: “${reason.reason}”` : ""}.`,
    )
  }

  if (s.pendingMerchants > 0) out.push(`${int(s.pendingMerchants)} merchant application${s.pendingMerchants === 1 ? " is" : "s are"} awaiting approval.`)

  const dormant = s.activeMerchants - c.payingMerchants
  if (dormant > 0) out.push(`${int(dormant)} approved merchant${dormant === 1 ? " has" : "s have"} had no successful sales this period.`)

  return out.slice(0, 5)
}

export function DashboardInsights({ userName }: { userName?: string }) {
  const { toast } = useToast()
  const [range, setRange] = useState<string>("30d")
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/admin/stats?range=${range}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 403 ? "You don't have permission to view dashboard analytics." : "Could not load dashboard analytics.")
        setStats(await res.json())
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [range, reloadKey])

  const handleExport = useCallback(async () => {
    if (!stats) return
    setExporting(true)
    try {
      await exportDashboardWorkbook(stats, userName)
      toast({ title: "Report exported", description: "The Excel workbook has been downloaded." })
    } catch (e) {
      console.error(e)
      toast({ title: "Export failed", description: "Could not build the Excel report.", variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }, [stats, userName, toast])

  const highlights = useMemo(() => (stats ? buildHighlights(stats) : []), [stats])
  const peakHour = useMemo(
    () => (stats ? stats.hourly.reduce((a, b) => (b.count > a.count ? b : a), stats.hourly[0]).hour : -1),
    [stats],
  )

  const c = stats?.current
  const settled = c ? c.successCount + c.failedCount + c.pendingCount : 0
  const rangeLong = RANGE_OPTIONS.find((r) => r.key === range)?.long ?? ""

  return (
    <section className="space-y-4" aria-busy={loading}>
      {/* Header: period, range picker, export */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#1F2937]">Performance overview</h2>
          <p className="text-xs text-[#6B7280]">
            {stats
              ? `${fmtDate(stats.range.from)} – ${fmtDate(stats.range.to)} · compared with the previous ${rangeLong}`
              : "Loading period…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Date range" className="flex rounded-xl border border-[#F1E7D0] bg-[#FFFDF7] p-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={range === opt.key}
                title={`Last ${opt.long}`}
                onClick={() => setRange(opt.key)}
                className={cn(
                  "h-8 rounded-[10px] px-3 text-xs font-semibold transition-colors",
                  range === opt.key ? "bg-white text-[#5b371f] shadow-sm ring-1 ring-[#f8b513]/40" : "text-[#754319]/60 hover:text-[#5b371f]",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            className="h-9 rounded-xl border-[#F1E7D0] bg-[#FFFDF7] hover:bg-amber-50/40"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={!stats || exporting}
            className="button-honey-solid h-9 rounded-xl px-4"
          >
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export Excel
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-[18px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      ) : null}

      {/* KPI tiles */}
      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6", loading && "opacity-60 transition-opacity")}>
        {c && stats ? (
          <>
            <KpiTile title="Successful volume" value={`${compact(c.volume)} ETB`} sub={etb(c.volume, 0)} delta={<Delta value={stats.changes.volume} />} icon={TrendingUp} />
            <KpiTile title="Successful payments" value={int(c.successCount)} sub={`${int(c.totalCount)} attempted`} delta={<Delta value={stats.changes.successCount} />} icon={Receipt} />
            <KpiTile
              title="Success rate"
              value={c.successRate === null ? "—" : `${c.successRate.toFixed(1)}%`}
              sub={`${int(c.failedCount)} failed`}
              delta={<Delta value={stats.changes.successRate} unit="pts" />}
              icon={CheckCircle2}
            />
            <KpiTile title="Average ticket" value={`${compact(c.avgTicket)} ETB`} sub="Per successful payment" delta={<Delta value={stats.changes.avgTicket} />} icon={Activity} />
            <KpiTile title="Merchants with sales" value={int(c.payingMerchants)} sub={`of ${int(stats.activeMerchants)} approved`} delta={<Delta value={stats.changes.payingMerchants} />} icon={Store} />
            <KpiTile title="New registrations" value={int(c.newMerchants)} sub={`${int(stats.pendingMerchants)} awaiting approval`} delta={<Delta value={stats.changes.newMerchants} />} icon={UserPlus} />
          </>
        ) : (
          Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[118px] animate-pulse rounded-[18px] bg-[#F7F1E3]" />)
        )}
      </div>

      {/* Volume trend + highlights */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="card-soft-cream rounded-[20px] lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base tracking-tight">Successful volume</CardTitle>
            <CardDescription className="text-[#6B7280]">
              ETB settled per {stats?.range.bucket ?? "day"}, Ethiopian time
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.series ?? []} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#E5DCC8" strokeOpacity={0.6} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={{ fill: "#6B7280", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "#6B7280", fontSize: 11 }} tickFormatter={(v) => compact(Number(v))} />
                <RechartsTooltip
                  cursor={{ stroke: BROWN, strokeOpacity: 0.3 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as DashboardStats["series"][number]
                    const settledHere = d.success + d.failed
                    return (
                      <ChartTooltip
                        title={d.label}
                        rows={[
                          { label: "Volume", value: etb(d.volume) },
                          { label: "Successful", value: int(d.success), color: STATUS_COLORS.success },
                          { label: "Failed", value: int(d.failed), color: STATUS_COLORS.failed },
                          { label: "Success rate", value: settledHere ? `${((d.success / settledHere) * 100).toFixed(1)}%` : "—" },
                        ]}
                      />
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke={BROWN}
                  strokeWidth={2}
                  fill="url(#volumeFill)"
                  dot={false}
                  activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: BROWN }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="card-soft-cream rounded-[20px]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base tracking-tight">
              <Lightbulb className="h-4 w-4 text-[#754319]" /> Key insights
            </CardTitle>
            <CardDescription className="text-[#6B7280]">Generated from the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {highlights.length ? (
              <ul className="space-y-3">
                {highlights.map((h) => (
                  <li key={h} className="flex gap-2.5 text-sm leading-snug text-[#374151]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f8b513]" />
                    {h}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-4 animate-pulse rounded bg-[#F7F1E3]" />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment health, channels, peak hours */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="card-soft-cream rounded-[20px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base tracking-tight">Payment outcomes</CardTitle>
            <CardDescription className="text-[#6B7280]">All attempts in the period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {c && settled > 0 ? (
              <>
                <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Outcome split">
                  {(
                    [
                      ["success", c.successCount],
                      ["failed", c.failedCount],
                      ["pending", c.pendingCount],
                    ] as const
                  ).map(([k, v]) =>
                    v > 0 ? <div key={k} style={{ width: `${(v / settled) * 100}%`, background: STATUS_COLORS[k] }} /> : null,
                  )}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  {(
                    [
                      ["success", "Successful", c.successCount, CheckCircle2],
                      ["failed", "Failed", c.failedCount, AlertTriangle],
                      ["pending", "In progress", c.pendingCount, Clock],
                    ] as const
                  ).map(([k, label, v, Icon]) => (
                    <div key={k}>
                      <dt className="flex items-center gap-1 text-[#6B7280]">
                        <Icon className="h-3.5 w-3.5" style={{ color: STATUS_COLORS[k] }} /> {label}
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-[#1F2937]">
                        {int(v)} <span className="font-normal text-[#9CA3AF]">{((v / settled) * 100).toFixed(0)}%</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <div className="py-4 text-center text-xs text-[#6B7280]">No payment attempts in this period.</div>
            )}
            <div className="border-t border-[#F1E7D0] pt-3">
              <div className="mb-2 text-xs font-semibold text-[#4B5563]">Top failure reasons</div>
              <BarList
                rows={(stats?.failureReasons ?? []).map((f) => ({ key: f.reason, label: f.reason, value: f.count }))}
                format={int}
                empty="No failed payments."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="card-soft-cream rounded-[20px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base tracking-tight">Channel mix</CardTitle>
            <CardDescription className="text-[#6B7280]">Successful volume by payment method</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <BarList
              rows={(stats?.paymentMethods ?? []).map((m) => ({
                key: m.method,
                label: PAYMENT_METHOD_LABELS[m.method] ?? m.method,
                value: m.volume,
                detail: `${int(m.count)} txns`,
              }))}
              format={(n) => `${compact(n)} ETB`}
              empty="No successful payments."
            />
            <div className="border-t border-[#F1E7D0] pt-3">
              <div className="mb-2 text-xs font-semibold text-[#4B5563]">By origin</div>
              <BarList
                rows={(stats?.origins ?? []).map((o) => ({
                  key: o.origin,
                  label: ORIGIN_LABELS[o.origin] ?? o.origin,
                  value: o.volume,
                  detail: `${int(o.count)} txns`,
                }))}
                format={(n) => `${compact(n)} ETB`}
                empty="No successful payments."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="card-soft-cream rounded-[20px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base tracking-tight">Peak hours</CardTitle>
            <CardDescription className="text-[#6B7280]">
              Successful payments by hour of day
              {stats && peakHour >= 0 && stats.hourly[peakHour].count > 0 ? ` · busiest ${formatHour(peakHour)}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.hourly ?? []} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="#E5DCC8" strokeOpacity={0.6} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={5} tick={{ fill: "#6B7280", fontSize: 11 }} tickFormatter={(h) => formatHour(Number(h))} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: "#6B7280", fontSize: 11 }} tickFormatter={(v) => compact(Number(v))} />
                <RechartsTooltip
                  cursor={{ fill: "#f8b513", fillOpacity: 0.08 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as DashboardStats["hourly"][number]
                    return (
                      <ChartTooltip
                        title={`${formatHour(d.hour)}–${formatHour((d.hour + 1) % 24)}`}
                        rows={[
                          { label: "Payments", value: int(d.count) },
                          { label: "Volume", value: etb(d.volume, 0) },
                        ]}
                      />
                    )
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {(stats?.hourly ?? []).map((h) => (
                    <Cell key={h.hour} fill={h.hour === peakHour && h.count > 0 ? BROWN : GOLD} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top merchants + pipeline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="card-soft-cream rounded-[20px] lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base tracking-tight">Top merchants</CardTitle>
            <CardDescription className="text-[#6B7280]">Ranked by successful volume, with change vs previous period</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.topMerchants.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-[#F1E7D0] text-left text-[11px] uppercase tracking-wide text-[#9CA3AF]">
                      <th className="py-2 pr-2 font-semibold">#</th>
                      <th className="py-2 pr-2 font-semibold">Merchant</th>
                      <th className="py-2 pr-2 text-right font-semibold">Volume</th>
                      <th className="py-2 pr-2 text-right font-semibold">Txns</th>
                      <th className="w-[22%] py-2 pr-2 font-semibold">Share</th>
                      <th className="py-2 text-right font-semibold">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topMerchants.map((m, i) => (
                      <tr key={m.id} className="border-b border-[#F1E7D0]/60 last:border-0">
                        <td className="py-2.5 pr-2 text-xs tabular-nums text-[#9CA3AF]">{i + 1}</td>
                        <td className="max-w-[220px] py-2.5 pr-2">
                          <div className="truncate font-medium text-[#1F2937]">{m.name}</div>
                          <div className="truncate text-[11px] text-[#9CA3AF]">{[m.branchName, m.category].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="py-2.5 pr-2 text-right tabular-nums text-[#1F2937]">{etb(m.volume, 0)}</td>
                        <td className="py-2.5 pr-2 text-right tabular-nums text-[#4B5563]">{int(m.count)}</td>
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-[#F4ECDB]">
                              <div className="h-1.5 rounded-full bg-[#f8b513]" style={{ width: `${m.share}%` }} />
                            </div>
                            <span className="w-11 text-right text-xs tabular-nums text-[#4B5563]">{m.share.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <Delta value={m.change} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#6B7280]">
                {loading ? "Loading…" : "No merchant sales in this period."}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-soft-cream rounded-[20px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base tracking-tight">Merchant pipeline</CardTitle>
            <CardDescription className="text-[#6B7280]">
              {stats ? `${int(stats.totalMerchants)} merchants · ${int(stats.activeUsers)} active system users` : "All-time status"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              rows={PIPELINE_STAGES.map((s) => ({
                key: s.status,
                label: s.label,
                value: stats?.merchantPipeline[s.status] ?? 0,
              }))}
              format={int}
              empty={loading ? "Loading…" : "No merchants yet."}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
