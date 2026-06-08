'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit3,
  Send
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { downloadCsv } from '@/lib/export-csv'

type CashbackReconciliationItem = {
  id: string
  merchantId: string
  merchantName: string
  merchantAccountNumber: string | null
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
  requests?: any[]
}

type ReconciliationStats = {
  pending: number
  failed: number
  successful: number
  totalAmount: number
  retrySuccessRate: number
  topMerchants: Array<{ name: string; count: number }>
}

type CashbackRequest = {
  id: string
  type: string
  cashbackTransactionId: string
  cashbackTransaction: {
    merchant: { name: string }
    transactionReference: string
    cashbackAmount: number
    customerPhone: string | null
    customerAccount: string | null
  }
  oldTransactionReference: string | null
  newTransactionReference: string | null
  reason: string
  comments: string | null
  status: string
  maker: { id: string; name: string | null; email: string | null }
  checker: { id: string; name: string | null; email: string | null } | null
  checkedAt: string | null
  createdAt: string
  updatedAt: string
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

function RequestStatusBadge({ status }: { status: string }) {
  const statusConfig = {
    PENDING: { label: 'Pending', variant: 'bg-amber-50 text-amber-700 border-amber-200' },
    APPROVED: { label: 'Approved', variant: 'bg-blue-50 text-blue-700 border-blue-200' },
    REJECTED: { label: 'Rejected', variant: 'bg-rose-50 text-rose-700 border-rose-200' },
    EXECUTED: { label: 'Executed', variant: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
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
  const [requests, setRequests] = useState<CashbackRequest[]>([])
  const [stats, setStats] = useState<ReconciliationStats | null>(null)
  const [allMerchants, setAllMerchants] = useState<{ id: string; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [merchantFilter, setMerchantFilter] = useState<string>('ALL')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const hadSearchFocusRef = useRef(false)
  const [selectedItem, setSelectedItem] = useState<CashbackReconciliationItem | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false)
  const [requestType, setRequestType] = useState<'REFERENCE_UPDATE' | 'RETRY'>('RETRY')
  const [newTransactionReference, setNewTransactionReference] = useState('')
  const [requestReason, setRequestReason] = useState('')
  const [requestComments, setRequestComments] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null)
  const [isRequestDetailOpen, setIsRequestDetailOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<CashbackRequest | null>(null)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  const { toast } = useToast()

  const userRole = (session?.user as any)?.role
  const userPermissions = (session?.user as any)?.permissions || []
  const canView = userRole === 'ADMIN' || userPermissions.includes('cashback.reconciliation.view')
  const canRetry = userRole === 'ADMIN' || userPermissions.includes('cashback.reconciliation.retry')
  const canExport = userRole === 'ADMIN' || userPermissions.includes('cashback.reconciliation.export')
  const canManage = userRole === 'ADMIN' || userPermissions.includes('cashback.reconciliation.manage')

  // Get merchants for the dropdown from API
  const uniqueMerchants = allMerchants.map(m => m.name).sort()

  const fetchData = async () => {
    // Track if search input had focus before we start loading
    hadSearchFocusRef.current = 
      document.activeElement === searchInputRef.current
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())
      if (debouncedSearchQuery) params.set('search', debouncedSearchQuery)
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter)
      if (merchantFilter && merchantFilter !== 'ALL') params.set('merchantName', merchantFilter)
      
      const res = await fetch(`/api/admin/cashback-reconciliation?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        
        // Transform transactions to our item format
        const transformedItems = data.transactions.map((tx: any) => ({
          id: tx.id,
          merchantId: tx.merchantId,
          merchantName: tx.merchant?.name || 'Unknown Merchant',
          merchantAccountNumber: tx.merchant?.accountNumber || null,
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
          createdAt: tx.createdAt,
          requests: tx.requests
        }))

        setItems(transformedItems)
        setRequests(data.requests || [])
        setStats(data.stats)
        setAllMerchants(data.merchants || [])
        setTotal(data.total)
        setTotalPages(data.totalPages)
      }
    } catch (error) {
      console.error('Failed to fetch cashback reconciliation data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchQuery, statusFilter, merchantFilter, itemsPerPage])

  useEffect(() => {
    fetchData()
  }, [currentPage, debouncedSearchQuery, statusFilter, merchantFilter, itemsPerPage])

  // Restore focus to search input after load if it had it before
  useEffect(() => {
    if (!isLoading && hadSearchFocusRef.current && searchInputRef.current) {
      searchInputRef.current.focus()
      // Also restore cursor position
      const end = searchQuery.length
      searchInputRef.current.setSelectionRange(end, end)
    }
  }, [isLoading, searchQuery])

  const handleExport = (tab: 'transactions' | 'requests') => {
    if (tab === 'transactions') {
      downloadCsv('cashback-transactions', [
        'Transaction Ref', 'Merchant', 'Merchant Account', 'Customer', 'Payment Amount (ETB)', 'Cashback Amount (ETB)', 'Category', 'Status', 'Created At'
      ], items.map(i => [
        i.transactionReference,
        i.merchantName,
        i.merchantAccountNumber || '',
        i.customerPhone || i.customerAccount || '',
        i.paymentAmount,
        i.cashbackAmount,
        i.categoryName || '',
        i.status,
        new Date(i.createdAt).toLocaleString()
      ]))
    } else {
      downloadCsv('cashback-requests', [
        'Type', 'Transaction Ref', 'Merchant', 'Customer', 'Cashback Amount (ETB)', 'Reason', 'Created By', 'Status', 'Created At'
      ], requests.map(r => [
        r.type === 'REFERENCE_UPDATE' ? 'Update Reference' : 'Retry',
        r.cashbackTransaction?.transactionReference || '',
        r.cashbackTransaction?.merchant?.name || '',
        r.cashbackTransaction?.customerPhone || r.cashbackTransaction?.customerAccount || '',
        r.cashbackTransaction?.cashbackAmount || '',
        r.reason,
        r.maker?.name || r.maker?.email || '',
        r.status,
        new Date(r.createdAt).toLocaleString()
      ]))
    }
    toast({ title: 'Export Complete', description: `Exported to CSV successfully` })
  }

  const handleViewDetails = (item: CashbackReconciliationItem) => {
    setSelectedItem(item)
    setIsSheetOpen(true)
  }

  const handleViewRequestDetails = (request: CashbackRequest) => {
    setSelectedRequest(request)
    setIsRequestDetailOpen(true)
  }

  const handleCreateRequest = async () => {
    if (!selectedItem || !requestReason) return
    
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/admin/cashback-reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_request',
          type: requestType,
          cashbackTransactionId: selectedItem.id,
          newTransactionReference: requestType === 'REFERENCE_UPDATE' ? newTransactionReference : null,
          reason: requestReason
        })
      })

      if (res.ok) {
        setIsRequestDialogOpen(false)
        setIsSheetOpen(false) // Close the detail sheet as well
        setRequestType('RETRY')
        setNewTransactionReference('')
        setRequestReason('')
        
        toast({
          title: "Request Submitted",
          description: "Your request has been sent for approval.",
        })
        
        fetchData()
      } else {
        const error = await res.json()
        toast({
          variant: "destructive",
          title: "Request Failed",
          description: error.error || "Failed to submit request",
        })
      }
    } catch (error) {
      console.error('Failed to create request:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "A technical error occurred.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApproveRequest = async (request: CashbackRequest) => {
    setApprovingRequestId(request.id)
    try {
      const res = await fetch('/api/admin/cashback-reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve_request',
          requestId: request.id,
          comments: requestComments
        })
      })

      if (res.ok) {
        setRequestComments('')
        setIsRequestDetailOpen(false)
        toast({
          title: "Request Approved",
          description: "The transaction has been processed successfully.",
        })
        fetchData()
      } else {
        const error = await res.json()
        toast({
          variant: "destructive",
          title: "Approval Failed",
          description: error.error || "Failed to approve request",
        })
      }
    } catch (error) {
      console.error('Failed to approve request:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "A technical error occurred during approval.",
      })
    } finally {
      setApprovingRequestId(null)
    }
  }

  const handleRejectRequest = async (request: CashbackRequest) => {
    setApprovingRequestId(request.id)
    try {
      const res = await fetch('/api/admin/cashback-reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reject_request',
          requestId: request.id,
          comments: requestComments
        })
      })

      if (res.ok) {
        setRequestComments('')
        setIsRequestDetailOpen(false)
        toast({
          title: "Request Rejected",
          description: "The request has been rejected.",
        })
        fetchData()
      } else {
        const error = await res.json()
        toast({
          variant: "destructive",
          title: "Rejection Failed",
          description: error.error || "Failed to reject request",
        })
      }
    } catch (error) {
      console.error('Failed to reject request:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "A technical error occurred during rejection.",
      })
    } finally {
      setApprovingRequestId(null)
    }
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

        <Tabs defaultValue="transactions">
          <TabsList>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="requests">Pending Requests ({requests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions">
            {/* Dashboard Metrics */}
            {stats && (
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4'>
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
            <Card className='card-soft-cream rounded-[20px] mt-4'>
              <CardContent className='p-6'>
                <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                  <div className='flex flex-wrap items-center gap-3'>
                    <div className='relative flex-1 max-w-md'>
                      <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]' />
                      <Input
                        ref={searchInputRef}
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
                    <Select 
                      value={String(itemsPerPage)} 
                      onValueChange={(val) => {
                        setItemsPerPage(Number(val))
                      }}
                    >
                      <SelectTrigger className='h-10 w-24 rounded-[18px] border-[#F1E7D0] bg-[#FFFDF7]'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-10 rounded-[18px] border-[#F1E7D0] bg-[#FFFDF7]'
                      onClick={fetchData}
                    >
                      <RefreshCw className='h-4 w-4' />
                    </Button>
                    {canExport && (
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-10 rounded-[18px] border-[#F1E7D0] bg-[#FFFDF7]'
                        onClick={() => handleExport('transactions')}
                      >
                        <Download className='h-4 w-4 mr-2' />
                        Export
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Reconciliation Table */}
            <Card className='card-soft-cream rounded-[20px] mt-4'>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <div>
                    <CardTitle className='text-base tracking-tight'>Reconciliation Queue</CardTitle>
                    <CardDescription className='text-[#6B7280]'>
                      {total} items found
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className='flex h-64 items-center justify-center'>
                    <RefreshCw className='h-8 w-8 animate-spin text-[#f8b513]' />
                  </div>
                ) : (
                  <>
                    <div className='rounded-[18px] border border-[#F1E7D0] overflow-hidden'>
                      <Table>
                        <TableHeader className='bg-[#FFFDF7]'>
                          <TableRow>
                            <TableHead className='text-xs font-semibold'>Transaction Ref</TableHead>
                            <TableHead className='text-xs font-semibold'>Merchant</TableHead>
                            <TableHead className='text-xs font-semibold'>Merchant Account</TableHead>
                            <TableHead className='text-xs font-semibold'>Customer</TableHead>
                            <TableHead className='text-xs font-semibold text-right'>Payment</TableHead>
                            <TableHead className='text-xs font-semibold text-right'>Cashback</TableHead>
                            <TableHead className='text-xs font-semibold'>Status</TableHead>
                            <TableHead className='text-xs font-semibold'>Requests</TableHead>
                            <TableHead className='text-xs font-semibold text-right'>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item) => (
                            <TableRow key={item.id} className='hover:bg-amber-50/30 transition-colors'>
                              <TableCell className='font-mono text-xs'>{item.transactionReference}</TableCell>
                              <TableCell className='text-sm font-medium'>{item.merchantName}</TableCell>
                              <TableCell className='font-mono text-xs text-slate-600'>{item.merchantAccountNumber || '-'}</TableCell>
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
                                {item.requests && item.requests.length > 0 ? (
                                  <div className='flex items-center gap-1'>
                                    {item.requests.slice(0, 2).map((req, i) => (
                                      <RequestStatusBadge key={i} status={req.status} />
                                    ))}
                                    {item.requests.length > 2 && (
                                      <span className='text-xs text-slate-500'>+{item.requests.length - 2}</span>
                                    )}
                                  </div>
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
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {items.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={9} className='h-32 text-center text-sm text-slate-500'>
                                No cashback transactions found
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-6 py-4 border-t border-[#F1E7D0] bg-amber-50/20">
                        <div className="text-xs font-medium text-[#6B7280]">
                          Showing <span className="text-[#1F2937] font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-[#1F2937] font-bold">{Math.min(currentPage * itemsPerPage, total)}</span> of <span className="text-[#1F2937] font-bold">{total}</span> results
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-xl border-[#F1E7D0] bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                          >
                            <ChevronsLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-xl border-[#F1E7D0] bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </Button>
                          
                          <div className="flex items-center gap-1 mx-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let pageNum = currentPage;
                              if (totalPages <= 5) pageNum = i + 1;
                              else if (currentPage <= 3) pageNum = i + 1;
                              else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                              else pageNum = currentPage - 2 + i;

                              return (
                                <Button
                                  key={pageNum}
                                  variant={currentPage === pageNum ? "default" : "outline"}
                                  size="sm"
                                  className={`h-8 min-w-[32px] rounded-2xl border-[#F1E7D0] text-xs font-bold transition-all ${
                                    currentPage === pageNum 
                                      ? "bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white border-white/30 shadow-sm shadow-amber-950/15" 
                                      : "bg-white text-slate-600 hover:bg-amber-50/50"
                                  }`}
                                  onClick={() => setCurrentPage(pageNum)}
                                >
                                  {pageNum}
                                </Button>
                              );
                            })}
                          </div>

                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-xl border-[#F1E7D0] bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-xl border-[#F1E7D0] bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronsRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests">
            {/* Requests List */}
            <Card className='card-soft-cream rounded-[20px] mt-4'>
              <CardHeader>
                <div className='flex items-center justify-between'>
                  <div>
                    <CardTitle className='text-base tracking-tight'>Pending Requests</CardTitle>
                    <CardDescription className='text-[#6B7280]'>
                      {requests.length} requests waiting for approval
                    </CardDescription>
                  </div>
                  {canExport && (
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-10 rounded-[18px] border-[#F1E7D0] bg-[#FFFDF7]'
                      onClick={() => handleExport('requests')}
                    >
                      <Download className='h-4 w-4 mr-2' />
                      Export
                    </Button>
                  )}
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
                          <TableHead className='text-xs font-semibold'>Type</TableHead>
                          <TableHead className='text-xs font-semibold'>Transaction Ref</TableHead>
                          <TableHead className='text-xs font-semibold'>Merchant</TableHead>
                          <TableHead className='text-xs font-semibold'>Customer</TableHead>
                          <TableHead className='text-xs font-semibold text-right'>Amount</TableHead>
                          <TableHead className='text-xs font-semibold'>Created By</TableHead>
                          <TableHead className='text-xs font-semibold'>Reason</TableHead>
                          <TableHead className='text-xs font-semibold'>Status</TableHead>
                          <TableHead className='text-xs font-semibold text-right'>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requests.map((request) => (
                          <TableRow key={request.id} className='hover:bg-amber-50/30 transition-colors'>
                            <TableCell className='text-sm font-medium'>
                              {request.type === 'REFERENCE_UPDATE' ? 'Update Ref' : 'Retry'}
                            </TableCell>
                            <TableCell className='font-mono text-xs'>
                              {request.cashbackTransaction.transactionReference}
                            </TableCell>
                            <TableCell className='text-sm font-medium'>
                              {request.cashbackTransaction.merchant.name}
                            </TableCell>
                            <TableCell className='text-xs text-slate-600'>
                              {request.cashbackTransaction.customerPhone || request.cashbackTransaction.customerAccount || '-'}
                            </TableCell>
                            <TableCell className='text-sm font-medium text-right text-[#f8b513]'>
                              {request.cashbackTransaction.cashbackAmount.toLocaleString()} ETB
                            </TableCell>
                            <TableCell className='text-xs text-slate-600'>
                              {request.maker.name || request.maker.email}
                            </TableCell>
                            <TableCell className='text-xs text-slate-600 max-w-[200px] truncate'>
                              {request.reason}
                            </TableCell>
                            <TableCell>
                              <RequestStatusBadge status={request.status} />
                            </TableCell>
                            <TableCell className='text-right'>
                              <div className='flex items-center justify-end gap-2'>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  className='h-8 rounded-[16px]'
                                  onClick={() => handleViewRequestDetails(request)}
                                >
                                  <Eye className='h-4 w-4' />
                                </Button>
                                {canManage && (session?.user as any)?.id !== request.maker.id && (
                                  <>
                                    <Button
                                      variant='ghost'
                                      size='sm'
                                      className='h-8 rounded-[16px] text-emerald-600'
                                      onClick={() => handleApproveRequest(request)}
                                      disabled={approvingRequestId === request.id}
                                    >
                                      {approvingRequestId === request.id ? (
                                        <RefreshCw className='h-4 w-4 animate-spin' />
                                      ) : (
                                        <CheckCircle2 className='h-4 w-4' />
                                      )}
                                    </Button>
                                    <Button
                                      variant='ghost'
                                      size='sm'
                                      className='h-8 rounded-[16px] text-rose-600'
                                      onClick={() => handleRejectRequest(request)}
                                      disabled={approvingRequestId === request.id}
                                    >
                                      {approvingRequestId === request.id ? (
                                        <RefreshCw className='h-4 w-4 animate-spin' />
                                      ) : (
                                        <XCircle className='h-4 w-4' />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {requests.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={9} className='h-32 text-center text-sm text-slate-500'>
                              No pending requests
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Dialog */}
      {selectedItem && (
        <Dialog open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <DialogContent className='max-w-2xl rounded-[20px] max-h-[90vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle>Cashback Transaction Details</DialogTitle>
              <DialogDescription>
                Complete lifecycle view and processing history
              </DialogDescription>
            </DialogHeader>
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
                  {selectedItem.merchantAccountNumber && (
                    <div className='mt-0.5 font-mono text-xs text-slate-500'>{selectedItem.merchantAccountNumber}</div>
                  )}
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

              {/* Requests History */}
              {selectedItem.requests && selectedItem.requests.length > 0 && (
                <div>
                  <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3'>Request History</div>
                  <div className='space-y-3'>
                    {selectedItem.requests.map((req, i) => (
                      <div key={i} className='rounded-[18px] border border-[#F1E7D0] bg-[#FFFDF7] p-4'>
                        <div className='flex items-center justify-between mb-2'>
                          <div className='text-sm font-medium'>
                            {req.type === 'REFERENCE_UPDATE' ? 'Update Reference' : 'Retry'}
                          </div>
                          <RequestStatusBadge status={req.status} />
                        </div>
                        <div className='text-xs text-slate-600 space-y-1'>
                          <div><span className='font-semibold'>Reason:</span> {req.reason}</div>
                          <div><span className='font-semibold'>Created by:</span> {req.maker.name || req.maker.email}</div>
                          {req.comments && <div><span className='font-semibold'>Comments:</span> {req.comments}</div>}
                          {req.checker && <div><span className='font-semibold'>Reviewed by:</span> {req.checker.name || req.checker.email}</div>}
                          {req.type === 'REFERENCE_UPDATE' && (
                            <div className='font-mono'>
                              <span className='text-rose-600'>{req.oldTransactionReference}</span>
                              <span className='mx-2'>→</span>
                              <span className='text-emerald-600'>{req.newTransactionReference}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                {canRetry && selectedItem.status === 'FAILED' && (
                  <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        className='flex-1 rounded-[18px]'
                        onClick={() => {
                          setSelectedItem(selectedItem)
                          setRequestType('RETRY')
                        }}
                      >
                        <RotateCcw className='mr-2 h-4 w-4' />
                        Request Retry
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Request</DialogTitle>
                        <DialogDescription>
                          Submit a request for approval
                        </DialogDescription>
                      </DialogHeader>
                      <div className='space-y-4 py-4'>
                        <div className='space-y-2'>
                          <Label>Request Type</Label>
                          <Select
                            value={requestType}
                            onValueChange={(v: any) => setRequestType(v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='RETRY'>Retry Transaction</SelectItem>
                              <SelectItem value='REFERENCE_UPDATE'>Update Transaction Reference</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {requestType === 'REFERENCE_UPDATE' && (
                          <div className='space-y-2'>
                            <Label>New Transaction Reference</Label>
                            <Input
                              value={newTransactionReference}
                              onChange={(e) => setNewTransactionReference(e.target.value)}
                              placeholder='Enter new reference'
                            />
                          </div>
                        )}
                        <div className='space-y-2'>
                          <Label>Reason</Label>
                          <Textarea
                            value={requestReason}
                            onChange={(e) => setRequestReason(e.target.value)}
                            placeholder='Enter reason for this request'
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant='outline'
                          onClick={() => setIsRequestDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleCreateRequest}
                          disabled={isSubmitting || !requestReason}
                        >
                          {isSubmitting ? <RefreshCw className='h-4 w-4 animate-spin mr-2' /> : <Send className='h-4 w-4 mr-2' />}
                          Submit Request
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
                {canRetry && selectedItem.status === 'FAILED' && (
                  <Button
                    variant='outline'
                    className='flex-1 rounded-[18px] border-[#F1E7D0]'
                    onClick={() => {
                      setSelectedItem(selectedItem)
                      setRequestType('REFERENCE_UPDATE')
                      setIsRequestDialogOpen(true)
                    }}
                  >
                    <Edit3 className='mr-2 h-4 w-4' />
                    Update Reference
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Request Detail Dialog */}
      {selectedRequest && (
        <Dialog open={isRequestDetailOpen} onOpenChange={setIsRequestDetailOpen}>
          <DialogContent className='max-w-2xl rounded-[20px] max-h-[90vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle>Reconciliation Request Details</DialogTitle>
              <DialogDescription>
                Review the request and associated cashback transaction
              </DialogDescription>
            </DialogHeader>
            <div className='mt-6 space-y-6'>
              {/* Request Info */}
              <div className='rounded-[18px] border border-amber-200 bg-amber-50/30 p-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Request Type</div>
                    <div className='mt-1 font-medium'>{selectedRequest.type === 'REFERENCE_UPDATE' ? 'Update Reference' : 'Retry Transaction'}</div>
                  </div>
                  <div>
                    <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Status</div>
                    <div className='mt-1'><RequestStatusBadge status={selectedRequest.status} /></div>
                  </div>
                  <div>
                    <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Created By</div>
                    <div className='mt-1 text-sm'>{selectedRequest.maker.name || selectedRequest.maker.email}</div>
                  </div>
                  <div>
                    <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Created At</div>
                    <div className='mt-1 text-sm'>{new Date(selectedRequest.createdAt).toLocaleString()}</div>
                  </div>
                </div>
                <div className='mt-4'>
                  <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Reason</div>
                  <div className='mt-1 text-sm text-slate-700 bg-white p-3 rounded-xl border border-amber-100'>{selectedRequest.reason}</div>
                </div>
                {selectedRequest.type === 'REFERENCE_UPDATE' && (
                  <div className='mt-4'>
                    <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Reference Change</div>
                    <div className='mt-1 font-mono text-sm flex items-center gap-2'>
                      <span className='text-rose-600'>{selectedRequest.oldTransactionReference}</span>
                      <ChevronRight className='h-4 w-4 text-slate-400' />
                      <span className='text-emerald-600'>{selectedRequest.newTransactionReference}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Transaction Details */}
              <div className='space-y-3'>
                <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Associated Transaction</div>
                <div className='rounded-[18px] border border-[#F1E7D0] bg-[#FFFDF7] p-4'>
                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <div className='text-xs text-slate-500'>Merchant</div>
                      <div className='text-sm font-medium'>{selectedRequest.cashbackTransaction.merchant.name}</div>
                    </div>
                    <div>
                      <div className='text-xs text-slate-500'>Transaction Ref</div>
                      <div className='text-sm font-mono'>{selectedRequest.cashbackTransaction.transactionReference}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Review Section */}
              {selectedRequest.status === 'PENDING' && canManage && (session?.user as any)?.id !== selectedRequest.maker.id && (
                <div className='space-y-4 pt-4 border-t border-[#F1E7D0]'>
                  <div className='space-y-2'>
                    <Label htmlFor='comments'>Review Comments (Optional)</Label>
                    <Textarea
                      id='comments'
                      placeholder='Add any comments for this decision...'
                      value={requestComments}
                      onChange={(e) => setRequestComments(e.target.value)}
                      rows={3}
                      className='rounded-xl border-[#F1E7D0]'
                    />
                  </div>
                  <div className='flex gap-3'>
                    <Button
                      className='flex-1 rounded-[18px] bg-emerald-600 hover:bg-emerald-700'
                      onClick={() => handleApproveRequest(selectedRequest)}
                      disabled={approvingRequestId === selectedRequest.id}
                    >
                      {approvingRequestId === selectedRequest.id ? (
                        <RefreshCw className='h-4 w-4 animate-spin mr-2' />
                      ) : (
                        <CheckCircle2 className='h-4 w-4 mr-2' />
                      )}
                      Approve & Execute
                    </Button>
                    <Button
                      variant='outline'
                      className='flex-1 rounded-[18px] border-rose-200 text-rose-600 hover:bg-rose-50'
                      onClick={() => handleRejectRequest(selectedRequest)}
                      disabled={approvingRequestId === selectedRequest.id}
                    >
                      {approvingRequestId === selectedRequest.id ? (
                        <RefreshCw className='h-4 w-4 animate-spin mr-2' />
                      ) : (
                        <XCircle className='h-4 w-4 mr-2' />
                      )}
                      Reject Request
                    </Button>
                  </div>
                </div>
              )}

              {selectedRequest.status !== 'PENDING' && selectedRequest.comments && (
                <div className='space-y-2 pt-4 border-t border-[#F1E7D0]'>
                  <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Reviewer Comments</div>
                  <div className='text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100 italic'>
                    &quot;{selectedRequest.comments}&quot;
                  </div>
                  <div className='text-xs text-slate-500 text-right'>
                    — {selectedRequest.checker?.name || selectedRequest.checker?.email}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
