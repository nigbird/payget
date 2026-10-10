"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  KeyRound,
  Lightbulb,
  Loader2,
  Receipt,
  RefreshCw,
  Scale,
  Send,
  ShieldAlert,
  Store,
  TrendingUp,
  UserPlus,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ORIGIN_LABELS,
  PAYMENT_METHOD_LABELS,
  PIPELINE_STAGES,
  STATUS_LABELS,
  exportTechnicalWorkbook,
  formatHour,
  formatPeriod,
  type MerchantOption,
  type TechnicalStats,
} from "@/lib/admin-dashboard-export"
import {
  BROWN,
  BarList,
  ChartTooltip,
  Delta,
  ErrorBanner,
  FilterBar,
  GOLD,
  KpiSkeleton,
  KpiTile,
  STATUS_COLORS,
  compact,
  etb,
  int,
  pct,
  useDashboardStats,
  type DashboardFilters,
} from "./shared"

const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

function buildHighlights(s: TechnicalStats): string[] {
  const out: string[] = []
  const { current: c, changes } = s
  const prev = `the previous ${s.period.days} days`

  if (c.totalCount === 0) return ["No payment activity in this period."]

  if (changes.volume !== null && c.successCount > 0) {
    out.push(`Volume is ${changes.volume >= 0 ? "up" : "down"} ${Math.abs(changes.volume).toFixed(1)}% on ${prev}, at ${etb(c.volume, 0)}.`)
  }
  if (c.successRate !== null) {
    const moved = changes.successRate !== null && Math.abs(changes.successRate) >= 0.1
      ? ` (${changes.successRate > 0 ? "+" : ""}${changes.successRate.toFixed(1)} pts)`
      : ""
    out.push(`Success rate is ${c.successRate.toFixed(1)}%${moved}; ${int(c.failedCount)} payments failed.`)
  }
  const worst = s.methodHealth.filter((m) => m.successRate !== null && m.success + m.failed >= 5).sort((a, b) => a.successRate! - b.successRate!)[0]
  if (worst && worst.successRate! < 90) {
    out.push(`${PAYMENT_METHOD_LABELS[worst.method] ?? worst.method} has the lowest success rate at ${worst.successRate!.toFixed(1)}%.`)
  }
  const reason = s.providerErrors[0]
  if (reason) out.push(`Most common failure: “${reason.reason}”${reason.code ? ` (${reason.code})` : ""} — ${int(reason.count)} payments.`)
  if (s.stuck.count > 0) out.push(`${int(s.stuck.count)} payment${s.stuck.count === 1 ? " is" : "s are"} stuck in flight for over ${s.stuck.thresholdMinutes} minutes.`)
  if (s.operations.callbacks.exhausted > 0) out.push(`${int(s.operations.callbacks.exhausted)} merchant callbacks ran out of retries.`)
  const peak = s.hourly.reduce((a, b) => (b.count > a.count ? b : a), s.hourly[0])
  if (peak?.count > 0) out.push(`Peak hour is ${formatHour(peak.hour)}–${formatHour((peak.hour + 1) % 24)} with ${int(peak.count)} successful payments.`)
  return out.slice(0, 6)
}

function SignalTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  hint: string
  icon: React.ComponentType<{ className?: string }>
  tone: "critical" | "warning"
}) {
  const active = value > 0
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[16px] border p-3",
        !active && "border-[#F1E7D0] bg-[#FFFDF7]",
        active && tone === "critical" && "border-rose-200 bg-rose-50",
        active && tone === "warning" && "border-amber-200 bg-amber-50",
      )}
    >
      <span
        className={cn(
          "rounded-xl p-2",
          !active && "bg-emerald-50 text-emerald-700",
          active && tone === "critical" && "bg-rose-100 text-rose-700",
          active && tone === "warning" && "bg-amber-100 text-amber-800",
        )}
      >
        {active ? <Icon className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-tight tabular-nums text-[#1F2937]">{int(value)}</div>
        <div className="truncate text-xs font-medium text-[#4B5563]">{label}</div>
        <div className="truncate text-[11px] text-[#9CA3AF]">{active ? hint : "All clear"}</div>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  description,
  className,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn("card-soft-cream rounded-[20px]", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base tracking-tight">{title}</CardTitle>
        {description ? <CardDescription className="text-[#6B7280]">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

const th = "py-2 pr-2 font-semibold"
const thR = "py-2 pr-2 text-right font-semibold"
const headRow = "border-b border-[#F1E7D0] text-left text-[11px] uppercase tracking-wide text-[#9CA3AF]"
const bodyRow = "border-b border-[#F1E7D0]/60 last:border-0"

export function TechnicalDashboard({
  filters,
  onFiltersChange,
  merchants,
  onMerchants,
  userName,
}: {
  filters: DashboardFilters
  onFiltersChange: (f: DashboardFilters) => void
  merchants: MerchantOption[]
  onMerchants: (m: MerchantOption[]) => void
  userName?: string
}) {
  const { toast } = useToast()
  const { data: s, loading, error, reload } = useDashboardStats<TechnicalStats>("/api/admin/stats/technical", filters)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (s) onMerchants(s.merchants)
  }, [s, onMerchants])

  const highlights = useMemo(() => (s ? buildHighlights(s) : []), [s])
  const peakHour = useMemo(() => (s ? s.hourly.reduce((a, b) => (b.count > a.count ? b : a), s.hourly[0]).hour : -1), [s])

  const handleExport = async () => {
    if (!s) return
    setExporting(true)
    try {
      await exportTechnicalWorkbook(s, userName)
      toast({ title: "Report exported", description: "The technical Excel report has been downloaded." })
    } catch (e) {
      console.error(e)
      toast({ title: "Export failed", description: "Could not build the Excel report.", variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  const c = s?.current
  const allAttempts = c ? c.totalCount : 0

  return (
    <section className="space-y-4" aria-busy={loading}>
      <FilterBar filters={filters} onChange={onFiltersChange} merchants={merchants}>
        <Button
          variant="outline"
          size="sm"
          onClick={reload}
          disabled={loading}
          aria-label="Refresh"
          className="h-10 rounded-lg border-[#F1E7D0] bg-white hover:bg-amber-50/40"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <Button onClick={handleExport} disabled={!s || exporting || loading} className="button-honey-solid h-10 flex-1 rounded-lg px-4 sm:flex-none">
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Export Excel
        </Button>
      </FilterBar>

      <p className="px-1 text-xs text-[#6B7280]">
        {s
          ? `${formatPeriod(s.period)} · ${s.merchant?.name ?? "All merchants"} · compared with the previous ${s.period.days} day${s.period.days === 1 ? "" : "s"} · times in EAT`
          : "Loading…"}
      </p>

      {error ? <ErrorBanner message={error} /> : null}

      {/* Operational signals: things that need someone to act */}
      {s ? (
        <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6", loading && "opacity-60")}>
          <SignalTile label="Stuck payments" value={s.stuck.count} hint={`In flight > ${s.stuck.thresholdMinutes} min`} icon={Clock} tone="critical" />
          <SignalTile label="Callbacks exhausted" value={s.operations.callbacks.exhausted} hint="Merchant never notified" icon={Send} tone="critical" />
          <SignalTile label="Callbacks retrying" value={s.operations.callbacks.pending} hint="Queued for retry" icon={Send} tone="warning" />
          <SignalTile
            label="Reconciliations pending"
            value={s.operations.paymentReconPending + s.operations.mpgsReconPending}
            hint={`${int(s.operations.paymentReconPending)} bank · ${int(s.operations.mpgsReconPending)} card`}
            icon={Scale}
            tone="warning"
          />
          <SignalTile label="Locked-out IPs" value={s.operations.ipLockouts} hint="Repeated failed logins" icon={ShieldAlert} tone="warning" />
          <SignalTile label="Locked-out logins" value={s.operations.identifierLockouts} hint="Accounts temporarily blocked" icon={KeyRound} tone="warning" />
        </div>
      ) : (
        <KpiSkeleton count={6} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" />
      )}

      {/* KPIs */}
      {c && s ? (
        <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6", loading && "opacity-60 transition-opacity")}>
          <KpiTile title="Successful volume" value={`${compact(c.volume)} ETB`} sub={etb(c.volume, 0)} delta={<Delta value={s.changes.volume} />} icon={TrendingUp} />
          <KpiTile title="Successful payments" value={int(c.successCount)} sub={`${int(c.totalCount)} attempted`} delta={<Delta value={s.changes.successCount} />} icon={Receipt} />
          <KpiTile title="Success rate" value={pct(c.successRate)} sub={`${int(c.failedCount)} failed`} delta={<Delta value={s.changes.successRate} unit="pts" />} icon={CheckCircle2} />
          <KpiTile title="Average ticket" value={`${compact(c.avgTicket)} ETB`} sub="Per successful payment" delta={<Delta value={s.changes.avgTicket} />} icon={Activity} />
          <KpiTile title="Merchants with sales" value={int(c.payingMerchants)} sub={`of ${int(s.activeMerchants)} approved`} delta={<Delta value={s.changes.payingMerchants} />} icon={Store} />
          <KpiTile title="New registrations" value={int(c.newMerchants)} sub={`${int(s.pendingMerchants)} awaiting approval`} delta={<Delta value={s.changes.newMerchants} />} icon={UserPlus} />
        </div>
      ) : (
        <KpiSkeleton count={6} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" />
      )}

      {/* Volume + insights */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Successful volume" description={`ETB settled per ${s?.period.bucket ?? "day"}`} className="lg:col-span-2">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={s?.series ?? []} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="techVolumeFill" x1="0" y1="0" x2="0" y2="1">
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
                    const d = payload[0].payload as TechnicalStats["series"][number]
                    return (
                      <ChartTooltip
                        title={d.label}
                        rows={[
                          { label: "Volume", value: etb(d.volume) },
                          { label: "Successful", value: int(d.success), color: STATUS_COLORS.success },
                          { label: "Failed", value: int(d.failed), color: STATUS_COLORS.failed },
                          { label: "In flight", value: int(d.pending), color: STATUS_COLORS.pending },
                        ]}
                      />
                    )
                  }}
                />
                <Area type="monotone" dataKey="volume" stroke={BROWN} strokeWidth={2} fill="url(#techVolumeFill)" dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: BROWN }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title={<span className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-[#754319]" /> Key insights</span>} description="Generated from the selected filters">
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
            <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-4 animate-pulse rounded bg-[#F7F1E3]" />)}</div>
          )}
        </SectionCard>
      </div>

      {/* Success rate trend + outcome split */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Success rate" description="Successful ÷ (successful + failed), per bucket" className="lg:col-span-2">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s?.series ?? []} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E5DCC8" strokeOpacity={0.6} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={{ fill: "#6B7280", fontSize: 11 }} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} width={40} tick={{ fill: "#6B7280", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <RechartsTooltip
                  cursor={{ stroke: BROWN, strokeOpacity: 0.3 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as TechnicalStats["series"][number]
                    return (
                      <ChartTooltip
                        title={d.label}
                        rows={[
                          { label: "Success rate", value: pct(d.successRate) },
                          { label: "Successful", value: int(d.success), color: STATUS_COLORS.success },
                          { label: "Failed", value: int(d.failed), color: STATUS_COLORS.failed },
                        ]}
                      />
                    )
                  }}
                />
                <Line type="monotone" dataKey="successRate" stroke={BROWN} strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: BROWN }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Transaction statuses" description="Every attempt in the period">
          {c && allAttempts > 0 ? (
            <div className="space-y-4">
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Outcome split">
                {(
                  [
                    ["success", c.successCount],
                    ["failed", c.failedCount],
                    ["pending", c.pendingCount],
                  ] as const
                ).map(([k, v]) => (v > 0 ? <div key={k} style={{ width: `${(v / allAttempts) * 100}%`, background: STATUS_COLORS[k] }} /> : null))}
              </div>
              <ul className="space-y-1.5 text-xs">
                {Object.entries(s!.statusBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, n]) => (
                    <li key={status} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[#4B5563]">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: status === "SUCCESS" ? STATUS_COLORS.success : status === "FAILED" ? STATUS_COLORS.failed : STATUS_COLORS.pending }}
                        />
                        {STATUS_LABELS[status] ?? status}
                      </span>
                      <span className="tabular-nums font-medium text-[#1F2937]">
                        {int(n)} <span className="font-normal text-[#9CA3AF]">{((n / allAttempts) * 100).toFixed(1)}%</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-[#6B7280]">{loading ? "Loading…" : "No payment attempts in this period."}</div>
          )}
        </SectionCard>
      </div>

      {/* Payment method health + provider errors */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Payment method health" description="Attempts and outcomes per channel" className="lg:col-span-2">
          {s?.methodHealth.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className={headRow}>
                    <th className={th}>Method</th>
                    <th className={thR}>Attempts</th>
                    <th className={thR}>Successful</th>
                    <th className={thR}>Failed</th>
                    <th className={thR}>In flight</th>
                    <th className={thR}>Success rate</th>
                    <th className="py-2 text-right font-semibold">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {s.methodHealth.map((m) => (
                    <tr key={m.method} className={bodyRow}>
                      <td className="py-2.5 pr-2 font-medium text-[#1F2937]">{PAYMENT_METHOD_LABELS[m.method] ?? m.method}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{int(m.total)}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{int(m.success)}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{int(m.failed)}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{int(m.pending)}</td>
                      <td className={cn("py-2.5 pr-2 text-right font-semibold tabular-nums", m.successRate !== null && m.successRate < 80 ? "text-rose-700" : "text-[#1F2937]")}>
                        {pct(m.successRate)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{etb(m.volume, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.origins.length ? (
                <p className="mt-3 text-xs text-[#6B7280]">
                  By origin:{" "}
                  {s.origins.map((o) => `${ORIGIN_LABELS[o.origin] ?? o.origin} ${etb(o.volume, 0)} (${int(o.count)})`).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-[#6B7280]">{loading ? "Loading…" : "No payment attempts in this period."}</div>
          )}
        </SectionCard>

        <SectionCard title="Provider errors" description="Failed payments by provider code and reason">
          <BarList
            rows={(s?.providerErrors ?? []).map((e) => ({
              key: `${e.code}|${e.reason}`,
              label: e.code ? `${e.code} · ${e.reason}` : e.reason,
              value: e.count,
            }))}
            format={int}
            empty="No failed payments."
          />
        </SectionCard>
      </div>

      {/* Stuck payments + peak hours */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Stuck payments"
          description={s ? `Oldest of ${int(s.stuck.count)} payments still in flight after ${s.stuck.thresholdMinutes} minutes` : "Payments still in flight"}
          className="lg:col-span-2"
        >
          {s?.stuck.oldest.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className={headRow}>
                    <th className={th}>Started</th>
                    <th className={th}>Merchant</th>
                    <th className={th}>Reference</th>
                    <th className={th}>Method</th>
                    <th className={th}>Status</th>
                    <th className="py-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {s.stuck.oldest.map((t) => (
                    <tr key={t.id} className={bodyRow}>
                      <td className="py-2.5 pr-2 text-xs text-[#4B5563]">{timeAgo(t.timestamp)}</td>
                      <td className="max-w-[180px] truncate py-2.5 pr-2 font-medium text-[#1F2937]">{t.merchant}</td>
                      <td className="py-2.5 pr-2 font-mono text-[11px] text-[#4B5563]">{t.reference}</td>
                      <td className="py-2.5 pr-2 text-xs">{PAYMENT_METHOD_LABELS[t.method] ?? t.method}</td>
                      <td className="py-2.5 pr-2 text-xs">{STATUS_LABELS[t.status] ?? t.status}</td>
                      <td className="py-2.5 text-right tabular-nums">{etb(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-[#6B7280]">
              {loading ? "Loading…" : <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> No stuck payments.</>}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Peak hours"
          description={s && peakHour >= 0 && s.hourly[peakHour].count > 0 ? `Successful payments by hour · busiest ${formatHour(peakHour)}` : "Successful payments by hour"}
        >
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s?.hourly ?? []} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="#E5DCC8" strokeOpacity={0.6} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={5} tick={{ fill: "#6B7280", fontSize: 11 }} tickFormatter={(h) => formatHour(Number(h))} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: "#6B7280", fontSize: 11 }} tickFormatter={(v) => compact(Number(v))} />
                <RechartsTooltip
                  cursor={{ fill: GOLD, fillOpacity: 0.08 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as TechnicalStats["hourly"][number]
                    return (
                      <ChartTooltip
                        title={`${formatHour(d.hour)}–${formatHour((d.hour + 1) % 24)}`}
                        rows={[
                          { label: "Successful", value: int(d.count), color: STATUS_COLORS.success },
                          { label: "Failed", value: int(d.failed), color: STATUS_COLORS.failed },
                          { label: "Volume", value: etb(d.volume, 0) },
                        ]}
                      />
                    )
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {(s?.hourly ?? []).map((h) => (
                    <Cell key={h.hour} fill={h.hour === peakHour && h.count > 0 ? BROWN : GOLD} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Merchants */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Top merchants" description="Ranked by successful volume, with change vs previous period" className="lg:col-span-2">
          {s?.topMerchants.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className={headRow}>
                    <th className={th}>#</th>
                    <th className={th}>Merchant</th>
                    <th className={thR}>Volume</th>
                    <th className={thR}>Txns</th>
                    <th className={cn(th, "w-[22%]")}>Share</th>
                    <th className="py-2 text-right font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {s.topMerchants.map((m, i) => (
                    <tr key={m.id} className={cn(bodyRow, "cursor-pointer hover:bg-amber-50/50")} onClick={() => onFiltersChange({ ...filters, merchantId: m.id })}>
                      <td className="py-2.5 pr-2 text-xs tabular-nums text-[#9CA3AF]">{i + 1}</td>
                      <td className="max-w-[220px] py-2.5 pr-2">
                        <div className="truncate font-medium text-[#1F2937]">{m.name}</div>
                        <div className="truncate text-[11px] text-[#9CA3AF]">{[m.id, m.branchName].filter(Boolean).join(" · ")}</div>
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
            <div className="py-8 text-center text-xs text-[#6B7280]">{loading ? "Loading…" : "No merchant sales in this period."}</div>
          )}
        </SectionCard>

        <SectionCard title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-600" /> Most failures</span>} description="Merchants with the most failed payments">
          {s?.failingMerchants.length ? (
            <ul className="space-y-3">
              {s.failingMerchants.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, merchantId: m.id })}
                    className="flex w-full items-center justify-between gap-3 rounded-lg text-left text-xs hover:bg-amber-50/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[#1F2937]">{m.name}</span>
                      <span className="block text-[11px] text-[#9CA3AF]">
                        {int(m.failed)} failed of {int(m.total)} attempts
                      </span>
                    </span>
                    <span className={cn("shrink-0 font-semibold tabular-nums", m.successRate !== null && m.successRate < 80 ? "text-rose-700" : "text-[#4B5563]")}>
                      {pct(m.successRate)} ok
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center text-xs text-[#6B7280]">{loading ? "Loading…" : "No failed payments."}</div>
          )}
        </SectionCard>
      </div>

      {/* Platform operations */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Cashback processing" description="Cashback transactions created in the period">
          <BarList
            rows={(s?.operations.cashback ?? []).map((r) => ({ key: r.status, label: r.status.charAt(0) + r.status.slice(1).toLowerCase(), value: r.count, detail: etb(r.amount, 0) }))}
            format={int}
            empty="No cashback activity."
          />
        </SectionCard>

        <SectionCard title="Platform" description="Live counts across the system">
          {s ? (
            <dl className="grid grid-cols-2 gap-3 text-xs">
              {(
                [
                  ["Active sessions", s.operations.activeSessions],
                  ["Active system users", s.activeUsers],
                  ["Callbacks delivered", s.operations.callbacks.delivered],
                  ["Callbacks retrying", s.operations.callbacks.pending],
                  ["Bank reconciliations pending", s.operations.paymentReconPending],
                  ["Card reconciliations pending", s.operations.mpgsReconPending],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#F1E7D0] bg-[#FFFDF7] p-3">
                  <dt className="text-[#6B7280]">{label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[#1F2937]">{int(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="py-6 text-center text-xs text-[#6B7280]">Loading…</div>
          )}
        </SectionCard>

        <SectionCard title="Merchant pipeline" description={s ? `${int(s.totalMerchants)} merchants in total` : "All-time status"}>
          <BarList
            rows={PIPELINE_STAGES.map((st) => ({ key: st.status, label: st.label, value: s?.merchantPipeline[st.status] ?? 0 }))}
            format={int}
            empty={loading ? "Loading…" : "No merchants yet."}
          />
        </SectionCard>
      </div>
    </section>
  )
}
