'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { CheckCircle2, XCircle, RefreshCw, Download } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { downloadCsv } from '@/lib/export-csv'
import { CBS_CURRENCY, formatAmount, paymentMethodLabel, transactionCurrency } from '@/lib/transaction-currency'
import { FilterToolbar, SearchInput } from './filter-toolbar'

/**
 * One inbox for everything awaiting a checker, across payment, cashback, and
 * card (MPGS) reconciliation. A checker cares about what needs deciding, not
 * which subsystem it came from — so all request types are listed together and
 * each row routes its approve/reject to the endpoint that owns it.
 */

type Kind = 'PAYMENT' | 'CASHBACK' | 'MPGS'

type QueueRow = {
  kind: Kind
  id: string
  /** Payment reference the request ultimately concerns. */
  reference: string
  merchantName: string
  /** What the maker is asserting: an FT, or a replacement reference. */
  evidence: string
  /** Human label for the request type. */
  action: string
  amount: number | null
  reason: string
  makerId: string
  makerName: string
  createdAt: string
  /** Everything a checker needs to decide, grouped for the review dialog. */
  sections: DetailSection[]
}

type DetailField = { label: string; value: string | number | null | undefined; mono?: boolean }
type DetailSection = { title: string; fields: DetailField[] }

const fmtDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : null)

const makerLabel = (maker: any) =>
  maker?.name && maker?.email ? `${maker.name} (${maker.email})` : maker?.name || maker?.email || null

/** Shared "who asked, when, and why" block for every request type. */
const requestSection = (r: any, action: string, extra: DetailField[] = []): DetailSection => ({
  title: 'Request',
  fields: [
    { label: 'Action', value: action },
    ...extra,
    { label: 'Status before request', value: r.previousStatus },
    { label: 'Submitted by', value: makerLabel(r.maker) },
    { label: 'Submitted at', value: fmtDate(r.createdAt) },
    { label: 'Request ID', value: r.id, mono: true },
  ],
})

const merchantSection = (merchant: any): DetailSection => ({
  title: 'Merchant',
  fields: [
    { label: 'Name', value: merchant?.name },
    { label: 'Account number', value: merchant?.accountNumber, mono: true },
  ],
})

/** The payment transaction a payment or card request concerns. */
const transactionSection = (tx: any): DetailSection => ({
  title: 'Transaction',
  fields: [
    { label: 'Reference', value: tx?.transactionReference, mono: true },
    {
      label: 'Amount',
      value: tx?.amount != null ? formatAmount(tx.amount, transactionCurrency(tx, tx.merchant)) : null,
    },
    { label: 'Payment method', value: tx ? paymentMethodLabel(tx.paymentMethod) : null },
    { label: 'Current status', value: tx?.status },
    { label: 'Payer phone', value: tx?.payerPhone, mono: true },
    { label: 'Payer account', value: tx?.payerAccount, mono: true },
    { label: 'Existing FT / CBS reference', value: tx?.cbsreference, mono: true },
    {
      label: 'Provider response',
      value: [tx?.providerStatusCode, tx?.providerStatusDesc].filter(Boolean).join(' — ') || null,
    },
    { label: 'Description', value: tx?.description },
    { label: 'Initiated at', value: fmtDate(tx?.timestamp) },
    { label: 'Transaction ID', value: tx?.id, mono: true },
  ],
})

