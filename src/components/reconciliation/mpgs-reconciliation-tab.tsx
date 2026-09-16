'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  Search,
  Filter,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { downloadCsv } from '@/lib/export-csv'

type OpenCardTransaction = {
  id: string
  merchantId: string
  merchant: { id: string; name: string; accountNumber: string | null } | null
  amount: number
  status: string
  transactionReference: string
  payerPhone: string | null
  payerAccount: string | null
  timestamp: string
  gatewayStatus: string | null
  closedReason: string | null
  attempts: number | null
  reconciliationRequests: MpgsReconciliationRequest[]
}

type MpgsReconciliationRequest = {
  id: string
  transactionId: string
  transaction?: {
    transactionReference: string
    amount: number
    merchant: { name: string }
  }
  previousStatus: string
  reason: string
  comments: string | null
  status: string
  resultAction: string | null
  maker: { id: string; name: string | null; email: string | null }
  checker: { id: string; name: string | null; email: string | null } | null
  checkedAt: string | null
  createdAt: string
}

type Stats = { openTransactions: number; pendingRequests: number; reconciledCount: number }

type ViewFilter = 'open' | 'pending' | 'reconciled'

const STATUS_STYLES: Record<string, string> = {
  awaiting_pin: 'bg-amber-100 text-amber-800 border-amber-200',
  initiated: 'bg-slate-100 text-slate-700 border-slate-200',
  pending: 'bg-blue-100 text-blue-800 border-blue-200',
  processing: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  failed: 'bg-rose-100 text-rose-700 border-rose-200',
}

