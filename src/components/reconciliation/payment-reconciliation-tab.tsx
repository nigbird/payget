'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  ReceiptText,
  Download,
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
import { FilterToolbar, SearchInput, DateRangeFilter } from './filter-toolbar'
import { TablePagination } from './table-pagination'

type UnresolvedTransaction = {
  id: string
  merchantId: string
  merchant: { id: string; name: string; accountNumber: string | null }
  amount: number
  paymentMethod?: string | null
  status: string
  transactionReference: string
  cbsreference: string | null
  providerStatusCode: string | null
  providerStatusDesc: string | null
  payerPhone: string | null
  payerAccount: string | null
  userCredentials?: { phone?: string | null } | null
  serviceDescription: string | null
  timestamp: string
  transactionTimestamp: string
  reconciliationRequests: ReconciliationRequest[]
}

type ReconciliationRequest = {
  id: string
  transactionId: string
  transaction?: {
    transactionReference: string
    amount: number
    paymentMethod?: string | null
    payerPhone: string | null
    payerAccount?: string | null
    merchant: { name: string }
  }
  ftNumber: string
  previousStatus: string
  reason: string
  comments: string | null
  status: string
  maker: { id: string; name: string | null; email: string | null }
  checker: { id: string; name: string | null; email: string | null } | null
  checkedAt: string | null
  createdAt: string
}

type Stats = { unresolved: number; settledByFt: number; pendingRequests: number }

type View = 'unresolved' | 'history'

/** Default for the payments list: only stuck payments, which are the ones that can be settled. */
const UNRESOLVED = 'UNRESOLVED'
const UNRESOLVED_STATUSES = ['AWAITING_PIN', 'INITIATED', 'PENDING', 'PROCESSING']

const PAYMENT_STATUS_OPTIONS = [
  { value: UNRESOLVED, label: 'Unresolved only' },
  { value: 'AWAITING_PIN', label: 'Awaiting PIN' },
  { value: 'INITIATED', label: 'Initiated' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
]

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK: 'NIB Bank',
  TELEBIRR: 'Telebirr',
  YAGOUT: 'YagoutPay',
}

const HISTORY_STATUS_OPTIONS = [
  { value: 'EXECUTED', label: 'Settled' },
  { value: 'REJECTED', label: 'Rejected' },
]

