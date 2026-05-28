'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import {
  Search,
  Filter,
  RefreshCw,
  Download,
  Eye,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  DollarSign,
  Users as UsersIcon,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Activity,
  MoreHorizontal,
  ChevronRight
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type CashbackReconciliationItem = {
  id: string
  merchantId: string
  merchantName: string
  paymentTransactionId: string
  transactionReference: string
  customerPhone: string | null
  customerAccount: string | null
  paymentAmount: number
  cashbackAmount: number
  cashbackPercent: number
  categoryName: string | null
  status: string
  retryCount: number
  failureReason: string | null
  skipReason: string | null
  subsidiaryAccountNumber: string | null
  processedAt: string | null
  createdAt: string
}

type ReconciliationStats = {
  pending: number
  failed: number
  successful: number
  totalAmount: number
  retrySuccessRate: number
  topMerchants: Array<{ name: string; count: number }>
}

function MetricCard({
  title,
  value,
  hint,
  trend,
  icon,
  highlight = false,
}: {
  title: string
  value: string
  hint: string
  trend?: { direction: 'up' | 'down'; label: string }
  icon: React.ReactNode
  highlight?: boolean
}) {
  const TrendIcon = trend?.direction === 'down' ? ArrowDownRight : ArrowUpRight
  const trendColor = trend?.direction === 'down' ? 'text-rose-600' : 'text-emerald-600'

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-[20px] border border-[#F1E7D0] shadow-sm shadow-black/5',
        highlight ? 'card-liquid-honey' : 'card-soft-cream',
        'transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10'
      )}
    >
      <CardHeader className='relative flex flex-row items-start justify-between gap-3 pb-2'>
        <div className='space-y-1'>
          <CardTitle className='text-xs font-semibold tracking-wide text-[#6B7280]'>
            {title}
          </CardTitle>
          <div className='text-2xl font-semibold tracking-tight text-[#1F2937]'>
            {value}
          </div>
        </div>
        <div
          className={cn(
            'rounded-[18px] border p-2 text-[#754319] shadow-sm shadow-black/5',
            highlight
              ? 'border-[#754319]/10 bg-white/70 text-[#4e2a12]'
              : 'border-[#F1E7D0] bg-[#FFFDF7]'
          )}
        >
          {icon}
        </div>
      </CardHeader>
      <CardContent className='relative pt-2'>
        <div className='flex items-center justify-between gap-3'>
          <div className='text-xs text-[#6B7280]'>{hint}</div>
          {trend ? (
            <div className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
              <TrendIcon className='h-3.5 w-3.5' />
              {trend.label}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    PENDING: { label: 'Pending', variant: 'bg-amber-50 text-amber-700 border-amber-200' },
    PROCESSING: { label: 'Processing', variant: 'bg-blue-50 text-blue-700 border-blue-200' },
    COMPLETED: { label: 'Completed', variant: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    FAILED: { label: 'Failed', variant: 'bg-rose-50 text-rose-700 border-rose-200' },
    SKIPPED: { label: 'Skipped', variant: 'bg-slate-50 text-slate-700 border-slate-200' },
    MANUAL_REVIEW: { label: 'Manual Review', variant: 'bg-purple-50 text-purple-700 border-purple-200' },
    RECONCILED: { label: 'Reconciled', variant: 'bg-green-50 text-green-700 border-green-200' }
  }

  const config = statusConfig[status as keyof typeof statusConfig] || { label: status, variant: 'bg-slate-50 text-slate-700' }

  return (
    <Badge variant='secondary' className={cn('rounded-full border', config.variant)}>
      {config.label}
    </Badge>
  )
}

export default function CashbackReconciliationPage() {
  const { data: session } = useSession()
  const [items, setItems] = useState<CashbackReconciliationItem[]>([])
  const [stats, setStats] = useState<ReconciliationStats | null>(null)
  const [allMerchants, setAllMerchants] = useState<{ id: string; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [merchantFilter, setMerchantFilter] = useState<string>('ALL')
  const [selectedItem, setSelectedItem] = useState<CashbackReconciliationItem | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const userPermissions = (session?.user as any)?.permissions || []
  const canView = userPermissions.includes('cashback.reconciliation.view') || (userPermissions.includes('DASHBOARD_VIEW') && userPermissions.includes('CONFIGURATION_MANAGE'))
  const canRetry = userPermissions.includes('cashback.reconciliation.retry') || (userPermissions.includes('DASHBOARD_VIEW') && userPermissions.includes('CONFIGURATION_MANAGE'))
  const canExport = userPermissions.includes('cashback.reconciliation.export') || (userPermissions.includes('DASHBOARD_VIEW') && userPermissions.includes('CONFIGURATION_MANAGE'))
  const canManage = userPermissions.includes('cashback.reconciliation.manage') || (userPermissions.includes('DASHBOARD_VIEW') && userPermissions.includes('CONFIGURATION_MANAGE'))

  // Get merchants for the dropdown from API
  const uniqueMerchants = useMemo(() => {
    return allMerchants.map(m => m.name).sort()
  }, [allMerchants])

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      try {
        const res = await fetch('/api/admin/cashback-reconciliation')
        if (res.ok) {
          const data = await res.json()
          
          // Transform transactions to our item format
          const transformedItems = data.transactions.map((tx: any) => ({
            id: tx.id,
            merchantId: tx.merchantId,
            merchantName: tx.merchant?.name || 'Unknown Merchant',
            paymentTransactionId: tx.paymentTransactionId,
            transactionReference: tx.transactionReference,
            customerPhone: tx.customerPhone,
            customerAccount: tx.customerAccount,
            paymentAmount: tx.paymentAmount,
            cashbackAmount: tx.cashbackAmount,
            cashbackPercent: tx.cashbackPercent,
            categoryName: tx.category?.name,
            status: tx.status,
            retryCount: tx.retryCount || 0,
            failureReason: tx.failureReason,
            skipReason: tx.skipReason,
            subsidiaryAccountNumber: tx.subsidiaryAccountNumber,
            processedAt: tx.processedAt,
            createdAt: tx.createdAt
          }))

          setItems(transformedItems)
          setStats(data.stats)
          setAllMerchants(data.merchants || [])
        }
      } catch (error) {
        console.error('Failed to fetch cashback reconciliation data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  const filteredItems = useMemo(() => {
    let filtered = [...items]
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(item => 
        item.transactionReference.toLowerCase().includes(q) ||
        item.merchantName.toLowerCase().includes(q) ||
        (item.customerPhone && item.customerPhone.includes(q)) ||
        (item.customerAccount && item.customerAccount.includes(q))
      )
    }

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(item => item.status === statusFilter)
    }

    if (merchantFilter !== 'ALL') {
      filtered = filtered.filter(item => item.merchantName === merchantFilter)
    }

    return filtered
  }, [items, searchQuery, statusFilter, merchantFilter])

  const handleViewDetails = (item: CashbackReconciliationItem) => {
    setSelectedItem(item)
    setIsSheetOpen(true)
  }

  const handleRetry = (item: CashbackReconciliationItem) => {
    // In real implementation, call API to retry
    console.log('Retrying cashback:', item.id)
  }

  const handleMarkReconciled = (item: CashbackReconciliationItem) => {
    // In real implementation, call API to mark as reconciled
    console.log('Marking as reconciled:', item.id)
  }

  if (!canView) {
    return (
      <div className='flex h-[50vh] items-center justify-center'>
        <div className='text-center'>
          <AlertCircle className='mx-auto h-12 w-12 text-amber-500' />
          <h3 className='mt-4 text-lg font-semibold text-slate-900'>Permission Required</h3>
          <p className='mt-2 text-sm text-slate-600'>You don&apos;t have access to cashback reconciliation.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className='space-y-6 bg-white'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight text-[#1F2937]'>Cashback Reconciliation</h1>
            <p className='text-sm text-[#6B7280] mt-1'>Monitor, recover, and reconcile cashback transactions</p>
          </div>
          {merchantFilter !== 'ALL' && (
            <div className='px-4 py-2 rounded-[18px] border border-[#F1E7D0] bg-[#FFFDF7]'>
              <div className='text-xs font-semibold text-[#6B7280] uppercase tracking-wide'>Selected Merchant</div>
              <div className='text-sm font-semibold text-[#1F2937]'>{merchantFilter}</div>
            </div>
          )}
        </div>

        {/* Dashboard Metrics */}
        {stats && (
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <MetricCard
              title='Pending Reconciliations'
              value={stats.pending.toString()}
              hint='Awaiting processing'
              icon={<Clock className='h-4 w-4' />}
            />
            <MetricCard
              title='Failed Cashbacks'
              value={stats.failed.toString()}
              hint='Need attention'
              icon={<XCircle className='h-4 w-4' />}
              highlight
            />
            <MetricCard
              title='Successful Cashbacks'
              value={stats.successful.toString()}
              hint='All time'
              trend={{ direction: 'up', label: '+12.5%' }}
              icon={<CheckCircle2 className='h-4 w-4' />}
            />
            <MetricCard
              title='Total Cashback Amount'
              value={`${stats.totalAmount.toLocaleString()} ETB`}
              hint='Distributed to customers'
              icon={<DollarSign className='h-4 w-4' />}
            />
          </div>
        )}

        {/* Filters and Search */}
        <Card className='card-soft-cream rounded-[20px]'>
          <CardContent className='p-6'>
            <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
              <div className='flex flex-wrap items-center gap-3'>
                <div className='relative flex-1 max-w-md'>
                  <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]' />
                  <Input
                    placeholder='Search by reference, merchant, phone, or account...'
                    className='h-10 rounded-[18px] border-[#F1E7D0] bg-[#FFFDF7] pl-10'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={merchantFilter} onValueChange={setMerchantFilter}>
                  <SelectTrigger className='h-10 w-48 rounded-[18px] border-[#F1E7D0] bg-[#FFFDF7]'>
                    <div className='flex items-center gap-2'>
                      <UsersIcon className='h-4 w-4' />
                      <SelectValue placeholder='Merchant' />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>All Merchants</SelectItem>
                    {uniqueMerchants.map((merchant) => (
                      <SelectItem key={merchant} value={merchant}>{merchant}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className='h-10 w-40 rounded-[18px] border-[#F1E7D0] bg-[#FFFDF7]'>
                    <div className='flex items-center gap-2'>
                      <Filter className='h-4 w-4' />
                      <SelectValue placeholder='Status' />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>All Status</SelectItem>
                    <SelectItem value='PENDING'>Pending</SelectItem>
                    <SelectItem value='PROCESSING'>Processing</SelectItem>
                    <SelectItem value='COMPLETED'>Completed</SelectItem>
                    <SelectItem value='FAILED'>Failed</SelectItem>
                    <SelectItem value='MANUAL_REVIEW'>Manual Review</SelectItem>
                    <SelectItem value='RECONCILED'>Reconciled</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-10 rounded-[18px] border-[#F1E7D0] bg-[#FFFDF7]'
                  onClick={() => {
                    setSearchQuery('')
                    setStatusFilter('ALL')
                    setMerchantFilter('ALL')
                  }}
                >
                  <RefreshCw className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reconciliation Table */}
        <Card className='card-soft-cream rounded-[20px]'>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <div>
                <CardTitle className='text-base tracking-tight'>Reconciliation Queue</CardTitle>
                <CardDescription className='text-[#6B7280]'>
                  {filteredItems.length} items found
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className='flex h-64 items-center justify-center'>
                <RefreshCw className='h-8 w-8 animate-spin text-[#f8b513]' />
              </div>
            ) : (
              <div className='rounded-[18px] border border-[#F1E7D0] overflow-hidden'>
                <Table>
                  <TableHeader className='bg-[#FFFDF7]'>
                    <TableRow>
                      <TableHead className='text-xs font-semibold'>Transaction Ref</TableHead>
                      <TableHead className='text-xs font-semibold'>Merchant</TableHead>
                      <TableHead className='text-xs font-semibold'>Customer</TableHead>
                      <TableHead className='text-xs font-semibold text-right'>Payment</TableHead>
                      <TableHead className='text-xs font-semibold text-right'>Cashback</TableHead>
                      <TableHead className='text-xs font-semibold'>Status</TableHead>
                      <TableHead className='text-xs font-semibold'>Retries</TableHead>
                      <TableHead className='text-xs font-semibold text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => (
                      <TableRow key={item.id} className='hover:bg-amber-50/30 transition-colors'>
                        <TableCell className='font-mono text-xs'>{item.transactionReference}</TableCell>
                        <TableCell className='text-sm font-medium'>{item.merchantName}</TableCell>
                        <TableCell className='text-xs text-slate-600'>
                          {item.customerPhone || item.customerAccount || '-'}
                        </TableCell>
                        <TableCell className='text-sm font-medium text-right'>
                          {item.paymentAmount.toLocaleString()} ETB
                        </TableCell>
                        <TableCell className='text-sm font-medium text-right text-[#f8b513]'>
                          {item.cashbackAmount.toLocaleString()} ETB
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell>
                          {item.retryCount > 0 ? (
                            <Badge variant='secondary' className='rounded-full bg-slate-100 text-slate-700'>
                              {item.retryCount}
                            </Badge>
                          ) : (
                            <span className='text-xs text-slate-400'>-</span>
                          )}
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='flex items-center justify-end gap-2'>
                            <Button
                              variant='ghost'
                              size='sm'
                              className='h-8 rounded-[16px]'
                              onClick={() => handleViewDetails(item)}
                            >
                              <Eye className='h-4 w-4' />
                            </Button>
                            {canRetry && (item.status === 'FAILED' || item.status === 'PENDING') && (
                              <Button
                                variant='ghost'
                                size='sm'
                                className='h-8 rounded-[16px] text-[#f8b513]'
                                onClick={() => handleRetry(item)}
                              >
                                <RotateCcw className='h-4 w-4' />
                              </Button>
                            )}
                            {canManage && (
                              <Button
                                variant='ghost'
                                size='sm'
                                className='h-8 rounded-[16px] text-emerald-600'
                                onClick={() => handleMarkReconciled(item)}
                              >
                                <CheckCircle2 className='h-4 w-4' />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className='h-32 text-center text-sm text-slate-500'>
                          No cashback transactions found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Sheet */}
      {selectedItem && (
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent className='w-full sm:max-w-2xl'>
            <SheetHeader>
              <SheetTitle>Cashback Transaction Details</SheetTitle>
              <SheetDescription>
                Complete lifecycle view and processing history
              </SheetDescription>
            </SheetHeader>
            <div className='mt-6 space-y-6'>
              {/* Core Info */}
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Transaction Ref</div>
                  <div className='mt-1 font-mono text-sm'>{selectedItem.transactionReference}</div>
                </div>
                <div>
                  <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Merchant</div>
                  <div className='mt-1 text-sm font-medium'>{selectedItem.merchantName}</div>
                </div>
                <div>
                  <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Payment Amount</div>
                  <div className='mt-1 text-sm font-medium'>{selectedItem.paymentAmount.toLocaleString()} ETB</div>
                </div>
                <div>
                  <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Cashback Amount</div>
                  <div className='mt-1 text-sm font-medium text-[#f8b513]'>{selectedItem.cashbackAmount.toLocaleString()} ETB</div>
                </div>
              </div>

              {/* Status and History */}
              <div>
                <div className='flex items-center justify-between'>
                  <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Current Status</div>
                  <StatusBadge status={selectedItem.status} />
                </div>
                {selectedItem.failureReason && (
                  <div className='mt-3 rounded-[18px] border border-rose-200 bg-rose-50 p-4'>
                    <div className='flex items-start gap-3'>
                      <AlertCircle className='mt-0.5 h-5 w-5 text-rose-600' />
                      <div>
                        <div className='text-sm font-semibold text-rose-900'>Failure Reason</div>
                        <div className='mt-1 text-sm text-rose-700'>{selectedItem.failureReason}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Processing Timeline */}
              <div>
                <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3'>Processing Timeline</div>
                <div className='space-y-3'>
                  <div className='flex gap-3'>
                    <div className='mt-1 w-2 h-2 rounded-full bg-emerald-500' />
                    <div className='flex-1'>
                      <div className='text-sm font-medium'>Transaction Created</div>
                      <div className='text-xs text-slate-500'>{new Date(selectedItem.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                  {selectedItem.processedAt && (
                    <div className='flex gap-3'>
                      <div className='mt-1 w-2 h-2 rounded-full bg-blue-500' />
                      <div className='flex-1'>
                        <div className='text-sm font-medium'>Processed</div>
                        <div className='text-xs text-slate-500'>{new Date(selectedItem.processedAt).toLocaleString()}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Technical Details */}
              <div className='rounded-[18px] border border-[#F1E7D0] bg-[#FFFDF7] p-4'>
                <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3'>Technical Details</div>
                <div className='grid grid-cols-2 gap-3 text-xs'>
                  <div>
                    <div className='text-slate-500'>Cashback ID</div>
                    <div className='font-mono mt-0.5'>{selectedItem.id}</div>
                  </div>
                  <div>
                    <div className='text-slate-500'>Payment TX ID</div>
                    <div className='font-mono mt-0.5'>{selectedItem.paymentTransactionId}</div>
                  </div>
                  {selectedItem.subsidiaryAccountNumber && (
                    <div>
                      <div className='text-slate-500'>Subsidiary Account</div>
                      <div className='font-mono mt-0.5'>{selectedItem.subsidiaryAccountNumber}</div>
                    </div>
                  )}
                  {selectedItem.categoryName && (
                    <div>
                      <div className='text-slate-500'>Category</div>
                      <div className='mt-0.5'>{selectedItem.categoryName}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className='flex gap-3 pt-4 border-t border-[#F1E7D0]'>
                {canRetry && (selectedItem.status === 'FAILED' || selectedItem.status === 'PENDING') && (
                  <Button
                    className='flex-1 rounded-[18px]'
                    onClick={() => {
                      handleRetry(selectedItem)
                      setIsSheetOpen(false)
                    }}
                  >
                    <RotateCcw className='mr-2 h-4 w-4' />
                    Retry Processing
                  </Button>
                )}
                {canManage && (
                  <Button
                    variant='outline'
                    className='flex-1 rounded-[18px] border-[#F1E7D0]'
                    onClick={() => {
                      handleMarkReconciled(selectedItem)
                      setIsSheetOpen(false)
                    }}
                  >
                    <CheckCircle2 className='mr-2 h-4 w-4' />
                    Mark Reconciled
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
