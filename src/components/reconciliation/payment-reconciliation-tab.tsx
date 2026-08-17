'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  ReceiptText,
  ChevronLeft,
  ChevronRight,
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

type UnresolvedTransaction = {
  id: string
  merchantId: string
  merchant: { id: string; name: string; accountNumber: string | null }
  amount: number
  status: string
  transactionReference: string
  cbsreference: string | null
  payerPhone: string | null
  payerAccount: string | null
  userCredentials?: { phone?: string | null } | null
  timestamp: string
  reconciliationRequests: ReconciliationRequest[]
}

type ReconciliationRequest = {
  id: string
  transactionId: string
  transaction?: {
    transactionReference: string
    amount: number
    payerPhone: string | null
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

const STATUS_STYLES: Record<string, string> = {
  AWAITING_PIN: 'bg-amber-100 text-amber-800 border-amber-200',
  INITIATED: 'bg-slate-100 text-slate-700 border-slate-200',
  PENDING: 'bg-blue-100 text-blue-800 border-blue-200',
  PROCESSING: 'bg-indigo-100 text-indigo-800 border-indigo-200',
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amount)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
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

  const [transactions, setTransactions] = useState<UnresolvedTransaction[]>([])
  const [requests, setRequests] = useState<ReconciliationRequest[]>([])
  const [merchants, setMerchants] = useState<Array<{ id: string; name: string }>>([])
  const [stats, setStats] = useState<Stats>({ unresolved: 0, settledByFt: 0, pendingRequests: 0 })
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [merchantId, setMerchantId] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const [selectedTx, setSelectedTx] = useState<UnresolvedTransaction | null>(null)
  const [ftNumber, setFtNumber] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [reviewRequest, setReviewRequest] = useState<ReconciliationRequest | null>(null)
  const [comments, setComments] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search.trim()) params.set('search', search.trim())
      if (merchantId !== 'ALL') params.set('merchantId', merchantId)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await fetch(`/api/admin/payment-reconciliation?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({ variant: 'destructive', title: 'Could not load', description: err.error || 'Request failed.' })
        return
      }
      const data = await res.json()
      setTransactions(data.transactions || [])
      setRequests(data.requests || [])
      setMerchants(data.merchants || [])
      setStats(data.stats || { unresolved: 0, settledByFt: 0, pendingRequests: 0 })
      setTotalPages(data.totalPages || 1)
      setTotal(data.total || 0)
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'A technical error occurred.' })
    } finally {
      setIsLoading(false)
    }
  }, [page, search, merchantId, dateFrom, dateTo, toast])

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
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Payment Reconciliation</h1>
            <p className="text-sm text-muted-foreground">
              Settle payments that succeeded at the bank but were never resolved here, using the FT
              from the internal bank receipt.
            </p>
          </div>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Settled by FT</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.settledByFt}</div>
            <p className="text-xs text-muted-foreground">Recovered through this screen</p>
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reference, FT, phone or account"
                className="pl-8"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <Select
              value={merchantId}
              onValueChange={(v) => {
                setMerchantId(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[220px]">
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
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="w-[160px]"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setPage(1)
                }}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                className="w-[160px]"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setPage(1)
                }}
              />
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom('')
                    setDateTo('')
                    setPage(1)
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

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
                  ) : transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No unresolved payments.
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
                          <TableCell className="text-sm text-muted-foreground">
                            {tx.payerPhone || tx.payerAccount || tx.userCredentials?.phone || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_STYLES[tx.status] || ''}>
                              {tx.status}
                            </Badge>
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
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {total} unresolved
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
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