const STATUS_FILTER_OPTIONS = [
  { value: 'initiated', label: 'Initiated' },
  { value: 'pending', label: 'Pending' },
  { value: 'awaiting_pin', label: 'Awaiting PIN' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed (recoverable)' },
]

const RESULT_ACTION_LABELS: Record<string, string> = {
  settled: 'Settled',
  expired: 'Expired',
  attempts_exhausted: 'Attempts exhausted',
  gateway_failure: 'Gateway reported failure',
  pending: 'Still pending at gateway',
  no_op: 'Already final — no change',
  skipped: 'Skipped — not an MPGS transaction',
}

function resultActionLabel(action: string | null) {
  if (!action) return '—'
  return RESULT_ACTION_LABELS[action] ?? action
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

/**
 * Card (MPGS) side of the reconciliation console.
 *
 * Mastercard checkout pages never call back into this app, so open card
 * transactions must be re-checked with the gateway explicitly. No evidence is
 * supplied here — the maker just flags a transaction, and approval re-queries
 * the gateway at that moment.
 *
 * `embedded` is set when this renders inside /admin/reconciliation, where the
 * page supplies its own heading and pending requests live in the shared
 * approvals queue rather than in a tab of their own.
 */
export function MpgsReconciliationTab({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth()
  const { toast } = useToast()

  const userPermissions = user?.permissions || []
  const canView = userPermissions.includes('mpgs.reconciliation.view')
  const canRequest = userPermissions.includes('mpgs.reconciliation.request')
  const canManage = userPermissions.includes('mpgs.reconciliation.manage')
  const canExport = userPermissions.includes('mpgs.reconciliation.export')

  const [transactions, setTransactions] = useState<OpenCardTransaction[]>([])
  const [requests, setRequests] = useState<MpgsReconciliationRequest[]>([])
  const [history, setHistory] = useState<MpgsReconciliationRequest[]>([])
  const [merchants, setMerchants] = useState<Array<{ id: string; name: string }>>([])
  const [stats, setStats] = useState<Stats>({ openTransactions: 0, pendingRequests: 0, reconciledCount: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [viewFilter, setViewFilter] = useState<ViewFilter>('open')

  const [search, setSearch] = useState('')
  const [merchantId, setMerchantId] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  const [selectedTx, setSelectedTx] = useState<OpenCardTransaction | null>(null)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [reviewRequest, setReviewRequest] = useState<MpgsReconciliationRequest | null>(null)
  const [comments, setComments] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)

  const buildParams = useCallback(
    (overrides?: Record<string, string>) => {
      const params = new URLSearchParams({ page: String(page), limit: String(itemsPerPage) })
      if (search.trim()) params.set('search', search.trim())
      if (merchantId !== 'ALL') params.set('merchantId', merchantId)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      for (const [k, v] of Object.entries(overrides ?? {})) params.set(k, v)
      return params
    },
    [page, itemsPerPage, search, merchantId, statusFilter, dateFrom, dateTo]
  )

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/mpgs-reconciliation?${buildParams()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({ variant: 'destructive', title: 'Could not load', description: err.error || 'Request failed.' })
        return
      }
      const data = await res.json()
      setTransactions(data.transactions || [])
      setRequests(data.requests || [])
      setHistory(data.history || [])
      setMerchants(data.merchants || [])
      setStats(data.stats || { openTransactions: 0, pendingRequests: 0, reconciledCount: 0 })
      setTotalPages(data.totalPages || 1)
      setTotal(data.total || 0)
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'A technical error occurred.' })
    } finally {
      setIsLoading(false)
    }
  }, [buildParams, toast])

  useEffect(() => {
    if (canView) fetchData()
  }, [canView, fetchData])

  useEffect(() => {
    setPage(1)
  }, [search, merchantId, statusFilter, dateFrom, dateTo, itemsPerPage])

  const handleExport = async () => {
    if (viewFilter === 'reconciled') {
      downloadCsv(
        'mpgs-reconciliation-history',
        ['Reference', 'Merchant', 'Status before', 'Result', 'Reviewed by', 'Reviewed at'],
        history.map((r) => [
          r.transaction?.transactionReference || '',
          r.transaction?.merchant?.name || '',
          r.previousStatus,
          r.status === 'REJECTED' ? 'Rejected' : resultActionLabel(r.resultAction),
          r.checker?.name || r.checker?.email || '',
          r.checkedAt ? formatDate(r.checkedAt) : '',
        ])
      )
      toast({ title: 'Export complete', description: `Exported ${history.length} decided requests to CSV.` })
      return
    }

    setIsExporting(true)
    try {
      const res = await fetch(`/api/admin/mpgs-reconciliation?${buildParams({ limit: '500' })}`)
      if (!res.ok) throw new Error('Failed to fetch export data')
      const data = await res.json()
      const rows: OpenCardTransaction[] = data.transactions || []

      downloadCsv(
        'mpgs-open-transactions',
        ['Reference', 'Merchant', 'Amount (ETB)', 'Payer', 'Status', 'Gateway status', 'Initiated'],
        rows.map((tx) => [
          tx.transactionReference,
          tx.merchant?.name || '',
          tx.amount,
          tx.payerPhone || tx.payerAccount || '',
          tx.status,
          tx.gatewayStatus || '',
          formatDate(tx.timestamp),
        ])
      )
      toast({ title: 'Export complete', description: `Exported ${rows.length} transactions to CSV.` })
    } catch {
      toast({ variant: 'destructive', title: 'Export failed', description: 'Could not export transactions.' })
    } finally {
      setIsExporting(false)
    }
  }

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/mpgs-reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  }

  const handleSubmitRequest = async () => {
    if (!selectedTx || !reason.trim()) return
    setIsSubmitting(true)
    try {
      const { ok, data } = await post({
        action: 'create_request',
        transactionId: selectedTx.id,
        reason: reason.trim(),
      })
      if (ok) {
        toast({
          title: 'Submitted for approval',
          description: 'A second reviewer must approve before the gateway is re-checked.',
        })
        setSelectedTx(null)
        setReason('')
        fetchData()
      } else {
        toast({ variant: 'destructive', title: 'Could not submit', description: data.error || 'Request failed.' })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReview = async (request: MpgsReconciliationRequest, approve: boolean) => {
    setActingId(request.id)
    try {
      const { ok, data } = await post({
        action: approve ? 'approve_request' : 'reject_request',
        requestId: request.id,
        comments: comments.trim() || null,
      })
      if (ok) {
        toast({
          title: approve ? 'Gateway re-checked' : 'Request rejected',
          description: approve
            ? `Outcome: ${data.settlement?.action ?? 'processed'}.`
            : 'The reconciliation request was rejected.',
        })
        setReviewRequest(null)
        setComments('')
        fetchData()
      } else {
        toast({ variant: 'destructive', title: 'Action failed', description: data.error || 'Request failed.' })
      }
    } finally {
      setActingId(null)
    }
  }

  // Most recent decided (non-pending) request per transaction, so a row can
  // show what happened last time even after it drops out of "awaiting approval".
  const lastDecidedByTx = useMemo(() => {
    const map = new Map<string, MpgsReconciliationRequest>()
    for (const tx of transactions) {
      const decided = (tx.reconciliationRequests ?? [])
        .filter((r) => r.status !== 'PENDING')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      if (decided) map.set(tx.id, decided)
    }
    return map
  }, [transactions])

  const visibleTransactions = useMemo(() => {
    if (viewFilter !== 'pending') return transactions
    return transactions.filter((tx) => tx.reconciliationRequests?.some((r) => r.status === 'PENDING'))
  }, [transactions, viewFilter])

  if (!canView) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            You do not have permission to view card reconciliation.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Card (MPGS) Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Mastercard checkout pages do not call back into this app. Flag an open card
            transaction for a fresh gateway check; a second reviewer approves before it runs.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setViewFilter('open')}
          onKeyDown={(e) => e.key === 'Enter' && setViewFilter('open')}
          className={`cursor-pointer transition-colors hover:bg-muted/40 ${viewFilter === 'open' ? 'border-amber-400 ring-1 ring-amber-400' : ''}`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open card transactions</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.openTransactions}</div>
            <p className="text-xs text-muted-foreground">No terminal outcome yet</p>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setViewFilter('pending')}
          onKeyDown={(e) => e.key === 'Enter' && setViewFilter('pending')}
          className={`cursor-pointer transition-colors hover:bg-muted/40 ${viewFilter === 'pending' ? 'border-blue-400 ring-1 ring-blue-400' : ''}`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting approval</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingRequests}</div>
            <p className="text-xs text-muted-foreground">Flagged, needs a checker</p>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setViewFilter('reconciled')}
          onKeyDown={(e) => e.key === 'Enter' && setViewFilter('reconciled')}
          className={`cursor-pointer transition-colors hover:bg-muted/40 ${viewFilter === 'reconciled' ? 'border-emerald-400 ring-1 ring-emerald-400' : ''}`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reconciled</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.reconciledCount}</div>
            <p className="text-xs text-muted-foreground">Processed through this screen</p>
          </CardContent>
        </Card>
      </div>

      {/* When embedded, pin to the open list — pending requests are shown in
          the shared approvals queue instead. The stat cards above still filter
          within it (open / pending / reconciled history). */}
      <Tabs value={embedded ? 'open' : undefined} defaultValue="open">
        {!embedded && (
          <TabsList>
            <TabsTrigger value="open">Open transactions</TabsTrigger>
            <TabsTrigger value="approvals">
              Pending approvals{requests.length ? ` (${requests.length})` : ''}
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="open" className="space-y-4">
          {viewFilter === 'reconciled' ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Reconciliation history</CardTitle>
                  <CardDescription>
                    Every request a checker has decided, most recent first. A transaction that
                    settled to a final outcome may no longer appear in the open list above.
                  </CardDescription>
                </div>
                {canExport && (
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Status before</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Reviewed by</TableHead>
                      <TableHead>Reviewed at</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : history.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          No reconciliation requests have been decided yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      history.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">
                            {r.transaction?.transactionReference}
                          </TableCell>
                          <TableCell>{r.transaction?.merchant?.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.previousStatus}</TableCell>
                          <TableCell>
                            {r.status === 'REJECTED' ? (
                              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                                Rejected
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                {resultActionLabel(r.resultAction)}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.checker?.name || r.checker?.email || '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.checkedAt ? formatDate(r.checkedAt) : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search reference, phone or account"
                      className="pl-8"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={merchantId} onValueChange={setMerchantId}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="All merchants" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All merchants</SelectItem>
                      {merchants.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        <SelectValue placeholder="All status" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All status</SelectItem>
                      {STATUS_FILTER_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      className="w-[150px]"
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="date"
                      className="w-[150px]"
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                    {(dateFrom || dateTo) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDateFrom('')
                          setDateTo('')
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <Select value={String(itemsPerPage)} onValueChange={(v) => setItemsPerPage(Number(v))}>
                    <SelectTrigger className="w-[90px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  {canExport && (
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
                      {isExporting ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      Export
                    </Button>
                  )}
                  {viewFilter === 'pending' && (
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                      Showing only transactions awaiting approval
                    </Badge>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Merchant</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Payer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Initiated</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                            Loading…
                          </TableCell>
                        </TableRow>
                      ) : visibleTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                            {viewFilter === 'pending' ? 'Nothing awaiting approval.' : 'No open card transactions.'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        visibleTransactions.map((tx) => {
                          const hasPending = tx.reconciliationRequests?.some((r) => r.status === 'PENDING')
                          const lastDecided = lastDecidedByTx.get(tx.id)
                          return (
                            <TableRow key={tx.id}>
                              <TableCell className="font-mono text-xs">{tx.transactionReference}</TableCell>
                              <TableCell>{tx.merchant?.name}</TableCell>
                              <TableCell>{formatCurrency(tx.amount)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {tx.payerPhone || tx.payerAccount || '—'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={STATUS_STYLES[tx.status] || ''}>
                                  {tx.status}
                                </Badge>
                                {tx.gatewayStatus && (
                                  <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                                    Gateway: {tx.gatewayStatus}
                                  </div>
                                )}
                                {lastDecided && (
                                  <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                                    Last check: {lastDecided.status === 'REJECTED' ? 'rejected' : resultActionLabel(lastDecided.resultAction)}
                                    {lastDecided.checkedAt ? ` · ${formatDate(lastDecided.checkedAt)}` : ''}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(tx.timestamp)}
                              </TableCell>
                              <TableCell className="text-right">
                                {hasPending ? (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                    Awaiting approval
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!canRequest}
                                    onClick={() => {
                                      setSelectedTx(tx)
                                      setReason('')
                                    }}
                                  >
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    Request reconciliation
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {totalPages > 1 && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    Showing <span className="font-bold text-foreground">{(page - 1) * itemsPerPage + 1}</span> to{' '}
                    <span className="font-bold text-foreground">{Math.min(page * itemsPerPage, total)}</span> of{' '}
                    <span className="font-bold text-foreground">{total}</span> results
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                    >
                      <ChevronsLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage((p) => Math.max(p - 1, 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <div className="mx-1 flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum = page
                        if (totalPages <= 5) pageNum = i + 1
                        else if (page <= 3) pageNum = i + 1
                        else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                        else pageNum = page - 2 + i

                        return (
                          <Button
                            key={pageNum}
                            variant={page === pageNum ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 min-w-[32px]"
                            onClick={() => setPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        )
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage(totalPages)}
                      disabled={page === totalPages}
                    >
                      <ChevronsRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="approvals">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Requests awaiting a checker</CardTitle>
              <CardDescription>
                Approving re-checks this transaction with the gateway right now and settles,
                expires, or closes it based on what it reports. You cannot approve a request you
                submitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Submitted by</TableHead>
                    <TableHead className="text-right">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        Nothing awaiting approval.
                      </TableCell>
                    </TableRow>
                  ) : (
                    requests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">
                          {r.transaction?.transactionReference}
                        </TableCell>
                        <TableCell>{r.transaction?.merchant?.name}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-sm">{r.reason}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.maker?.name || r.maker?.email}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canManage || r.maker?.id === user?.id}
                            onClick={() => {
                              setReviewRequest(r)
                              setComments('')
                            }}
                          >
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Maker: flag for reconciliation */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request card reconciliation</DialogTitle>
            <DialogDescription>
              This re-checks the transaction with the gateway when approved — no evidence is
              needed from you, just the reason this needs a fresh look. A second reviewer must
              approve before it runs.
            </DialogDescription>
          </DialogHeader>

          {selectedTx && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono text-xs">{selectedTx.transactionReference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Merchant</span>
                  <span>{selectedTx.merchant?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span>{formatCurrency(selectedTx.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current status</span>
                  <span>{selectedTx.status}</span>
                </div>
                {selectedTx.gatewayStatus && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last gateway status</span>
                    <span>{selectedTx.gatewayStatus}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="mpgs-reason">Reason</Label>
                <Textarea
                  id="mpgs-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why this transaction needs to be re-checked with the gateway"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTx(null)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitRequest} disabled={isSubmitting || !reason.trim()}>
              Submit for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checker: approve or reject */}
      <Dialog open={!!reviewRequest} onOpenChange={(open) => !open && setReviewRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review reconciliation request</DialogTitle>
            <DialogDescription>
              Approving re-checks this transaction with the gateway right now. The outcome
              depends on what the gateway reports at that moment.
            </DialogDescription>
          </DialogHeader>

          {reviewRequest && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono text-xs">
                    {reviewRequest.transaction?.transactionReference}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status before</span>
                  <span>{reviewRequest.previousStatus}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submitted by</span>
                  <span>{reviewRequest.maker?.name || reviewRequest.maker?.email}</span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-muted-foreground">Maker&apos;s reason</Label>
                <p className="rounded-md border p-3 text-sm">{reviewRequest.reason}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mpgs-comments">Comments (optional)</Label>
                <Textarea
                  id="mpgs-comments"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!actingId}
              onClick={() => reviewRequest && handleReview(reviewRequest, false)}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button
              disabled={!!actingId}
              onClick={() => reviewRequest && handleReview(reviewRequest, true)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve &amp; check gateway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
