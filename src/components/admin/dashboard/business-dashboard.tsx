"use client"

import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts"
import { Banknote, CheckCircle2, Download, Loader2, Receipt, RefreshCw, Scale } from "lucide-react"

import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  exportBusinessWorkbook,
  formatPeriod,
  type BusinessStats,
  type BusinessTransaction,
  type MerchantOption,
} from "@/lib/admin-dashboard-export"
import {
  ChartTooltip,
  ErrorBanner,
  FilterBar,
  GOLD,
  KpiSkeleton,
  KpiTile,
  Delta,
  compact,
  etb,
  int,
  pct,
  useDashboardStats,
  type DashboardFilters,
} from "./shared"

const rate = (success: number, total: number) => (total ? (success / total) * 100 : null)

export function BusinessDashboard({
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
  const { data, loading, error, query, reload } = useDashboardStats<BusinessStats>("/api/admin/stats/business", filters)
  const [view, setView] = useState<"merchant" | "date">("merchant")
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (data) onMerchants(data.merchants)
  }, [data, onMerchants])

  const breakdown = filters.merchantId ? "date" : view
  const c = data?.current

  const handleExport = async () => {
    if (!data || query === null) return
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/stats/business?${query}&detail=1`)
      if (!res.ok) throw new Error("detail fetch failed")
      const detail = (await res.json()) as { transactions: BusinessTransaction[]; truncated: boolean; limit: number }
      await exportBusinessWorkbook(data, detail, userName)
      toast({
        title: "Report exported",
        description: detail.truncated
          ? `Downloaded. Transactions sheet capped at ${int(detail.limit)} rows — narrow the filters to export all.`
          : `Downloaded with ${int(detail.transactions.length)} transactions.`,
      })
    } catch (e) {
      console.error(e)
      toast({ title: "Export failed", description: "Could not build the Excel report.", variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

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
        <Button onClick={handleExport} disabled={!data || exporting || loading} className="button-honey-solid h-10 flex-1 rounded-lg px-4 sm:flex-none">
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Export Excel
        </Button>
      </FilterBar>

      <p className="px-1 text-xs text-[#6B7280]">
        {data
          ? `${formatPeriod(data.period)} · ${data.merchant?.name ?? "All merchants"} · change compared with the previous ${data.period.days} day${data.period.days === 1 ? "" : "s"}`
          : "Loading…"}
      </p>

      {error ? <ErrorBanner message={error} /> : null}

      {c && data ? (
        <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", loading && "opacity-60 transition-opacity")}>
          <KpiTile size="lg" title="Amount collected" value={etb(c.amount)} sub="Successful payments only" delta={<Delta value={data.changes.amount} />} icon={Banknote} />
          <KpiTile
            size="lg"
            title="Successful transactions"
            value={int(c.successCount)}
            sub={`${pct(rate(c.successCount, c.totalCount))} of all transactions`}
            delta={<Delta value={data.changes.successCount} />}
            icon={CheckCircle2}
          />
          <KpiTile size="lg" title="Total transactions" value={int(c.totalCount)} sub={`${int(c.failedCount)} failed`} delta={<Delta value={data.changes.totalCount} />} icon={Receipt} />
          <KpiTile size="lg" title="Average transaction" value={etb(c.avgTicket)} sub="Per successful payment" delta={<Delta value={data.changes.avgTicket} />} icon={Scale} />
        </div>
      ) : (
        <KpiSkeleton count={4} className="grid grid-cols-2 gap-3 lg:grid-cols-4" />
      )}

      <Card className="card-soft-cream rounded-[20px]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base tracking-tight">Amount collected</CardTitle>
          <CardDescription className="text-[#6B7280]">ETB from successful payments, per {data?.period.bucket ?? "day"}</CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.series ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#E5DCC8" strokeOpacity={0.6} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} tick={{ fill: "#6B7280", fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "#6B7280", fontSize: 11 }} tickFormatter={(v) => compact(Number(v))} />
              <RechartsTooltip
                cursor={{ fill: GOLD, fillOpacity: 0.08 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as BusinessStats["series"][number]
                  return (
                    <ChartTooltip
                      title={d.label}
                      rows={[
                        { label: "Amount", value: etb(d.amount) },
                        { label: "Successful", value: int(d.successCount) },
                        { label: "Total", value: int(d.totalCount) },
                      ]}
                    />
                  )
                }}
              />
              <Bar dataKey="amount" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="card-soft-cream rounded-[20px]">
        <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base tracking-tight">Breakdown</CardTitle>
            <CardDescription className="text-[#6B7280]">
              {breakdown === "merchant" ? "Click a merchant to see only their numbers" : `Per ${data?.period.bucket ?? "day"}`}
            </CardDescription>
          </div>
          {!filters.merchantId && (
            <div role="radiogroup" aria-label="Breakdown" className="flex rounded-xl border border-[#F1E7D0] bg-[#FFFDF7] p-0.5">
              {(
                [
                  ["merchant", "By merchant"],
                  ["date", "By date"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={view === key}
                  onClick={() => setView(key)}
                  className={cn(
                    "h-8 rounded-[10px] px-3 text-xs font-semibold transition-colors",
                    view === key ? "bg-white text-[#5b371f] shadow-sm ring-1 ring-[#f8b513]/40" : "text-[#754319]/60 hover:text-[#5b371f]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="py-8 text-center text-xs text-[#6B7280]">Loading…</div>
          ) : breakdown === "merchant" ? (
            <BreakdownTable
              firstHeader="Merchant"
              rows={data.byMerchant.map((m) => ({
                key: m.id,
                title: m.name,
                sub: [m.id, m.branchName].filter(Boolean).join(" · "),
                success: m.successCount,
                total: m.totalCount,
                amount: m.amount,
                onClick: () => onFiltersChange({ ...filters, merchantId: m.id }),
              }))}
              totals={c!}
              empty="No transactions in this period."
            />
          ) : (
            <BreakdownTable
              firstHeader={data.period.bucket === "day" ? "Date" : data.period.bucket === "week" ? "Week of" : "Month"}
              rows={[...data.series].reverse().map((s) => ({
                key: s.date,
                title: s.label,
                success: s.successCount,
                total: s.totalCount,
                amount: s.amount,
              }))}
              totals={c!}
              empty="No transactions in this period."
            />
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function BreakdownTable({
  firstHeader,
  rows,
  totals,
  empty,
}: {
  firstHeader: string
  rows: { key: string; title: string; sub?: string; success: number; total: number; amount: number; onClick?: () => void }[]
  totals: { successCount: number; totalCount: number; amount: number }
  empty: string
}) {
  if (!rows.length) return <div className="py-8 text-center text-xs text-[#6B7280]">{empty}</div>
  return (
    <div className="max-h-[480px] overflow-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="sticky top-0 bg-[#FFFBF2]">
          <tr className="border-b border-[#F1E7D0] text-left text-[11px] uppercase tracking-wide text-[#9CA3AF]">
            <th className="py-2 pr-2 font-semibold">{firstHeader}</th>
            <th className="py-2 pr-2 text-right font-semibold">Successful</th>
            <th className="py-2 pr-2 text-right font-semibold">Total</th>
            <th className="py-2 pr-2 text-right font-semibold">Success rate</th>
            <th className="py-2 text-right font-semibold">Amount collected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              onClick={r.onClick}
              className={cn("border-b border-[#F1E7D0]/60", r.onClick && "cursor-pointer hover:bg-amber-50/50")}
            >
              <td className="max-w-[260px] py-2.5 pr-2">
                <div className="truncate font-medium text-[#1F2937]">{r.title}</div>
                {r.sub ? <div className="truncate text-[11px] text-[#9CA3AF]">{r.sub}</div> : null}
              </td>
              <td className="py-2.5 pr-2 text-right tabular-nums text-[#1F2937]">{int(r.success)}</td>
              <td className="py-2.5 pr-2 text-right tabular-nums text-[#4B5563]">{int(r.total)}</td>
              <td className="py-2.5 pr-2 text-right tabular-nums text-[#4B5563]">{pct(rate(r.success, r.total))}</td>
              <td className="py-2.5 text-right font-medium tabular-nums text-[#1F2937]">{etb(r.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-[#FFFBF2]">
          <tr className="border-t-2 border-[#F1E7D0] font-semibold text-[#1F2937]">
            <td className="py-2.5 pr-2">Total</td>
            <td className="py-2.5 pr-2 text-right tabular-nums">{int(totals.successCount)}</td>
            <td className="py-2.5 pr-2 text-right tabular-nums">{int(totals.totalCount)}</td>
            <td className="py-2.5 pr-2 text-right tabular-nums">{pct(rate(totals.successCount, totals.totalCount))}</td>
            <td className="py-2.5 text-right tabular-nums">{etb(totals.amount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