const cashbackSection = (cb: any): DetailSection => ({
  title: 'Cashback',
  fields: [
    { label: 'Payment reference', value: cb?.transactionReference, mono: true },
    { label: 'Payment amount', value: cb?.paymentAmount != null ? formatAmount(cb.paymentAmount, CBS_CURRENCY) : null },
    {
      label: 'Cashback amount',
      value:
        cb?.cashbackAmount != null
          ? `${formatAmount(cb.cashbackAmount, CBS_CURRENCY)}${cb.cashbackPercent != null ? ` (${cb.cashbackPercent}%)` : ''}`
          : null,
    },
    { label: 'Category', value: cb?.category?.name },
    { label: 'Current status', value: cb?.status },
    { label: 'Failure reason', value: cb?.failureReason },
    { label: 'Customer phone', value: cb?.customerPhone, mono: true },
    { label: 'Customer account', value: cb?.customerAccount, mono: true },
    { label: 'Subsidiary account', value: cb?.subsidiaryAccount, mono: true },
    { label: 'Provider debit ref', value: cb?.providerDebitRef, mono: true },
    { label: 'Provider credit ref', value: cb?.providerCreditRef, mono: true },
    { label: 'Created at', value: fmtDate(cb?.createdAt) },
    { label: 'Last processed at', value: fmtDate(cb?.processedAt) },
    { label: 'Cashback ID', value: cb?.id, mono: true },
  ],
})

const ENDPOINTS: Record<Kind, string> = {
  PAYMENT: '/api/admin/payment-reconciliation',
  CASHBACK: '/api/admin/cashback-reconciliation',
  MPGS: '/api/admin/mpgs-reconciliation',
}

const KIND_LABELS: Record<Kind, string> = {
  PAYMENT: 'Payment',
  CASHBACK: 'Cashback',
  MPGS: 'Card',
}

/** Each request type is exported under its own subsystem's export permission. */
const EXPORT_PERMISSIONS: Record<Kind, string> = {
  PAYMENT: 'payment.reconciliation.export',
  CASHBACK: 'cashback.reconciliation.export',
  MPGS: 'mpgs.reconciliation.export',
}

const CASHBACK_ACTION_LABELS: Record<string, string> = {
  RETRY: 'Retry transfer',
  REFERENCE_UPDATE: 'Update reference',
  MANUAL_SETTLE: 'Settle by FT',
}