const STATUS_STYLES: Record<string, string> = {
  AWAITING_PIN: 'bg-amber-100 text-amber-800 border-amber-200',
  INITIATED: 'bg-slate-100 text-slate-700 border-slate-200',
  PENDING: 'bg-blue-100 text-blue-800 border-blue-200',
  PROCESSING: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  SUCCESS: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FAILED: 'bg-red-100 text-red-800 border-red-200',
  EXECUTED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

/** YYYY-MM-DD in local time, for the Trx_Date column of the reconciliation export. */
function formatDay(value: string) {
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Payment side of the reconciliation console.
 *
 * `embedded` is set when this renders inside /admin/reconciliation, where the
 * page supplies its own heading and pending requests live in the shared
 * approvals queue rather than in a tab of their own.
 */
export function PaymentReconciliationTab({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth()
  const { toast } = useToast()

  const userRole = user?.role
  const userPermissions = user?.permissions || []
  const canView = userRole === 'ADMIN' || userPermissions.includes('payment.reconciliation.view')
  const canRequest = userRole === 'ADMIN' || userPermissions.includes('payment.reconciliation.request')
  const canManage = userRole === 'ADMIN' || userPermissions.includes('payment.reconciliation.manage')
  // No ADMIN fallback: the API checks this permission on download.
  const canExport = userPermissions.includes('payment.reconciliation.export')

  const [transactions, setTransactions] = useState<UnresolvedTransaction[]>([])
  const [requests, setRequests] = useState<ReconciliationRequest[]>([])
  const [history, setHistory] = useState<ReconciliationRequest[]>([])
  const [merchants, setMerchants] = useState<Array<{ id: string; name: string }>>([])
  const [stats, setStats] = useState<Stats>({ unresolved: 0, settledByFt: 0, pendingRequests: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [view, setView] = useState<View>('unresolved')

  const [search, setSearch] = useState('')
  const [merchantId, setMerchantId] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState(UNRESOLVED)
  const [paymentMethod, setPaymentMethod] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)

  const [selectedTx, setSelectedTx] = useState<UnresolvedTransaction | null>(null)
  const [ftNumber, setFtNumber] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [reviewRequest, setReviewRequest] = useState<ReconciliationRequest | null>(null)
  const [comments, setComments] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)

  const buildParams = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), ...extra })
      if (view === 'history') params.set('view', 'history')
      if (search.trim()) params.set('search', search.trim())
      if (merchantId !== 'ALL') params.set('merchantId', merchantId)
      // The payments list defaults server-side to unresolved, so ALL has to be sent explicitly.
      if (statusFilter !== 'ALL' || view === 'unresolved') params.set('status', statusFilter)
      if (paymentMethod !== 'ALL') params.set('paymentMethod', paymentMethod)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      return params
    },
    [page, pageSize, view, search, merchantId, statusFilter, paymentMethod, dateFrom, dateTo]
  )

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Stats, merchants and pending requests only come with the unresolved
      // response, so it is always loaded; history is fetched alongside it.
      const [res, historyRes] = await Promise.all([
        fetch(
          `/api/admin/payment-reconciliation?${view === 'unresolved' ? buildParams() : new URLSearchParams({ limit: '1' })}`
        ),
        view === 'history' ? fetch(`/api/admin/payment-reconciliation?${buildParams()}`) : Promise.resolve(null),
      ])
      const failed = !res.ok ? res : historyRes && !historyRes.ok ? historyRes : null
      if (failed) {
        const err = await failed.json().catch(() => ({}))
        toast({ variant: 'destructive', title: 'Could not load', description: err.error || 'Request failed.' })
        return
      }
      const data = await res.json()
      setRequests(data.requests || [])
      setMerchants(data.merchants || [])
      setStats(data.stats || { unresolved: 0, settledByFt: 0, pendingRequests: 0 })

      const listData = historyRes ? await historyRes.json() : data
      if (historyRes) setHistory(listData.history || [])
      else setTransactions(data.transactions || [])
      setTotal(listData.total || 0)
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'A technical error occurred.' })
    } finally {
      setIsLoading(false)
    }
  }, [view, buildParams, toast])

  const switchView = (next: View) => {
    if (next === view) return
    setView(next)
    setStatusFilter(next === 'unresolved' ? UNRESOLVED : 'ALL')
    setPage(1)
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await fetch(`/api/admin/payment-reconciliation?${buildParams({ download: 'true' })}`)
      if (!res.ok) throw new Error('Failed to fetch export data')
      const data = await res.json()

      if (view === 'history') {
        const rows: ReconciliationRequest[] = data.history || []
        downloadCsv(
          'payment-reconciliation-history',
          [
            'Reference',
            'Merchant',
            'Amount (ETB)',
            'Payment method',
            'Payer',
            'FT',
            'Status before',
            'Result',
            'Reason',
            'Submitted by',
            'Submitted at',
            'Reviewed by',
            'Reviewed at',
            'Comments',
          ],
          rows.map((r) => [
            r.transaction?.transactionReference || '',
            r.transaction?.merchant?.name || '',
            r.transaction?.amount ?? '',
            r.transaction?.paymentMethod || '',
            r.transaction?.payerPhone || r.transaction?.payerAccount || '',
            r.ftNumber,
            r.previousStatus,
            r.status === 'EXECUTED' ? 'Settled' : 'Rejected',
            r.reason,
            r.maker?.name || r.maker?.email || '',
            formatDate(r.createdAt),
            r.checker?.name || r.checker?.email || '',
            r.checkedAt ? formatDate(r.checkedAt) : '',
            r.comments || '',
          ])
        )
        toast({ title: 'Export complete', description: `Exported ${rows.length} decided requests to CSV.` })
      } else {
        const rows: UnresolvedTransaction[] = data.transactions || []
        // Column names and order follow the reconciliation team's template.
        // merchantId is the merchant's credit account, the side they match against core banking.
        downloadCsv(
          'payment-reconciliation-transactions',
          [
            'merchantId',
            'amount',
            'status',
            'Trx_Date',
            'payerPhone',
            'DEBIT.ACCT.NO',
            'transactionReference',
            'serviceDescription',
            'transactionTimestamp',
            'paymentMethod',
            'cbsreference',
            'providerStatusDesc',
          ],
          rows.map((tx) => [
            tx.merchant?.accountNumber || '',
            tx.amount,
            tx.status,
            formatDay(tx.timestamp),
            tx.payerPhone || tx.userCredentials?.phone || '',
            tx.payerAccount || '',
            tx.transactionReference,
            tx.serviceDescription || '',
            formatDate(tx.transactionTimestamp),
            tx.paymentMethod || '',
            tx.cbsreference || '',
            tx.providerStatusDesc || '',
          ])
        )
        toast({ title: 'Export complete', description: `Exported ${rows.length} transactions to CSV.` })
      }
    } catch {
      toast({ variant: 'destructive', title: 'Export failed', description: 'Could not export the report.' })
    } finally {
      setIsExporting(false)
    }
  }

  useEffect(() => {
    if (canView) fetchData()
  }, [canView, fetchData])

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/payment-reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  }

  const handleSubmitFt = async () => {
    if (!selectedTx || !ftNumber.trim() || !reason.trim()) return
    setIsSubmitting(true)
    try {
      const { ok, data } = await post({
        action: 'create_request',
        transactionId: selectedTx.id,
        ftNumber: ftNumber.trim(),
        reason: reason.trim(),
      })
      if (ok) {
        toast({
          title: 'Submitted for approval',
          description: 'A second reviewer must approve before the payment is settled.',
        })
        setSelectedTx(null)
        setFtNumber('')
        setReason('')
        fetchData()
      } else {
        toast({ variant: 'destructive', title: 'Could not submit', description: data.error || 'Request failed.' })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReview = async (request: ReconciliationRequest, approve: boolean) => {
    setActingId(request.id)
    try {
      const { ok, data } = await post({
        action: approve ? 'approve_request' : 'reject_request',
        requestId: request.id,
        comments: comments.trim() || null,
      })
      if (ok) {
        toast({
          title: approve ? 'Payment settled' : 'Request rejected',
          description: approve
            ? `Marked successful against FT ${request.ftNumber}. Cashback processing has been triggered.`
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

  if (!canView) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            You do not have permission to view payment reconciliation.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-6 p-6'}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payment Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Settle payments that succeeded at the bank but were never resolved here, using the FT
            from the internal bank receipt.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card
          className={`cursor-pointer transition-colors hover:bg-muted/40 ${view === 'unresolved' ? 'border-amber-400 ring-1 ring-amber-400' : ''}`}
          onClick={() => switchView('unresolved')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unresolved payments</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.unresolved}</div>
            <p className="text-xs text-muted-foreground">Never reached success or failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting approval</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingRequests}</div>
            <p className="text-xs text-muted-foreground">FT submitted, needs a checker</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors hover:bg-muted/40 ${view === 'history' ? 'border-emerald-400 ring-1 ring-emerald-400' : ''}`}
          onClick={() => switchView('history')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Settled by FT</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.settledByFt}</div>
            <p className="text-xs text-muted-foreground">Click to view the reconciliation report</p>
          </CardContent>
        </Card>
      </div>

      {/* When embedded, pin to the unresolved list — pending requests are shown
          in the shared approvals queue instead. */}
      <Tabs value={embedded ? 'unresolved' : undefined} defaultValue="unresolved">
        {!embedded && (
          <TabsList>
            <TabsTrigger value="unresolved">Unresolved payments</TabsTrigger>
            <TabsTrigger value="approvals">
              Pending approvals{requests.length ? ` (${requests.length})` : ''}
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="unresolved" className="space-y-4">
          <FilterToolbar
            search={
              <SearchInput
                placeholder={
                  view === 'history' ? 'Search reference or FT' : 'Search reference, FT, phone or account'
                }
                value={search}
                onChange={(v) => {
                  setSearch(v)
                  setPage(1)
                }}
              />
            }
            actions={
              <>
                <Button variant="outline" onClick={fetchData} disabled={isLoading}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                {canExport && (
                  <Button variant="outline" onClick={handleExport} disabled={isExporting}>
                    {isExporting ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Export
                  </Button>
                )}
              </>
            }
          >
            <Select
              value={merchantId}
              onValueChange={(v) => {
                setMerchantId(v)
                setPage(1)
              }}
            >
              <SelectTrigger>
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
            <Select
              value={paymentMethod}
              onValueChange={(v) => {
                setPaymentMethod(v)
                setPage(1)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All methods</SelectItem>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {(view === 'history' ? HISTORY_STATUS_OPTIONS : PAYMENT_STATUS_OPTIONS).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={({ from, to }) => {
                setDateFrom(from)
                setDateTo(to)
                setPage(1)
              }}
            />
          </FilterToolbar>

          {view === 'history' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reconciliation history</CardTitle>
                <CardDescription>
                  Every FT request a checker has decided — settled or rejected.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>FT</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Submitted by</TableHead>
                      <TableHead>Reviewed by</TableHead>
                      <TableHead>Reviewed at</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : history.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                          No decided reconciliation requests.
                        </TableCell>
                      </TableRow>
                    ) : (
                      history.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">
                            {r.transaction?.transactionReference}
                          </TableCell>
                          <TableCell>{r.transaction?.merchant?.name}</TableCell>
                          <TableCell>
                            {r.transaction ? formatCurrency(r.transaction.amount) : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {PAYMENT_METHOD_LABELS[r.transaction?.paymentMethod ?? ''] ?? r.transaction?.paymentMethod ?? '—'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.ftNumber}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_STYLES[r.status] || ''}>
                              {r.status === 'EXECUTED' ? 'Settled' : 'Rejected'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.maker?.name || r.maker?.email}
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
                <TablePagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size)
                    setPage(1)
                  }}
                />
              </CardContent>
            </Card>
          ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Initiated</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        {statusFilter === UNRESOLVED ? 'No unresolved payments.' : 'No payments match these filters.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx) => {
                      const hasPending = tx.reconciliationRequests?.some((r) => r.status === 'PENDING')
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="font-mono text-xs">{tx.transactionReference}</TableCell>
                          <TableCell>{tx.merchant?.name}</TableCell>
                          <TableCell>{formatCurrency(tx.amount)}</TableCell>
                          <TableCell className="text-sm">
                            {PAYMENT_METHOD_LABELS[tx.paymentMethod ?? ''] ?? tx.paymentMethod ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {tx.payerPhone || tx.payerAccount || tx.userCredentials?.phone || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_STYLES[tx.status] || ''}>
                              {tx.status}
                            </Badge>
                            {tx.providerStatusDesc && (
                              <div className="mt-1 max-w-[180px] whitespace-pre-line text-[11px] leading-tight text-muted-foreground">
                                {tx.providerStatusDesc}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(tx.timestamp)}
                          </TableCell>
                          <TableCell className="text-right">
                            {!UNRESOLVED_STATUSES.includes(tx.status) ? (
                              <span className="text-sm text-muted-foreground">—</span>
                            ) : hasPending ? (
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
                                  setFtNumber('')
                                  setReason('')
                                }}
                              >
                                <ReceiptText className="mr-2 h-4 w-4" />
                                Settle by FT
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            </CardContent>
          </Card>
          )}
        </TabsContent>

        <TabsContent value="approvals">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Requests awaiting a checker</CardTitle>
              <CardDescription>
                Approving forces the payment to successful against the submitted FT and triggers
                cashback. You cannot approve a request you submitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>FT</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Submitted by</TableHead>
                    <TableHead className="text-right">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
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
                        <TableCell className="font-mono text-xs">{r.ftNumber}</TableCell>
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

      {/* Maker: submit FT */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle payment by FT</DialogTitle>
            <DialogDescription>
              Enter the FT from the internal bank receipt proving this payment landed. A second reviewer must
              approve before the status changes.
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
                {selectedTx.providerStatusDesc && (
                  <div className="mt-2 border-t pt-2">
                    <div className="text-muted-foreground">
                      Provider response
                      {selectedTx.providerStatusCode ? ` (code ${selectedTx.providerStatusCode})` : ''}
                    </div>
                    <div className="mt-1 whitespace-pre-line text-xs">
                      {selectedTx.providerStatusDesc}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ft">FT number</Label>
                <Input
                  id="ft"
                  value={ftNumber}
                  onChange={(e) => setFtNumber(e.target.value)}
                  placeholder="FT from the bank receipt"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Where the FT came from and why this payment needs reconciling"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTx(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitFt}
              disabled={isSubmitting || !ftNumber.trim() || !reason.trim()}
            >
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
              Approving marks the payment successful against this FT and triggers cashback
              processing. This cannot be undone from here.
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
                  <span className="text-muted-foreground">FT</span>
                  <span className="font-mono text-xs">{reviewRequest.ftNumber}</span>
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
                <Label htmlFor="comments">Comments (optional)</Label>
                <Textarea
                  id="comments"
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
              Approve &amp; settle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
