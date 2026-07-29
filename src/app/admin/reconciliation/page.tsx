'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PaymentReconciliationTab } from '@/components/reconciliation/payment-reconciliation-tab'
import { CashbackReconciliationTab } from '@/components/reconciliation/cashback-reconciliation-tab'
import { ApprovalsQueue } from '@/components/reconciliation/approvals-queue'

/**
 * Unified reconciliation console.
 *
 * Payments and cashback are two repair points on one pipeline — a payment has
 * to be settled before its cashback can run — so they live behind one entry
 * point, with a single approvals inbox spanning both.
 *
 * Tabs are gated on the permissions the user actually holds.
 */
export default function ReconciliationPage() {
  const { user } = useAuth()

  const isAdmin = user?.role === 'ADMIN'
  const permissions = useMemo(() => user?.permissions || [], [user])

  const canViewPayments = isAdmin || permissions.includes('payment.reconciliation.view')
  const canViewCashback = isAdmin || permissions.includes('cashback.reconciliation.view')
  const canManagePayments = isAdmin || permissions.includes('payment.reconciliation.manage')
  const canManageCashback = isAdmin || permissions.includes('cashback.reconciliation.manage')

  const canApproveAnything = canManagePayments || canManageCashback

  const defaultTab = canViewPayments ? 'payments' : canViewCashback ? 'cashback' : 'approvals'
  const [tab, setTab] = useState(defaultTab)

  useEffect(() => {
    setTab(defaultTab)
  }, [defaultTab])

  if (!canViewPayments && !canViewCashback) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            You do not have permission to view reconciliation.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1F2937]">Reconciliation</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Recover payments and cashbacks whose records disagree with the bank, using the FT from
          the internal receipt.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {canViewPayments && <TabsTrigger value="payments">Payments</TabsTrigger>}
          {canViewCashback && <TabsTrigger value="cashback">Cashback</TabsTrigger>}
          {canApproveAnything && <TabsTrigger value="approvals">Approvals</TabsTrigger>}
        </TabsList>

        {canViewPayments && (
          <TabsContent value="payments" className="mt-4">
            <PaymentReconciliationTab embedded />
          </TabsContent>
        )}

        {canViewCashback && (
          <TabsContent value="cashback" className="mt-4">
            <CashbackReconciliationTab embedded />
          </TabsContent>
        )}

        {canApproveAnything && (
          <TabsContent value="approvals" className="mt-4">
            <ApprovalsQueue
              canManagePayments={canManagePayments}
              canManageCashback={canManageCashback}
              canViewPayments={canViewPayments}
              canViewCashback={canViewCashback}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
