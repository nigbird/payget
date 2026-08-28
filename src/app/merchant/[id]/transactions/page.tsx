"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  ChevronRight,
  Wallet,
  Clock,
  Search,
  ShieldCheck,
  Download,
  FileText,
  User as UserIcon,
  TrendingUp,
  Filter,
  CheckCircle2,
  CalendarDays,
  MoreVertical,
  ChevronDown,
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
import { useAuth } from "@/lib/auth-context"
import type { Merchant, Transaction, MerchantTeamMember } from "@/lib/db"
import {
  buildSalesUserFilterOptions,
  transactionMatchesSalesUserFilter,
  findSelfTeamMember,
} from "@/lib/transaction-initiator"

const nonTerminalStatuses: Transaction["status"][] = ["pending", "initiated", "awaiting_pin", "processing"]

type StatusFilter = "all" | "success" | "failed" | "initiated"
type Density = "comfortable" | "compact"

export default function MerchantTransactionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const { user: sessionUser } = useAuth()

  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [teamMembers, setTeamMembers] = useState<MerchantTeamMember[]>([])

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [salesUserFilter, setSalesUserFilter] = useState<string>("all")
  const [itemFilter, setItemFilter] = useState<string>("all")

  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})

  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

    const fetchTeam = async () => {
      try {
        const response = await fetch(`/api/merchants/${id}/team`)
        if (response.ok) {
          const members = await response.json()
          setTeamMembers(members)
        }
      } catch (error) {
        console.error('Failed to fetch team members:', error)
      }
    }

    fetchMerchant()
    fetchTransactions()
    fetchTeam()

    const interval = setInterval(async () => {
      const txs = await fetchTransactions()
      const live = txs.some((tx: Transaction) => nonTerminalStatuses.includes(tx.status))
      if (!live) clearInterval(interval)
    }, 2500)

    return () => clearInterval(interval)
  }, [id])

  const isSalesUser = sessionUser?.role === "SALES"
  const selfTeamMember = useMemo(
    () => (isSalesUser && sessionUser ? findSelfTeamMember(teamMembers, sessionUser) : undefined),
    [isSalesUser, sessionUser, teamMembers]
  )
  // Plain sales users may only filter between their own transactions and QR customer
  // transactions; sales admins (and account admins) can filter across the whole team.
  const isRestrictedSalesUser = isSalesUser && selfTeamMember?.role !== "sales_admin"

  const salesUserOptions = useMemo(
    () =>
      buildSalesUserFilterOptions(
        teamMembers,
        transactions,
        isRestrictedSalesUser ? { onlyMemberId: selfTeamMember?.id } : undefined
      ),
    [teamMembers, transactions, isRestrictedSalesUser, selfTeamMember]
  )

  /**
   * Built from the transactions themselves (not the live item catalog) so a filter still
   * works for renamed or deleted items — each option's value keys on itemId when the line
   * still points at a catalog item, falling back to the snapshotted name otherwise.
   */
  const itemFilterOptions = useMemo(() => {
    const options = new Map<string, string>()
    transactions.forEach((tx) => {
      tx.items?.forEach((line) => {
        const key = line.itemId ?? `name:${line.name.toLowerCase()}`
        if (!options.has(key)) options.set(key, line.name)
      })
    })
    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [transactions])

  const itemLineKey = (line: { itemId: string | null; name: string }) =>
    line.itemId ?? `name:${line.name.toLowerCase()}`

  const filtered = useMemo(() => {
    const from = dateRange.from
    const to = dateRange.to

    const q = search.trim().toLowerCase()

    const fromMs = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime() : undefined
    const toMs = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime() : undefined

    return transactions.filter((tx) => {
      if (statusFilter === "success" && tx.status !== "success") return false
      if (statusFilter === "failed" && tx.status !== "failed") return false
      if (statusFilter === "initiated" && !nonTerminalStatuses.includes(tx.status)) return false
      if (!transactionMatchesSalesUserFilter(tx, salesUserFilter, teamMembers)) return false
      if (itemFilter !== "all" && !tx.items?.some((line) => itemLineKey(line) === itemFilter)) return false

      const txMs = new Date(tx.timestamp).getTime()
      if (fromMs !== undefined && txMs < fromMs) return false
      if (toMs !== undefined && txMs > toMs) return false

      if (q) {
        const orderText = `${tx.transactionReference} ${tx.description} ${tx.serviceDescription}`.toLowerCase()
        const customerText = `${tx.payerPhone ?? ""} ${tx.userCredentials.phone}`.toLowerCase()
        if (!orderText.includes(q) && !customerText.includes(q)) return false
      }

      return true
    })
  }, [transactions, dateRange.from, dateRange.to, search, statusFilter, salesUserFilter, itemFilter, teamMembers])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))

  const filteredSuccessCount = useMemo(
    () => filtered.filter((tx) => tx.status === "success").length,
    [filtered]
  )

  const filteredTotalReceived = useMemo(
    () => filtered.reduce((acc, tx) => acc + (tx.status === "success" ? tx.amount : 0), 0),
    [filtered]
  )

  const hasActiveFilters =
    statusFilter !== "all" ||
    salesUserFilter !== "all" ||
    itemFilter !== "all" ||
    !!dateRange.from ||
    !!dateRange.to ||
    search.trim().length > 0

  useEffect(() => {
    setPageIndex(0)
  }, [statusFilter, search, dateRange.from, dateRange.to, salesUserFilter, itemFilter, pageSize])

  const pageItems = useMemo(() => {
    const safePageIndex = Math.min(Math.max(0, pageIndex), pageCount - 1)
    const start = safePageIndex * pageSize
    const end = start + pageSize
    return {
      items: filtered.slice(start, end),
      safePageIndex,
    }
  }, [filtered, pageIndex, pageSize, pageCount])

  const densityHeadClass = "h-12 px-4 text-sm"
  const densityCellClass = "p-4 text-sm"

  const salesSummary = useMemo(() => {
    const summary: Record<string, { name: string, count: number, total: number }> = {}
    
    filtered.filter(tx => tx.status === 'success').forEach(tx => {
      const userId = tx.userCredentials.initiatedById || 'system'
      const userName = tx.userCredentials.initiatedByName || 'System'
      
      if (!summary[userId]) {
        summary[userId] = { name: userName, count: 0, total: 0 }
      }
      summary[userId].count += 1
      summary[userId].total += tx.amount
    })
    
    return Object.entries(summary).sort((a, b) => b[1].total - a[1].total)
  }, [filtered])

  const exportToCSV = () => {
    if (filtered.length === 0) {
      toast({ title: "No data to export", variant: "destructive" })
      return
    }

    const headers = ["Date", "Order ID", "Customer", "Description", "Amount (ETB)", "Status", "Sales User"]
    const rows = filtered.map(tx => [
      new Date(tx.timestamp).toLocaleString(),
      tx.transactionReference,
      tx.payerPhone || tx.userCredentials.phone,
      tx.serviceDescription,
      tx.amount.toFixed(2),
      tx.status,
      tx.userCredentials.initiatedByName || "System"
    ])

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `transactions_${merchant?.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    toast({ title: "Export successful", description: `Exported ${filtered.length} transactions.` })
  }

  const badgeFor = (status: Transaction["status"]) => {
    if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700"
    if (nonTerminalStatuses.includes(status)) return "border-amber-200 bg-amber-50 text-amber-700"
    return "border-rose-200 bg-rose-50 text-rose-700"
  }

  const statusLabel = (status: Transaction["status"]) => {
    if (status === "success") return "Success"
    // "processing" means the payment reached the bank but the provider's result
    // was inconclusive, so it is queued for reconciliation. The customer has
    // already left the till — "Initiated" would wrongly suggest the merchant is
    // still waiting on them to enter a PIN.
    if (status === "processing") return "Pending for Review"
    if (nonTerminalStatuses.includes(status)) return "Initiated"
    return "Failed"
  }

  const dateRangeLabel = useMemo(() => {
    const { from, to } = dateRange
    if (!from && !to) return "Any time"
    if (from && !to) return `From ${from.toLocaleDateString()}`
    if (!from && to) return `Until ${to.toLocaleDateString()}`
    return `${from?.toLocaleDateString()} - ${to?.toLocaleDateString()}`
  }, [dateRange.from, dateRange.to])

  const handleToday = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tonight = new Date()
    tonight.setHours(23, 59, 59, 999)
    setDateRange({ from: today, to: tonight })
    toast({ title: "Filter applied", description: "Showing today's transactions." })
  }

  const handleReset = () => {
    setStatusFilter("all")
    setSearch("")
    setSalesUserFilter("all")
    setItemFilter("all")
    setDateRange({})
    setPageIndex(0)
    toast({ title: "Filters cleared", description: "Showing all transactions." })
  }

  if (!merchant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fafafa] gap-4">
        <Clock className="w-12 h-12 text-slate-300" />
        <h2 className="text-xl font-bold text-slate-400">Merchant Not Found</h2>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 px-4 sm:px-6">
      {/* Minimal Header */}
      <header className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Transactions</h1>
          {hasActiveFilters ? (
            <p className="text-sm font-medium text-slate-500 mt-1">
              {filteredSuccessCount} successful · {filtered.length} shown
              {filteredTotalReceived > 0 && <> · {filteredTotalReceived.toFixed(2)} ETB received</>}
            </p>
          ) : (
            <p className="text-sm font-medium text-slate-500 mt-1">
              {transactions.length} total
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-10 pl-9 rounded-xl border-slate-200 bg-white shadow-sm focus:ring-amber-500/20"
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-10 rounded-xl border-slate-200 bg-white px-4 font-semibold text-slate-700 shadow-sm gap-2",
                  hasActiveFilters && "border-amber-200 bg-amber-50 text-amber-700"
                )}
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filter</span>
                {hasActiveFilters && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-[10px] text-white">
                    !
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-40px)] max-w-[400px] p-0 rounded-2xl shadow-2xl border-slate-100" align="end">
              <div className="p-5 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Filters & Reports</h3>
                  <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 text-xs font-bold text-amber-600 hover:text-amber-700 hover:bg-amber-50">
                    Reset All
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date Range</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-9 rounded-lg text-xs font-bold border-slate-100 hover:bg-slate-50"
                        onClick={handleToday}
                      >
                        Today
                      </Button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-9 rounded-lg text-xs font-bold border-slate-100 truncate">
                            <CalendarDays className="mr-2 h-3.5 w-3.5" />
                            {dateRangeLabel}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <Calendar
                            hideWeekdays
                            mode="range"
                            selected={dateRange as any}
                            onSelect={(range) => setDateRange((range ?? {}) as any)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</Label>
                      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                        <SelectTrigger className="h-9 rounded-lg border-slate-100 text-xs font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="success">Success</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="initiated">Initiated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sales User</Label>
                      <Select value={salesUserFilter} onValueChange={setSalesUserFilter}>
                        <SelectTrigger className="h-9 rounded-lg border-slate-100 text-xs font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {salesUserOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item</Label>
                    {itemFilterOptions.length > 0 ? (
                      <Select value={itemFilter} onValueChange={setItemFilter}>
                        <SelectTrigger className="h-9 rounded-lg border-slate-100 text-xs font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Items</SelectItem>
                          {itemFilterOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select disabled value="none">
                        <SelectTrigger className="h-9 rounded-lg border-slate-100 text-xs font-semibold text-slate-400">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No items used yet</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Sales Summary Report Section */}
                <div className="pt-4 border-t border-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sales Summary</Label>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 px-2 text-[10px] font-bold text-amber-600 gap-1.5"
                      onClick={exportToCSV}
                    >
                      <Download className="w-3 h-3" /> Export
                    </Button>
                  </div>
                  
                  <div className="space-y-2 max-h-[160px] overflow-auto pr-1">
                    {salesSummary.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic text-center py-2">No data for this period</p>
                    ) : (
                      salesSummary.map(([uid, data]) => (
                        <div key={uid} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/50 border border-slate-100">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm">
                              <UserIcon className="w-3 h-3 text-slate-400" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-700 truncate max-w-[100px]">{data.name}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-black text-amber-700">{data.total.toFixed(2)} ETB</p>
                            <p className="text-[9px] font-medium text-slate-400">{data.count} orders</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {/* Transaction List */}
      <main className="space-y-3">
        {pageItems.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-slate-200" />
            </div>
            <p className="text-sm font-bold text-slate-400">No transactions found</p>
            <p className="text-xs text-slate-300 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pageItems.items.map((tx) => (
              <Card key={tx.id} className="group rounded-[20px] border-slate-100 bg-white hover:border-amber-100 hover:shadow-md transition-all duration-300 overflow-hidden shadow-sm">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-black text-slate-900 truncate">
                            {tx.amount.toFixed(2)} ETB
                          </span>
                          <Badge className={cn(
                            "text-[9px] uppercase tracking-wider font-bold h-4 px-1.5 rounded-md border-0 whitespace-nowrap",
                            tx.status === 'success' ? "bg-emerald-100 text-emerald-700" :
                            nonTerminalStatuses.includes(tx.status) ? "bg-amber-100 text-amber-700" :
                            "bg-rose-100 text-rose-700"
                          )}>
                            {statusLabel(tx.status)}
                          </Badge>
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 truncate flex items-center gap-1.5">
                          {tx.transactionReference}
                          <span className="w-1 h-1 rounded-full bg-slate-200" />
                          {new Date(tx.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="hidden sm:flex flex-col items-end gap-1 text-right">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500">{tx.userCredentials.initiatedByName || "System"}</span>
                        <UserIcon className="w-3 h-3 text-slate-300" />
                      </div>
                      <p className="text-[10px] text-slate-300 font-medium">
                        {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-slate-300 group-hover:text-slate-500 sm:hidden shrink-0"
                      onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                    >
                      <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", expandedId === tx.id && "rotate-180")} />
                    </Button>
                  </div>

                  {expandedId === tx.id && (
                    <div className="sm:hidden mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="w-3 h-3 text-slate-300" />
                        <span className="text-[11px] font-bold text-slate-500">{tx.userCredentials.initiatedByName || "System"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-300" />
                        <span className="text-[11px] text-slate-400 font-medium">
                          {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between pt-4 px-2">
            <Button
              variant="ghost"
              className="h-10 rounded-xl font-bold text-slate-600 gap-2 px-4"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageItems.safePageIndex === 0}
            >
              <ArrowLeft className="w-4 h-4" /> Previous
            </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: pageCount }, (_, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    i === pageItems.safePageIndex ? "bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] w-4" : "bg-slate-200"
                  )} 
                />
              ))}
            </div>

            <Button
              variant="ghost"
              className="h-10 rounded-xl font-bold text-slate-600 gap-2 px-4"
              onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              disabled={pageItems.safePageIndex >= pageCount - 1}
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}

