"use client"

import { useEffect, useMemo, useState } from "react"
import { format, startOfDay, subDays } from "date-fns"
import { ArrowDownRight, ArrowUpRight, Check, ChevronsUpDown, Minus, Search, Store } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker"
import type { MerchantOption } from "@/lib/admin-dashboard-export"

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type DashboardFilters = { range: DateRangeValue; merchantId: string | null }

export const defaultRange = (): DateRangeValue => ({
  from: subDays(startOfDay(new Date()), 29),
  to: startOfDay(new Date()),
})

/** Query string for the stats APIs, or null while a range is half-picked. */
export function filtersToQuery(f: DashboardFilters): string | null {
  if (f.range.from && !f.range.to) return null
  const q = new URLSearchParams()
  if (f.range.from && f.range.to) {
    q.set("from", format(f.range.from, "yyyy-MM-dd"))
    q.set("to", format(f.range.to, "yyyy-MM-dd"))
  }
  if (f.merchantId) q.set("merchantId", f.merchantId)
  return q.toString()
}

/** Fetches a dashboard endpoint whenever the filters settle on a complete range. */
export function useDashboardStats<T>(endpoint: string, filters: DashboardFilters) {
  const query = filtersToQuery(filters)
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (query === null) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`${endpoint}?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(
            res.status === 403 ? "You don't have permission to view this dashboard." : body.error ?? "Could not load dashboard data.",
          )
        }
        setData(body as T)
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [endpoint, query, reloadKey])

  return { data, loading, error, query, reload: () => setReloadKey((k) => k + 1) }
}

export function MerchantPicker({
  merchants,
  value,
  onChange,
}: {
  merchants: MerchantOption[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const selected = merchants.find((m) => m.id === value)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return merchants
    return merchants.filter((m) => `${m.name} ${m.id} ${m.branchName}`.toLowerCase().includes(q))
  }, [merchants, search])

  const pick = (id: string | null) => {
    onChange(id)
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-10 w-full justify-start rounded-lg px-3 text-left text-xs font-bold sm:w-64",
            value ? "border-primary/40 bg-primary/5" : "border-slate-100",
          )}
        >
          <Store className="mr-2 h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 truncate">{selected?.name ?? (value ? value : "All merchants")}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 max-w-[calc(100vw-32px)] rounded-2xl p-0" align="start">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchants…"
            className="h-8 rounded-md pl-8 text-xs"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1" role="listbox">
          {!search && (
            <MerchantRow label="All merchants" active={!value} onClick={() => pick(null)} />
          )}
          {filtered.map((m) => (
            <MerchantRow key={m.id} label={m.name} sub={[m.id, m.branchName].filter(Boolean).join(" · ")} active={m.id === value} onClick={() => pick(m.id)} />
          ))}
          {filtered.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">No merchants match.</div>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MerchantRow({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs", active ? "bg-primary/10" : "hover:bg-slate-100")}
    >
      <Check className={cn("h-3.5 w-3.5 shrink-0 text-primary", !active && "invisible")} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-slate-800">{label}</span>
        {sub ? <span className="block truncate text-[10px] text-muted-foreground">{sub}</span> : null}
      </span>
    </button>
  )
}

/** Date range + merchant filters on the left, view-specific actions on the right. */
export function FilterBar({
  filters,
  onChange,
  merchants,
  children,
}: {
  filters: DashboardFilters
  onChange: (f: DashboardFilters) => void
  merchants: MerchantOption[]
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[18px] border border-[#F1E7D0] bg-[#FFFDF7] p-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <DateRangePicker
          className="sm:w-60"
          align="start"
          value={filters.range}
          // Clearing returns to the default window rather than an unbounded "any time".
          onChange={(range) => onChange({ ...filters, range: range.from || range.to ? range : defaultRange() })}
        />
        <MerchantPicker merchants={merchants} value={filters.merchantId} onChange={(merchantId) => onChange({ ...filters, merchantId })} />
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Display pieces
// ---------------------------------------------------------------------------

export const STATUS_COLORS = { success: "#0ca30c", failed: "#d03b3b", pending: "#a8a29e" }
export const GOLD = "#f8b513"
export const BROWN = "#754319"

export const etb = (n: number, digits = 2) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ETB`
export const compact = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })
export const int = (n: number) => n.toLocaleString("en-US")
export const pct = (n: number | null, digits = 1) => (n === null ? "—" : `${n.toFixed(digits)}%`)

export function Delta({ value, unit = "%", invert = false }: { value: number | null; unit?: "%" | "pts"; invert?: boolean }) {
  if (value === null) return <span className="text-xs font-medium text-[#6B7280]">New</span>
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

export function KpiTile({
  title,
  value,
  sub,
  delta,
  icon: Icon,
  size = "md",
}: {
  title: string
  value: string
  sub?: string
  delta?: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  size?: "md" | "lg"
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-[18px] border border-[#F1E7D0] bg-[#FFFDF7] p-4 shadow-sm shadow-black/5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold text-[#6B7280]">{title}</div>
        <span className="rounded-xl bg-[#f8b513]/10 p-1.5 text-[#754319]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className={cn("font-semibold tracking-tight text-[#1F2937] tabular-nums", size === "lg" ? "text-2xl" : "text-xl")}>{value}</div>
      {sub || delta ? (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-[#6B7280]">{sub}</span>
          {delta}
        </div>
      ) : null}
    </div>
  )
}

export function KpiSkeleton({ count, className }: { count: number; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[118px] animate-pulse rounded-[18px] bg-[#F7F1E3]" />
      ))}
    </div>
  )
}

/** Labelled horizontal bars: magnitude in one hue, every value printed beside its bar. */
export function BarList({
  rows,
  format: fmt,
  empty,
}: {
  rows: { key: string; label: string; value: number; detail?: string }[]
  format: (n: number) => string
  empty: string
}) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (!rows.length || max === 0) return <div className="py-6 text-center text-xs text-[#6B7280]">{empty}</div>
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium text-[#1F2937]">{r.label}</span>
            <span className="shrink-0 tabular-nums text-[#4B5563]">
              {fmt(r.value)}
              {r.detail ? <span className="ml-1.5 text-[#9CA3AF]">{r.detail}</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#F4ECDB]">
            <div className="h-2 rounded-full bg-[#f8b513]" style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ChartTooltip({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
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

export function ErrorBanner({ message }: { message: string }) {
  return <div className="rounded-[18px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{message}</div>
}
