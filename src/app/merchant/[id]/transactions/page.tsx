"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Search,
  ShieldCheck,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { useToast } from "@/hooks/use-toast"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import type { Merchant, Transaction } from "@/app/lib/db"

const nonTerminalStatuses: Transaction["status"][] = ["pending", "initiated", "awaiting_pin", "processing"]

type StatusFilter = "all" | "success" | "pending" | "failed"
type Density = "comfortable" | "compact"

export default function MerchantTransactionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()

  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")

  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [amountMin, setAmountMin] = useState<string>("")
  const [amountMax, setAmountMax] = useState<string>("")

  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [density, setDensity] = useState<Density>("comfortable")

  const [maxSlider, setMaxSlider] = useState<number>(5000)

  useEffect(() => {
    const fetchMerchant = async () => {
      try {
        const response = await fetch(`/api/merchants/${id}`)
        if (response.ok) {
          const m = await response.json()
          setMerchant(m)
        }
      } catch (error) {
        console.error('Failed to fetch merchant:', error)
      }
    }

    const fetchTransactions = async () => {
      try {
        const response = await fetch(`/api/merchants/${id}/transactions`)
        if (response.ok) {
          const txs = await response.json()
          setTransactions([...txs].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ))
          return txs
        }
      } catch (error) {
        console.error('Failed to fetch transactions:', error)
      }
      return []
    }

    fetchMerchant()
    fetchTransactions()

    const interval = setInterval(async () => {
      const txs = await fetchTransactions()
      const live = txs.some((tx: Transaction) => nonTerminalStatuses.includes(tx.status))
      if (!live) clearInterval(interval)
    }, 2500)

    return () => clearInterval(interval)
  }, [id])

  const totalReceived = useMemo(
    () => transactions.reduce((acc, tx) => acc + (tx.status === "success" ? tx.amount : 0), 0),
    [transactions]
  )

  const pendingCount = useMemo(
    () => transactions.filter((tx) => nonTerminalStatuses.includes(tx.status)).length,
    [transactions]
  )

  const filtered = useMemo(() => {
    const from = dateRange.from
    const to = dateRange.to

    const min = amountMin.trim() ? Number(amountMin) : undefined
    const max = amountMax.trim() ? Number(amountMax) : undefined

    const q = search.trim().toLowerCase()

    const fromMs = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime() : undefined
    const toMs = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime() : undefined

    return transactions.filter((tx) => {
      if (statusFilter === "success" && tx.status !== "success") return false
      if (statusFilter === "failed" && tx.status !== "failed") return false
      if (statusFilter === "pending" && (tx.status === "success" || tx.status === "failed")) return false

      const txMs = new Date(tx.timestamp).getTime()
      if (fromMs !== undefined && txMs < fromMs) return false
      if (toMs !== undefined && txMs > toMs) return false

      if (min !== undefined && Number.isFinite(min) && tx.amount < min) return false
      if (max !== undefined && Number.isFinite(max) && tx.amount > max) return false

      if (q) {
        const orderText = `${tx.transactionReference} ${tx.description} ${tx.serviceDescription}`.toLowerCase()
        const customerText = `${tx.payerPhone ?? ""} ${tx.userCredentials.phone}`.toLowerCase()
        if (!orderText.includes(q) && !customerText.includes(q)) return false
      }

      return true
    })
  }, [transactions, amountMin, amountMax, dateRange.from, dateRange.to, search, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))

  useEffect(() => {
    setPageIndex(0)
  }, [statusFilter, search, dateRange.from, dateRange.to, amountMin, amountMax, pageSize])

  const pageItems = useMemo(() => {
    const safePageIndex = Math.min(Math.max(0, pageIndex), pageCount - 1)
    const start = safePageIndex * pageSize
    const end = start + pageSize
    return {
      items: filtered.slice(start, end),
      safePageIndex,
    }
  }, [filtered, pageIndex, pageSize, pageCount])

  const densityHeadClass = density === "compact" ? "h-10 px-3 text-xs" : "h-12 px-4 text-sm"
  const densityCellClass = density === "compact" ? "p-3 text-xs" : "p-4 text-sm"

  const badgeFor = (status: Transaction["status"]) => {
    if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700"
    if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700"
    return "border-amber-200 bg-amber-50 text-amber-700"
  }

  const statusLabel = (status: Transaction["status"]) => {
    if (status === "awaiting_pin") return "Awaiting PIN"
    if (status === "processing") return "Processing"
    if (status === "initiated") return "Initiated"
    if (status === "pending") return "Pending"
    return status
  }

  const dateRangeLabel = (() => {
    const { from, to } = dateRange
    if (!from && !to) return "Any time"
    if (from && !to) return `From ${from.toLocaleDateString()}`
    if (!from && to) return `Until ${to.toLocaleDateString()}`
    return `${from?.toLocaleDateString()} - ${to?.toLocaleDateString()}`
  })()

  const handleReset = () => {
    setStatusFilter("all")
    setSearch("")
    setDateRange({})
    setAmountMin("")
    setAmountMax("")
    setPageIndex(0)
    setDensity("comfortable")
    toast({ title: "Filters cleared", description: "Showing all transactions." })
  }

  if (!merchant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/20 gap-4">
        <Clock className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Merchant Not Found</h2>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white/40 bg-white/65 p-5 md:p-7 shadow-xl backdrop-blur-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Transactions</p>
            <h1 className="mt-2 text-2xl md:text-3xl font-bold text-[#5b371f]">{merchant.name}</h1>
            <p className="mt-1 text-sm md:text-base text-[#754319]/70">
              {pendingCount} active requests • {transactions.length} total
            </p>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-2 shadow-sm flex items-center gap-3">
              <CircleDollarSign className="h-4 w-4 text-[#754319]" />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-[#754319]/70">Received</p>
                <p className="font-black text-[#5b371f]">${totalReceived.toFixed(2)}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-2 shadow-sm flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-[#754319]" />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-[#754319]/70">Merchant</p>
                <p className="font-semibold text-[#5b371f]">{merchant.status}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search order ID or customer reference..."
                  className="pl-9 rounded-2xl border-white/60 bg-white/80"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">Date range</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start rounded-2xl border-white/60 bg-white/80 text-[#754319] hover:bg-white/90"
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
                  <SelectTrigger className="rounded-2xl border-white/60 bg-white/80 text-[#754319]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">Amount min</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  placeholder="0.00"
                  className="rounded-2xl border-white/60 bg-white/80"
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
                  className="rounded-2xl border-white/60 bg-white/80"
                />
                <div className="mt-2">
                  <Slider
                    value={[
                      Number.isFinite(Number(amountMax)) && amountMax.trim() !== "" ? Number(amountMax) : maxSlider,
                    ]}
                    min={0}
                    max={merchant.transactionLimit}
                    step={1}
                    onValueChange={(v) => {
                      const next = v[0] ?? 0
                      setMaxSlider(next)
                      setAmountMax(String(next))
                    }}
                    className="mt-2"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Quick cap: ${amountMax || maxSlider}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">Table density</Label>
                <Select value={density} onValueChange={(v) => setDensity(v as Density)}>
                  <SelectTrigger className="rounded-2xl border-white/60 bg-white/80 text-[#754319]">
                    <SelectValue placeholder="Density" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    className="rounded-2xl border-white/60 bg-white/70 text-[#754319] hover:bg-white/90"
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:flex lg:flex-col lg:items-end gap-2 hidden lg:block">
            {/* <Button
              type="button"
              variant="outline"
              className="rounded-2xl border-white/60 bg-white/70 text-[#754319] hover:bg-white/90"
              asChild
            >
              <Link href={`/merchant/${merchant.id}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to dashboard
              </Link>
            </Button> */}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/40 bg-white/65 p-5 md:p-7 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Results</p>
            <p className="mt-1 text-sm text-[#754319]/70">
              Showing{" "}
              <span className="font-semibold text-[#5b371f]">
                {filtered.length === 0 ? 0 : pageItems.safePageIndex * pageSize + 1}
              </span>{" "}
              -{" "}
              <span className="font-semibold text-[#5b371f]">
                {Math.min(filtered.length, (pageItems.safePageIndex + 1) * pageSize)}
              </span>{" "}
              of <span className="font-semibold text-[#5b371f]">{filtered.length}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">Page size</Label>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-28 rounded-2xl border-white/60 bg-white/80 text-[#754319]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4">
          <div className="rounded-2xl border border-white/60 bg-white/70 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={densityHeadClass}>Date</TableHead>
                  <TableHead className={densityHeadClass}>Order ID</TableHead>
                  <TableHead className={densityHeadClass}>Customer</TableHead>
                  <TableHead className={densityHeadClass}>Description</TableHead>
                  <TableHead className={densityHeadClass}>Amount</TableHead>
                  <TableHead className={densityHeadClass}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">
                      No transactions match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.items.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className={densityCellClass}>{new Date(tx.timestamp).toLocaleString()}</TableCell>
                      <TableCell className={densityCellClass}>
                        <span className="font-mono text-[#5b371f]">{tx.transactionReference}</span>
                      </TableCell>
                      <TableCell className={densityCellClass}>{tx.payerPhone || tx.userCredentials.phone}</TableCell>
                      <TableCell className={densityCellClass}>{tx.serviceDescription}</TableCell>
                      <TableCell className={densityCellClass}>
                        <span className="font-semibold text-[#5b371f]">${tx.amount.toFixed(2)}</span>
                      </TableCell>
                      <TableCell className={densityCellClass}>
                        <Badge variant="outline" className={cn("rounded-full text-[10px] capitalize", badgeFor(tx.status))}>
                          {statusLabel(tx.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-[#754319]/70">
            Page <span className="font-semibold text-[#5b371f]">{pageItems.safePageIndex + 1}</span> of{" "}
            <span className="font-semibold text-[#5b371f]">{pageCount}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl border-white/60 bg-white/70 text-[#754319] hover:bg-white/90"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageItems.safePageIndex === 0}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl border-white/60 bg-white/70 text-[#754319] hover:bg-white/90"
              onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              disabled={pageItems.safePageIndex >= pageCount - 1}
            >
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

