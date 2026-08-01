'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { CheckCircle2, XCircle, RefreshCw, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

/**
 * One inbox for everything awaiting a checker, across both payment and cashback
 * reconciliation. A checker cares about what needs deciding, not which subsystem
 * it came from — so both request types are listed together and each row routes
 * its approve/reject to the endpoint that owns it.
 */

type Kind = 'PAYMENT' | 'CASHBACK'

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
}

const ENDPOINTS: Record<Kind, string> = {
  PAYMENT: '/api/admin/payment-reconciliation',
  CASHBACK: '/api/admin/cashback-reconciliation',
}

const CASHBACK_ACTION_LABELS: Record<string, string> = {
  RETRY: 'Retry transfer',
  REFERENCE_UPDATE: 'Update reference',
  MANUAL_SETTLE: 'Settle by FT',
}

export function ApprovalsQueue({
  canManagePayments,
  canManageCashback,
  canViewPayments,
  canViewCashback,
}: {
  canManagePayments: boolean
  canManageCashback: boolean
  canViewPayments: boolean
  canViewCashback: boolean
}) {
  const { user } = useAuth()
  const { toast } = useToast()

  const [rows, setRows] = useState<QueueRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<QueueRow | null>(null)
  const [comments, setComments] = useState('')
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null)

  const fetchQueue = useCallback(async () => {
    setIsLoading(true)
    try {
      const [paymentRes, cashbackRes] = await Promise.all([
        canViewPayments
          ? fetch('/api/admin/payment-reconciliation?limit=1').then((r) => (r.ok ? r.json() : null))
          : Promise.resolve(null),
        canViewCashback
          ? fetch('/api/admin/cashback-reconciliation?limit=1').then((r) => (r.ok ? r.json() : null))
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
      }))

      setRows(
        [...paymentRows, ...cashbackRows].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      )
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load the approvals queue.' })
    } finally {
      setIsLoading(false)
    }
  }, [canViewPayments, canViewCashback, toast])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  const canActOn = (row: QueueRow) => {
    if (row.makerId === user?.id) return false
    return row.kind === 'PAYMENT' ? canManagePayments : canManageCashback
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
              : 'The cashback request has been executed.'
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
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Awaiting approval</CardTitle>
            <CardDescription>
              Payment and cashback requests in one queue. You cannot approve a request you
              submitted yourself.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchQueue} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
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
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Nothing awaiting approval.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={`${row.kind}-${row.id}`}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.kind === 'PAYMENT'
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        }
                      >
                        {row.kind === 'PAYMENT' ? 'Payment' : 'Cashback'}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review request</DialogTitle>
            <DialogDescription>
              {selected?.kind === 'PAYMENT'
                ? 'Approving marks the payment successful against this FT and triggers cashback processing.'
                : 'Approving executes this cashback request.'}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono text-xs">{selected.reference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Action</span>
                  <span>{selected.action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">FT / new reference</span>
                  <span className="font-mono text-xs">{selected.evidence}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Submitted by</span>
                  <span>{selected.makerName}</span>
                </div>
              </div>

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
    </>
  )
}
