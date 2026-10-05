"use client"

import * as React from "react"
import { endOfMonth, format, isSameDay, startOfDay, startOfMonth, subDays, subMonths } from "date-fns"
import { ArrowRight, CalendarDays, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type DateRangeValue = { from?: Date; to?: Date }

type Preset = { label: string; range: () => Required<DateRangeValue> }

const PRESETS: Preset[] = [
  { label: "Today", range: () => ({ from: startOfDay(new Date()), to: startOfDay(new Date()) }) },
  { label: "Yesterday", range: () => ({ from: subDays(startOfDay(new Date()), 1), to: subDays(startOfDay(new Date()), 1) }) },
  { label: "Last 7 days", range: () => ({ from: subDays(startOfDay(new Date()), 6), to: startOfDay(new Date()) }) },
  { label: "Last 30 days", range: () => ({ from: subDays(startOfDay(new Date()), 29), to: startOfDay(new Date()) }) },
  { label: "This month", range: () => ({ from: startOfMonth(new Date()), to: startOfDay(new Date()) }) },
  {
    label: "Last month",
    range: () => {
      const last = subMonths(new Date(), 1)
      return { from: startOfMonth(last), to: startOfDay(endOfMonth(last)) }
    },
  },
]

const fmt = (d?: Date) => (d ? format(d, "d MMM yyyy") : null)

const sameRange = (a: DateRangeValue, b: Required<DateRangeValue>) =>
  !!a.from && !!a.to && isSameDay(a.from, b.from) && isSameDay(a.to, b.to)

/** Human summary of a range, for triggers and report headings. */
export function formatDateRange({ from, to }: DateRangeValue) {
  if (!from && !to) return "Any time"
  const preset = PRESETS.find((p) => sameRange({ from, to }, p.range()))
  if (preset) return preset.label
  if (from && to && isSameDay(from, to)) return fmt(from)!
  if (from && !to) return `From ${fmt(from)}`
  if (!from && to) return `Until ${fmt(to)}`
  return `${fmt(from)} – ${fmt(to)}`
}

/**
 * Date range filter: quick presets on the side, explicit start/end readouts,
 * and a calendar where the first click sets the start and the second the end.
 * Future days are disabled — there are no transactions there to find.
 */
export function DateRangePicker({
  value,
  onChange,
  className,
  align = "end",
}: {
  value: DateRangeValue
  onChange: (range: DateRangeValue) => void
  className?: string
  align?: "start" | "center" | "end"
}) {
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState<Date>(value.from ?? new Date())
  const hasValue = !!value.from || !!value.to

  React.useEffect(() => {
    if (open) setMonth(value.to ?? value.from ?? new Date())
    // Only re-anchor the visible month when the picker opens.
  }, [open])

  const applyPreset = (preset: Preset) => {
    const range = preset.range()
    onChange(range)
    setMonth(range.to)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 w-full justify-start rounded-lg px-3 text-left text-xs font-bold",
            hasValue ? "border-primary/40 bg-primary/5" : "border-slate-100",
            className
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1 truncate">{formatDateRange(value)}</span>
          {hasValue && (
            <span
              role="button"
              aria-label="Clear date range"
              className="ml-2 rounded p-0.5 text-muted-foreground hover:bg-slate-100 hover:text-foreground"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onChange({})
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[calc(100vw-32px)] rounded-2xl p-0" align={align}>
        <div className="flex flex-col sm:flex-row">
          <div className="flex gap-1 overflow-x-auto border-b p-2 sm:w-36 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
            {PRESETS.map((preset) => {
              const active = sameRange(value, preset.range())
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-1.5 text-left text-xs font-semibold transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          <div>
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <RangeEnd label="Start" date={value.from} active={!value.from || !!value.to} />
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <RangeEnd label="End" date={value.to} active={!!value.from && !value.to} />
            </div>

            <Calendar
              mode="range"
              month={month}
              onMonthChange={setMonth}
              selected={value.from ? { from: value.from, to: value.to } : undefined}
              onSelect={(range, clicked) =>
                // With a complete range, a click starts a new one instead of stretching the old.
                value.from && value.to
                  ? onChange({ from: clicked, to: undefined })
                  : onChange({ from: range?.from, to: range?.to })
              }
              disabled={{ after: new Date() }}
              endMonth={new Date()}
            />

            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                {!value.from ? "Pick a start date" : !value.to ? "Now pick an end date" : "Both days included"}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs" disabled={!hasValue} onClick={() => onChange({})}>
                  Clear
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RangeEnd({ label, date, active }: { label: string; date?: Date; active: boolean }) {
  return (
    <div
      className={cn(
        "flex-1 rounded-md border px-2 py-1",
        active ? "border-primary/50 bg-primary/5" : "border-slate-100"
      )}
    >
      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn("text-xs font-semibold", !date && "text-muted-foreground")}>{fmt(date) ?? "—"}</div>
    </div>
  )
}
