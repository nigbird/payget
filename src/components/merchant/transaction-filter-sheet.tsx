"use client"

import * as React from "react"
import { Calendar as CalendarIcon, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Slider } from "@/components/ui/slider"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useToast } from "@/hooks/use-toast"
import type { Transaction } from "@/app/lib/db"

type StatusFilter = "all" | "success" | "failed"

interface TransactionFilterSheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  statusFilter: StatusFilter
  setStatusFilter: (status: StatusFilter) => void
  search: string
  setSearch: (search: string) => void
  dateRange: { from?: Date; to?: Date }
  setDateRange: (range: { from?: Date; to?: Date }) => void
  amountMin: string
  setAmountMin: (amount: string) => void
  amountMax: string
  setAmountMax: (amount: string) => void
  maxSlider: number
  setMaxSlider: (value: number) => void
  onReset: () => void
  merchantTransactionLimit: number
}

export default function TransactionFilterSheet({
  isOpen,
  onOpenChange,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  dateRange,
  setDateRange,
  amountMin,
  setAmountMin,
  amountMax,
  setAmountMax,
  maxSlider,
  setMaxSlider,
  onReset,
  merchantTransactionLimit,
}: TransactionFilterSheetProps) {
  const { toast } = useToast()

  const dateRangeLabel = React.useMemo(() => {
    const { from, to } = dateRange
    if (!from && !to) return "Any time"
    if (from && !to) return `From ${from.toLocaleDateString()}`
    if (!from && to) return `Until ${to.toLocaleDateString()}`
    return `${from?.toLocaleDateString()} - ${to?.toLocaleDateString()}`
  }, [dateRange])

  const handleResetAndClose = () => {
    onReset()
    onOpenChange(false)
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl border-0 bg-[linear-gradient(180deg,#fffaf0_0%,#fff5de_100%)] px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        <div className="mx-auto mb-3 mt-1 h-1.5 w-14 rounded-full bg-[#754319]/25" />
        <SheetHeader className="text-left mb-4">
          <SheetTitle className="text-2xl text-[#5b371f]">Filter Transactions</SheetTitle>
          <SheetDescription>
            Refine your transaction list by applying various filters.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order ID or customer reference..."
              className="h-11 pl-9 rounded-2xl border-white/60 bg-white/80"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">Date range</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full justify-start rounded-2xl border-white/60 bg-white/80 text-[#754319] hover:bg-white/90"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3">
                  <Calendar
                    mode="range"
                    selected={dateRange as any}
                    onSelect={(range) => setDateRange((range ?? {}) as any)}
                  />
                  <div className="flex items-center justify-end gap-2 border-t p-3">
                    <Button type="button" variant="ghost" onClick={() => setDateRange({})} className="rounded-2xl">
                      Clear
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-11 rounded-2xl border-white/60 bg-white/80 text-[#754319]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">Amount min</Label>
            <Input
              type="number"
              step="0.01"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              placeholder="0.00"
              className="h-11 rounded-2xl border-white/60 bg-white/80"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">Amount max</Label>
            <Input
              type="number"
              step="0.01"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              placeholder="5000.00"
              className="h-11 rounded-2xl border-white/60 bg-white/80"
            />
            <div className="mt-2">
              <Slider
                value={[
                  Number.isFinite(Number(amountMax)) && amountMax.trim() !== "" ? Number(amountMax) : maxSlider,
                ]}
                min={0}
                max={merchantTransactionLimit}
                step={1}
                onValueChange={(v) => {
                  const next = v[0] ?? 0
                  setMaxSlider(next)
                  setAmountMax(String(next))
                }}
                className="mt-2"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Quick cap: {amountMax || maxSlider} ETB</p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleResetAndClose}
            className="h-11 w-full rounded-2xl border-white/60 bg-white/70 text-[#754319] hover:bg-white/90"
          >
            Reset Filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