export function ApprovalsQueue({
  canManagePayments,
  canManageCashback,
  canManageMpgs,
  canViewPayments,
  canViewCashback,
  canViewMpgs,
}: {
  canManagePayments: boolean
  canManageCashback: boolean
  canManageMpgs: boolean
  canViewPayments: boolean
  canViewCashback: boolean
  canViewMpgs: boolean
}) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [rows, setRows] = useState<QueueRow[]>([])
  const [kindFilter, setKindFilter] = useState<'ALL' | Kind>('ALL')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<QueueRow | null>(null)
  const [comments, setComments] = useState('')
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null)

  const fetchQueue = useCallback(async () => {
    setIsLoading(true)
    try {
      const [paymentRes, cashbackRes, mpgsRes] = await Promise.all([
        canViewPayments
          ? fetch('/api/admin/payment-reconciliation?limit=1').then((r) => (r.ok ? r.json() : null))
          : Promise.resolve(null),
        canViewCashback
          ? fetch('/api/admin/cashback-reconciliation?limit=1').then((r) => (r.ok ? r.json() : null))
          : Promise.resolve(null),
        canViewMpgs
          ? fetch('/api/admin/mpgs-reconciliation?limit=1').then((r) => (r.ok ? r.json() : null))
          : Promise.resolve(null),
      ])

      const paymentRows: QueueRow[] = (paymentRes?.requests ?? []).map((r: any) => ({
        kind: 'PAYMENT' as const,
        id: r.id,
        reference: r.transaction?.transactionReference ?? '—',
        merchantName: r.transaction?.merchant?.name ?? '—',
        evidence: r.ftNumber,
        action: 'Settle by FT',
        amount: r.transaction?.amount ?? null,
        reason: r.reason,
        makerId: r.maker?.id,
        makerName: r.maker?.name || r.maker?.email || '—',
        createdAt: r.createdAt,
        sections: [
          requestSection(r, 'Settle by FT', [{ label: 'FT number to settle with', value: r.ftNumber, mono: true }]),
          transactionSection(r.transaction),
          merchantSection(r.transaction?.merchant),
        ],
      }))

      const cashbackRows: QueueRow[] = (cashbackRes?.requests ?? []).map((r: any) => ({
        kind: 'CASHBACK' as const,
        id: r.id,
        reference: r.cashbackTransaction?.transactionReference ?? '—',
        merchantName: r.cashbackTransaction?.merchant?.name ?? '—',
        evidence: r.ftNumber || r.newTransactionReference || '—',
        action: CASHBACK_ACTION_LABELS[r.type] ?? r.type,
        amount: r.cashbackTransaction?.cashbackAmount ?? null,
        reason: r.reason,
        makerId: r.maker?.id,
        makerName: r.maker?.name || r.maker?.email || '—',
        createdAt: r.createdAt,
        sections: [
          requestSection(r, CASHBACK_ACTION_LABELS[r.type] ?? r.type, [
            { label: 'FT number', value: r.ftNumber, mono: true },
            { label: 'Old reference', value: r.oldTransactionReference, mono: true },
            { label: 'New reference', value: r.newTransactionReference, mono: true },
          ]),
          cashbackSection(r.cashbackTransaction),
          merchantSection(r.cashbackTransaction?.merchant),
        ],
      }))

      const mpgsRows: QueueRow[] = (mpgsRes?.requests ?? []).map((r: any) => ({
        kind: 'MPGS' as const,
        id: r.id,
        reference: r.transaction?.transactionReference ?? '—',
        merchantName: r.transaction?.merchant?.name ?? '—',
        evidence: 'Gateway check',
        action: 'Re-check with gateway',
        amount: r.transaction?.amount ?? null,
        reason: r.reason,
        makerId: r.maker?.id,
        makerName: r.maker?.name || r.maker?.email || '—',
        createdAt: r.createdAt,
        sections: [
          requestSection(r, 'Re-check with gateway'),
          transactionSection(r.transaction),
          merchantSection(r.transaction?.merchant),
        ],
      }))

      setRows(
        [...paymentRows, ...cashbackRows, ...mpgsRows].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      )
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load the approvals queue.' })
    } finally {
      setIsLoading(false)
    }
  }, [canViewPayments, canViewCashback, canViewMpgs, toast])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (kindFilter === 'ALL' || r.kind === kindFilter) &&
        (!q || [r.reference, r.merchantName, r.evidence, r.makerName].some((v) => v.toLowerCase().includes(q)))
    )
  }, [rows, kindFilter, search])

  const userPermissions = user?.permissions || []
  const exportableRows = visibleRows.filter((r) => userPermissions.includes(EXPORT_PERMISSIONS[r.kind]))
  const canExport = (Object.values(EXPORT_PERMISSIONS) as string[]).some((p) => userPermissions.includes(p))

  const handleExport = () => {
    downloadCsv(
      'reconciliation-approvals',
      ['Type', 'Reference', 'Merchant', 'Action', 'Amount', 'FT / new reference', 'Reason', 'Submitted by', 'Submitted at'],
      exportableRows.map((r) => [
        KIND_LABELS[r.kind],
        r.reference,
        r.merchantName,
        r.action,
        r.amount ?? '',
        r.evidence,
        r.reason,
        r.makerName,
        new Date(r.createdAt).toLocaleString(),
      ])
    )
    const skipped = visibleRows.length - exportableRows.length
    toast({
      title: 'Export complete',
      description: `Exported ${exportableRows.length} requests to CSV.${skipped ? ` ${skipped} skipped — no export permission for their type.` : ''}`,
    })
  }

  const canActOn = (row: QueueRow) => {
    if (row.makerId === user?.id) return false
    if (row.kind === 'PAYMENT') return canManagePayments
    if (row.kind === 'CASHBACK') return canManageCashback
    return canManageMpgs
  }

  const handleReview = async (row: QueueRow, approve: boolean) => {
    setActing(approve ? 'approve' : 'reject')
    try {
      const res = await fetch(ENDPOINTS[row.kind], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: approve ? 'approve_request' : 'reject_request',
          requestId: row.id,
          comments: comments.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok) {
        toast({
          title: approve ? 'Approved' : 'Rejected',
          description: approve
            ? row.kind === 'PAYMENT'
              ? `Payment settled against FT ${row.evidence}. Cashback processing triggered.`
              : row.kind === 'CASHBACK'
                ? 'The cashback request has been executed.'
                : 'The gateway has been re-checked.'
            : 'The request has been rejected.',
        })
        setSelected(null)
        setComments('')
        fetchQueue()
      } else {
        toast({ variant: 'destructive', title: 'Action failed', description: data.error || 'Request failed.' })
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'A technical error occurred.' })
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="space-y-4">
      <FilterToolbar
        search={
          <SearchInput
            placeholder="Search reference, merchant, FT or submitter"
            value={search}
            onChange={setSearch}
          />
        }
        actions={
          <>
            <Button variant="outline" onClick={fetchQueue} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {canExport && (
              <Button variant="outline" onClick={handleExport} disabled={isLoading || exportableRows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            )}
          </>
        }
      >
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as 'ALL' | Kind)}>
          <SelectTrigger>
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {canViewPayments && <SelectItem value="PAYMENT">Payment</SelectItem>}
            {canViewCashback && <SelectItem value="CASHBACK">Cashback</SelectItem>}
            {canViewMpgs && <SelectItem value="MPGS">Card</SelectItem>}
          </SelectContent>
        </Select>
      </FilterToolbar>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Awaiting approval</CardTitle>
          <CardDescription>
            Payment, cashback, and card requests in one queue. You cannot approve a request you
            submitted yourself.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>FT / new reference</TableHead>
                <TableHead>Submitted by</TableHead>
                <TableHead className="text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Nothing awaiting approval.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => (
                  <TableRow key={`${row.kind}-${row.id}`}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.kind === 'PAYMENT'
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : row.kind === 'CASHBACK'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-purple-200 bg-purple-50 text-purple-700'
                        }
                      >
                        {KIND_LABELS[row.kind]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                    <TableCell>{row.merchantName}</TableCell>
                    <TableCell className="text-sm">{row.action}</TableCell>
                    <TableCell className="font-mono text-xs">{row.evidence}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.makerName}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canActOn(row)}
                        title={
                          row.makerId === user?.id
                            ? 'You submitted this request'
                            : undefined
                        }
                        onClick={() => {
                          setSelected(row)
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

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review request</DialogTitle>
            <DialogDescription>
              {selected?.kind === 'PAYMENT'
                ? 'Approving marks the payment successful against this FT and triggers cashback processing.'
                : selected?.kind === 'CASHBACK'
                  ? 'Approving executes this cashback request.'
                  : 'Approving re-checks this transaction with the gateway right now and settles, expires, or closes it based on what it reports.'}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              {selected.sections.map((section) => {
                const fields = section.fields.filter((f) => f.value != null && f.value !== '')
                if (fields.length === 0) return null
                return (
                  <div key={section.title} className="space-y-1">
                    <Label className="text-muted-foreground">{section.title}</Label>
                    <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
                      {fields.map((f) => (
                        <div key={f.label} className="flex justify-between gap-4">
                          <span className="shrink-0 text-muted-foreground">{f.label}</span>
                          <span className={`break-all text-right ${f.mono ? 'font-mono text-xs' : ''}`}>
                            {f.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              <div className="space-y-1">
                <Label className="text-muted-foreground">Maker&apos;s reason</Label>
                <p className="rounded-md border p-3 text-sm">{selected.reason}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="queue-comments">Comments (optional)</Label>
                <Textarea
                  id="queue-comments"
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
              disabled={!!acting}
              onClick={() => selected && handleReview(selected, false)}
            >
              {acting === 'reject' ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Reject
            </Button>
            <Button disabled={!!acting} onClick={() => selected && handleReview(selected, true)}>
              {acting === 'approve' ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
