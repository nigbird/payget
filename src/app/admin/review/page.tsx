"use client"

import { useState, useEffect, use } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { 
  ShieldCheck, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Building2, 
  User, 
  Phone, 
  MapPin, 
  Link as LinkIcon, 
  FileCheck, 
  ExternalLink, 
  MessageSquare, 
  TrendingUp, 
  Hash, 
  Clock, 
  ArrowRight, 
  Filter, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Plus, 
  Globe, 
  ShieldAlert, 
  X, 
  FileText, 
  Download,
  Mail,
  Store,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  SlidersHorizontal,
  Edit2,
  Landmark,
  ListChecks,
} from "lucide-react"
import { downloadCsv } from "@/lib/export-csv"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import type { Merchant } from "@/app/lib/db"
import { useAuth } from "@/lib/auth-context"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"

function MerchantReviewContent() {
  const { user } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const merchantIdParam = searchParams.get('merchantId')
  
  const [pending, setPending] = useState<Merchant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  
  const [selectedMerchant, setSelectedMerchant] = useState<(Merchant & { _permissions?: any }) | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isFetchingDetails, setIsFetchingDetails] = useState(false)
  const [limits, setLimits] = useState({
    dailyLimit: "10000",
    transactionLimit: "1000",
    dailyCountLimit: "100"
  })
  const [limitErrors, setLimitErrors] = useState<Record<string, string>>({})
  
  const [rejectionReason, setRejectionReason] = useState("")
  const [isRejecting, setIsRejecting] = useState(false)
  const [isRequestingUpdate, setIsRequestingUpdate] = useState(false)
  const [submittingAction, setSubmittingAction] = useState<string | null>(null)
  const [updateComments, setUpdateComments] = useState({
    general: "",
    fields: {} as Record<string, string>
  })
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null)

  const userPermissions = user?.permissions || []
  const canSetLimits = userPermissions.includes('TRANSACTION_LIMIT_SET') || userPermissions.includes('TRANSACTION_LIMIT_OVERRIDE')
  const canApprove = userPermissions.includes('MERCHANT_APPROVE')
  const canRequestSubsidiary = userPermissions.includes('SUBSIDIARY_ACCOUNT_REQUEST')
  const canApproveSubsidiary = userPermissions.includes('SUBSIDIARY_ACCOUNT_APPROVE')

  type SubsidiaryAccountRequestItem = {
    id: string
    merchantId: string
    requestedAccountNumber: string
    previousAccountNumber: string | null
    reason: string
    makerId: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    merchant: { id: string; name: string }
    maker: { id: string; name: string | null; email: string | null }
    createdAt: string
  }
  const [subsidiaryRequests, setSubsidiaryRequests] = useState<SubsidiaryAccountRequestItem[]>([])
  const [subsidiaryActionId, setSubsidiaryActionId] = useState<string | null>(null)
  const [subsidiarySearch, setSubsidiarySearch] = useState('')

  const fetchSubsidiaryRequests = async () => {
    try {
      const response = await fetch('/api/admin/subsidiary-account-requests')
      if (response.ok) {
        const data = await response.json()
        setSubsidiaryRequests(data.requests || [])
      }
    } catch (error) {
      console.error('Failed to fetch subsidiary account requests:', error)
    }
  }

  useEffect(() => {
    if (canRequestSubsidiary || canApproveSubsidiary) {
      fetchSubsidiaryRequests()
    }
  }, [canRequestSubsidiary, canApproveSubsidiary])

  const handleSubsidiaryDecision = async (request: SubsidiaryAccountRequestItem, decision: 'approve' | 'reject') => {
    setSubsidiaryActionId(request.id)
    try {
      const response = await fetch(`/api/merchants/${request.merchantId}/subsidiary-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: decision === 'approve' ? 'approve_request' : 'reject_request',
          requestId: request.id,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to submit decision')

      toast({
        title: decision === 'approve' ? 'Subsidiary account approved' : 'Request rejected',
        description: decision === 'approve'
          ? `${request.merchant.name}'s subsidiary account is now active.`
          : `The request for ${request.merchant.name} was rejected.`,
      })
      await fetchSubsidiaryRequests()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: error.message })
    } finally {
      setSubsidiaryActionId(null)
    }
  }

  const canApproveEligibility = userPermissions.includes('PAYMENT_ELIGIBILITY_APPROVE')

  type EligibilityRequestItem = {
    id: string
    type: 'IMPORT' | 'REMOVAL'
    fileName: string | null
    totalRows: number
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    createdAt: string
    merchant: { id: string; name: string }
    submitter: { id: string; name: string | null; email: string | null }
  }
  const [eligibilityRequests, setEligibilityRequests] = useState<EligibilityRequestItem[]>([])
  const [eligibilityActionId, setEligibilityActionId] = useState<string | null>(null)
  const [eligibilitySearch, setEligibilitySearch] = useState('')
  const [viewListRequest, setViewListRequest] = useState<EligibilityRequestItem | null>(null)
  const [viewListPhones, setViewListPhones] = useState<string[]>([])
  const [viewListSearch, setViewListSearch] = useState('')
  const [isViewListOpen, setIsViewListOpen] = useState(false)
  const [isViewListLoading, setIsViewListLoading] = useState(false)

  const fetchEligibilityRequests = async () => {
    try {
      const response = await fetch('/api/admin/payment-eligibility-requests')
      if (response.ok) {
        const data = await response.json()
        setEligibilityRequests(data.requests || [])
      }
    } catch (error) {
      console.error('Failed to fetch payment eligibility requests:', error)
    }
  }

  useEffect(() => {
    if (canApproveEligibility) {
      fetchEligibilityRequests()
    }
  }, [canApproveEligibility])

  const openViewList = async (request: EligibilityRequestItem) => {
    setViewListRequest(request)
    setViewListSearch('')
    setIsViewListOpen(true)
    setIsViewListLoading(true)
    try {
      const response = await fetch(`/api/admin/payment-eligibility-requests/${request.id}`)
      if (response.ok) {
        const data = await response.json()
        setViewListPhones(data.phones || [])
      }
    } catch (error) {
      console.error('Failed to fetch eligibility request list:', error)
    } finally {
      setIsViewListLoading(false)
    }
  }

  const handleEligibilityDecision = async (request: EligibilityRequestItem, decision: 'approve' | 'reject') => {
    setEligibilityActionId(request.id)
    try {
      const response = await fetch(`/api/admin/payment-eligibility-requests/${request.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: decision }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to submit decision')

      toast({
        title: decision === 'approve' ? 'Eligible customers approved' : 'Import rejected',
        description: decision === 'approve'
          ? `${request.merchant.name}'s eligible customer list is now active.`
          : `The import for ${request.merchant.name} was rejected.`,
      })
      setIsViewListOpen(false)
      await fetchEligibilityRequests()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Action failed', description: error.message })
    } finally {
      setEligibilityActionId(null)
    }
  }

  const sanitizeLimitInput = (value: string): string => {
    const cleaned = value.replace(/[^\d.]/g, '')
    const parts = cleaned.split('.')
    if (parts.length === 1) return parts[0]
    return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`
  }

  const validateLimit = (value: string): string | null => {
    if (!value || value.trim() === '') return 'This field is required'
    if (!/^\d+(\.\d{0,2})?$/.test(value)) return 'Enter a valid number (up to 2 decimal places)'
    const num = parseFloat(value)
    if (isNaN(num) || num < 0) return 'Must be a positive number'
    if (num > 999_999_999.99) return 'Value exceeds maximum allowed (999,999,999.99)'
    return null
  }

  const handleLimitChange = (field: keyof typeof limits, value: string) => {
    const sanitized = sanitizeLimitInput(value)
    setLimits(prev => ({ ...prev, [field]: sanitized }))
    setLimitErrors(prev => ({ ...prev, [field]: validateLimit(sanitized) || '' }))
  }

  const fetchMerchantDetails = async (id: string) => {
    setIsFetchingDetails(true)
    try {
      const response = await fetch(`/api/merchants/${id}`)
      if (response.ok) {
        const details = await response.json()
        setSelectedMerchant(details)
      }
    } catch (error) {
      console.error('Failed to fetch merchant details:', error)
    } finally {
      setIsFetchingDetails(false)
    }
  }

  useEffect(() => {
    fetchMerchants()
  }, [])

  useEffect(() => {
    if (merchantIdParam && pending.length > 0) {
      const m = pending.find(p => p.id === merchantIdParam)
      if (m) {
        fetchMerchantDetails(m.id)
        setIsDetailsOpen(true)
      }
    }
  }, [merchantIdParam, pending])

  const fetchMerchants = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/merchants')
      if (response.ok) {
        const merchants = await response.json()
        // Centralized queue: show anything not fully approved or rejected
        setPending(merchants.filter((m: Merchant) => 
          m.status === 'pending' || 
          m.status === 'branch_approved' || 
          m.status === 'resubmitted' ||
          m.status === 'rejected_with_update'
        ))
      }
    } catch (error) {
      console.error('Failed to fetch merchants:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredMerchants = pending.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalPages = Math.ceil(filteredMerchants.length / itemsPerPage)
  const paginatedMerchants = filteredMerchants.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const handleExport = () => {
    downloadCsv('review-queue', [
      'Merchant ID', 'Name', 'Email', 'Contact', 'Category', 'Business Type', 'Branch', 'District', 'Status', 'Days in Queue'
    ], filteredMerchants.map(m => [
      m.id,
      m.name,
      m.email,
      m.contactName,
      m.category,
      m.businessType,
      m.branchName,
      m.district,
      m.status,
      Math.floor((Date.now() - new Date(m.createdAt).getTime()) / 86400000)
    ]))
    toast({ title: 'Export Complete', description: `${filteredMerchants.length} merchants exported to CSV` })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    )
  }

  const handleAction = async (id: string, action: 'initial_approve' | 'final_approve' | 'reject') => {
    if (action === 'reject') {
      if (!rejectionReason.trim()) {
        toast({
          variant: "destructive",
          title: "Reason Required",
          description: "Please provide a reason for rejection."
        })
        return
      }
      if (rejectionReason.length > 500) {
        toast({
          variant: "destructive",
          title: "Reason Too Long",
          description: "Rejection reason must not exceed 500 characters."
        })
        return
      }
    }

    setSubmittingAction(action)
    try {
      let body: any = {}
      
      if (action === 'initial_approve') {
        body = {
          dailyLimit: Number(limits.dailyLimit),
          transactionLimit: Number(limits.transactionLimit),
          dailyCountLimit: Number(limits.dailyCountLimit),
          status: 'branch_approved'
        }
      } else if (action === 'final_approve') {
        body = { status: 'approved' }
      } else {
        body = { status: 'rejected', rejectionReason }
      }

      const response = await fetch(`/api/merchants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (response.ok) {
        toast({
          title: "Action Successful",
          description: `Merchant status updated successfully.`
        })
        setSelectedMerchant(null)
        setIsDetailsOpen(false)
        setRejectionReason("")
        setIsRejecting(false)
        fetchMerchants()
      } else {
        const err = await response.json()
        throw new Error(err.error || 'Failed to update status')
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message
      })
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleRequestUpdate = async () => {
    if (!selectedMerchant) return;
    if (!updateComments.general.trim()) {
      toast({
        variant: "destructive",
        title: "Comment Required",
        description: "Please provide at least a general comment for the update request."
      })
      return
    }
    if (updateComments.general.length > 500) {
      toast({
        variant: "destructive",
        title: "Comment Too Long",
        description: "Update request comment must not exceed 500 characters."
      })
      return
    }

    setSubmittingAction('request_update')
    try {
      const response = await fetch(`/api/merchants/${selectedMerchant.id}/request-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments: updateComments })
      })

      if (response.ok) {
        toast({
          title: "Update Requested",
          description: "The merchant has been notified to provide updates."
        })
        setSelectedMerchant(null)
        setIsDetailsOpen(false)
        setIsRequestingUpdate(false)
        setUpdateComments({ general: "", fields: {} })
        fetchMerchants()
      } else {
        const err = await response.json()
        throw new Error(err.error || 'Failed to request update')
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Request Failed",
        description: error.message
      })
    } finally {
      setSubmittingAction(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>
      case 'active': return <Badge className="bg-emerald-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Active</Badge>
      case 'branch_approved': return <Badge className="bg-blue-500 gap-1"><ShieldCheck className="w-3 h-3" /> Initial Review OK</Badge>
      case 'pending': return <Badge variant="outline" className="text-orange-500 border-orange-200 bg-orange-50 gap-1"><Clock className="w-3 h-3" /> New Submission</Badge>
      case 'rejected_with_update': return <Badge className="bg-amber-500 gap-1 text-white"><MessageSquare className="w-3 h-3" /> Update Requested</Badge>
      case 'resubmitted': return <Badge className="bg-indigo-500 gap-1"><ArrowRight className="w-3 h-3" /> Resubmitted</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getRequestStatusBadge = (status: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    switch (status) {
      case 'APPROVED': return <Badge className="bg-emerald-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>
      case 'REJECTED': return <Badge className="bg-rose-500 gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>
      default: return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 gap-1"><Clock className="w-3 h-3" /> Pending</Badge>
    }
  }

  const filteredSubsidiaryRequests = subsidiaryRequests.filter((req) =>
    req.merchant.name.toLowerCase().includes(subsidiarySearch.toLowerCase())
  )
  const filteredEligibilityRequests = eligibilityRequests.filter((req) =>
    req.merchant.name.toLowerCase().includes(eligibilitySearch.toLowerCase()) ||
    (req.fileName ?? '').toLowerCase().includes(eligibilitySearch.toLowerCase())
  )
  const filteredViewListPhones = viewListPhones.filter((p) => p.includes(viewListSearch))

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-[#5b371f]">Review & approvals</h2>
        <p className="text-sm text-amber-800/60 font-medium">Approve registrations, adjust limits, and perform final audits.</p>
      </div>

      <Tabs defaultValue="onboarding" className="space-y-4">
        <TabsList>
          <TabsTrigger value="onboarding">Merchant Onboarding</TabsTrigger>
          {(canRequestSubsidiary || canApproveSubsidiary) && (
            <TabsTrigger value="subsidiary" className="gap-1.5">
              Subsidiary Account Requests
              {subsidiaryRequests.length > 0 && (
                <Badge className="h-5 px-1.5 rounded-full bg-amber-500">{subsidiaryRequests.length}</Badge>
              )}
            </TabsTrigger>
          )}
          {canApproveEligibility && (
            <TabsTrigger value="eligibility" className="gap-1.5">
              Eligible Customer Imports
              {eligibilityRequests.length > 0 && (
                <Badge className="h-5 px-1.5 rounded-full bg-amber-500">{eligibilityRequests.length}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="onboarding" className="space-y-4">
      <div className="rounded-2xl">
        <div className="relative overflow-hidden rounded-2xl">
          <Card className="overflow-hidden rounded-2xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/10">
            <CardHeader className="bg-[#FFFDF7] border-b border-black/5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base tracking-tight">Review queue</CardTitle>
                  <CardDescription className="text-slate-600">
                    Search, filter, and inspect merchant applications quickly.
                  </CardDescription>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      placeholder="Search merchants..."
                      className="h-10 rounded-2xl border-black/10 bg-white pl-9 focus-visible:ring-2 focus-visible:ring-[#f8b513]/30"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setCurrentPage(1)
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Show</span>
                    <Select 
                      value={String(itemsPerPage)} 
                      onValueChange={(val) => {
                        setItemsPerPage(Number(val))
                        setCurrentPage(1)
                      }}
                    >
                      <SelectTrigger className="h-10 w-20 rounded-2xl border-black/10 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    className="h-10 rounded-2xl border-black/10 bg-white hover:bg-amber-50/50 transition-colors"
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-2 text-[#754319]" />
                    Filters
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-2xl border-black/10 bg-white hover:bg-amber-50/50 transition-colors"
                    onClick={handleExport}
                  >
                    <Download className="h-4 w-4 mr-2 text-[#754319]" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] hover:bg-white/95">
                    <TableHead className="pl-6 py-4 text-xs font-semibold tracking-wide text-slate-700">Merchant</TableHead>
                    <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Review Stage</TableHead>
                    <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Submitted By</TableHead>
                    <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Days in Queue</TableHead>
                    <TableHead className="py-4 text-right pr-6 text-xs font-semibold tracking-wide text-slate-700">Review</TableHead>
                  </TableRow>
                </TableHeader>
                  <TableBody>
                    {paginatedMerchants.map((m) => (
                      <TableRow
                        key={m.id}
                        className="bg-[#FFFDF7] group transition-all duration-200 hover:bg-amber-50/40 hover:shadow-sm hover:-translate-y-[1px]"
                      >
                        <TableCell className="pl-6 py-5 align-middle">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-950">{m.name}</span>
                            <span className="mt-0.5 text-[10px] font-mono uppercase text-slate-500">{m.id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-5 align-middle">{getStatusBadge(m.status)}</TableCell>
                        <TableCell className="py-5 align-middle">
                          <div className="flex items-center gap-3 text-xs">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                              {m.contactName.charAt(0)}
                            </div>
                            <span className="font-medium text-slate-800">{m.contactName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-5 align-middle text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {Math.floor((new Date().getTime() - new Date(m.createdAt).getTime()) / (1000 * 3600 * 24))} days
                          </div>
                        </TableCell>
                        <TableCell className="py-5 align-middle text-right pr-6">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 rounded-2xl border-black/10 bg-white hover:bg-amber-50/50 transition-colors gap-2"
                              onClick={() => {
                                fetchMerchantDetails(m.id)
                                setIsDetailsOpen(true)
                              }}
                            >
                              Open Review <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {paginatedMerchants.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                          No pending actions in review queue.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
            </CardContent>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-black/5 bg-amber-50/20">
                <div className="text-xs font-medium text-slate-500">
                  Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * itemsPerPage, filteredMerchants.length)}</span> of <span className="text-slate-900 font-bold">{filteredMerchants.length}</span> results
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center px-3 h-8 rounded-xl border border-black/5 bg-white text-xs font-bold text-amber-900 shadow-sm">
                    {currentPage} / {totalPages}
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>

        {/* Unified Review Modal */}
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b border-slate-50 pb-6 pt-2 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 border border-slate-100 shadow-sm">
                <Building2 className="w-6 h-6 text-slate-600" />
              </div>
              <DialogTitle className="text-xl font-medium text-slate-800">
                Review Application: {selectedMerchant?.name}
              </DialogTitle>
              <DialogDescription className="text-slate-500 mt-1">
                Perform compliance checks and authorize merchant onboarding.
              </DialogDescription>
            </DialogHeader>

            {isFetchingDetails ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
                <p className="text-sm text-slate-500 font-medium">Loading merchant details...</p>
              </div>
            ) : selectedMerchant && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-6">
                <div className="lg:col-span-2 space-y-6">
                  {/* Header Info with Logo */}
                  <div className="flex items-start gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="relative group shrink-0">
                      <div className="w-24 h-24 rounded-2xl bg-white border border-slate-200 shadow-inner flex items-center justify-center overflow-hidden">
                        {selectedMerchant.logoUrl ? (
                          <img 
                            src={selectedMerchant.logoUrl} 
                            alt="Merchant Logo" 
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Building2 className="w-10 h-10 text-slate-300" />
                        )}
                      </div>
                      {selectedMerchant.logoUrl && (
                        <button 
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl"
                          onClick={() => setPreviewFile({ url: selectedMerchant.logoUrl!, name: "Business Logo", type: "image/png" })}
                        >
                          <Eye className="w-6 h-6 text-white" />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Merchant ID</Label>
                          <p className="text-sm font-mono font-bold text-slate-950">{selectedMerchant.id}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Business Email</Label>
                            <p className="text-sm font-medium text-slate-950 flex items-center gap-2">
                              <Mail className="w-3.5 h-3.5 text-slate-400" /> {selectedMerchant.email}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Contact Name</Label>
                            <p className="text-sm font-medium text-slate-950 flex items-center gap-2">
                              <User className="w-3.5 h-3.5 text-slate-400" /> {selectedMerchant.contactName || "—"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Contact Username</Label>
                            <p className="text-sm font-medium text-slate-950 flex items-center gap-2">
                              <Hash className="w-3.5 h-3.5 text-slate-400" /> {selectedMerchant.contactUsername || "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Store className="w-4 h-4" /> Business Profile
                      </h4>
                      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-4 bg-slate-50/50 border-b border-slate-100">
                          <Label className="text-[10px] uppercase text-slate-500 font-bold">Nature of Business</Label>
                          <p className="mt-1 text-sm text-slate-700 leading-relaxed italic">
                            "{selectedMerchant.businessDescription}"
                          </p>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-slate-100">
                          <div className="p-4 space-y-3">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">Industry:</span>
                              <Badge variant="outline" className="font-bold border-slate-200">{selectedMerchant.category}</Badge>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">Business Type:</span>
                              <Badge variant="outline" className="font-bold border-slate-200">{selectedMerchant.businessType}</Badge>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">Hub / District:</span>
                              <span className="font-bold text-slate-900">{selectedMerchant.branchName} / {selectedMerchant.district}</span>
                            </div>
                          </div>
                          <div className="p-4 space-y-3">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500 flex items-center gap-1"><Globe className="w-3 h-3" /> Website:</span>
                              <a href={selectedMerchant.websiteUrl || "#"} target="_blank" className="font-bold text-blue-600 hover:underline truncate max-w-[120px]">
                                {selectedMerchant.websiteUrl?.replace(/^https?:\/\//, '') || "—"}
                              </a>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500 flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Webhook:</span>
                              <span className="font-bold text-slate-900 truncate max-w-[120px]" title={selectedMerchant.callbackUrl}>
                                {selectedMerchant.callbackUrl?.replace(/^https?:\/\//, '') || "—"}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Settlement:</span>
                              <span className="font-mono font-bold text-slate-950">{selectedMerchant.accountNumber}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Compliance Documentation
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {selectedMerchant.documents?.map(doc => (
                          <div key={doc.id} className="group relative flex flex-col p-4 rounded-2xl bg-white border border-slate-200 hover:border-primary/50 hover:shadow-md transition-all duration-300">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 group-hover:bg-primary/5 transition-colors">
                                {doc.type.startsWith('image/') ? (
                                  <img src={doc.url} alt={doc.name} className="w-full h-full object-cover rounded-xl" />
                                ) : (
                                  <FileText className="w-6 h-6 text-slate-400 group-hover:text-primary transition-colors" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate" title={doc.name}>{doc.name}</p>
                                <p className="text-[10px] text-slate-500 font-medium uppercase mt-0.5">
                                  {doc.type.split('/')[1]} • {(doc.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="flex-1 h-8 text-[10px] font-bold uppercase tracking-wider rounded-lg border-slate-200"
                                onClick={() => setPreviewFile({ url: doc.url!, name: doc.name, type: doc.type })}
                              >
                                <Eye className="w-3 h-3 mr-1.5" /> Preview
                              </Button>
                              <a 
                                href={doc.url} 
                                download={doc.name}
                                className="flex-1 inline-flex items-center justify-center h-8 text-[10px] font-bold uppercase tracking-wider rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all"
                              >
                                <Download className="w-3 h-3 mr-1.5" /> Download
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedMerchant.riskFactors?.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-red-600 flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4" /> Compliance Risk Assessment
                        </h4>
                        <div className="grid grid-cols-1 gap-2">
                          {selectedMerchant.riskFactors.map((rf, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 bg-red-50/50 border border-red-100 rounded-xl text-xs font-medium text-red-900">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                              {rf}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    {/* Action Panel */}
                    <Card className="border-primary/10 bg-primary/5 shadow-none">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Compliance Actions</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {selectedMerchant.createdBy && (
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-primary flex items-center gap-2">
                              <Edit2 className="w-3 h-3" /> Application Edit
                            </Label>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-9"
                              onClick={() => {
                                setIsDetailsOpen(false)
                                router.push(`/admin/onboarding?editMerchantId=${selectedMerchant.id}`)
                              }}
                            >
                              Open Edit Form
                            </Button>
                          </div>
                        )}

                        {(selectedMerchant.status === 'pending' || selectedMerchant.status === 'resubmitted') && (
                          <div className="space-y-4">
                            <div className="space-y-3">
                              <Label className="text-xs font-bold uppercase text-primary flex items-center gap-2">
                                <TrendingUp className="w-3 h-3" /> {selectedMerchant.status === 'resubmitted' ? 'Review & Assign Limits' : 'Assign Limits'}
                              </Label>
                              {selectedMerchant._permissions?.isCreator && (
                                <div className="p-2 bg-amber-50 border border-amber-100 rounded-lg flex items-start gap-2">
                                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                  <p className="text-[10px] text-amber-800 font-medium leading-tight">
                                    Maker-Checker: You created this application and cannot set its limits.
                                  </p>
                                </div>
                              )}
                              <div className="space-y-2">
                                <div className="grid gap-1">
                                  <Label htmlFor="dailyLimit" className="text-[10px]">Daily Volume (ETB)</Label>
                                  <Input 
                                    id="dailyLimit" 
                                    className={`h-8 text-sm ${limitErrors.dailyLimit ? 'border-red-500' : ''}`} 
                                    value={limits.dailyLimit}
                                    onChange={(e) => handleLimitChange('dailyLimit', e.target.value)}
                                    disabled={!canSetLimits || selectedMerchant._permissions?.isCreator}
                                    maxLength={13}
                                  />
                                  {limitErrors.dailyLimit && (
                                    <p className="text-[10px] text-red-500 font-medium">{limitErrors.dailyLimit}</p>
                                  )}
                                </div>
                                <div className="grid gap-1">
                                  <Label htmlFor="transactionLimit" className="text-[10px]">Per Tx Limit (ETB)</Label>
                                  <Input 
                                    id="transactionLimit" 
                                    className={`h-8 text-sm ${limitErrors.transactionLimit ? 'border-red-500' : ''}`} 
                                    value={limits.transactionLimit}
                                    onChange={(e) => handleLimitChange('transactionLimit', e.target.value)}
                                    disabled={!canSetLimits || selectedMerchant._permissions?.isCreator}
                                    maxLength={13}
                                  />
                                  {limitErrors.transactionLimit && (
                                    <p className="text-[10px] text-red-500 font-medium">{limitErrors.transactionLimit}</p>
                                  )}
                                </div>
                                <div className="grid gap-1">
                                  <Label htmlFor="dailyCountLimit" className="text-[10px]">Daily Count</Label>
                                  <Input 
                                    id="dailyCountLimit" 
                                    className={`h-8 text-sm ${limitErrors.dailyCountLimit ? 'border-red-500' : ''}`} 
                                    value={limits.dailyCountLimit}
                                    onChange={(e) => handleLimitChange('dailyCountLimit', e.target.value)}
                                    disabled={!canSetLimits || selectedMerchant._permissions?.isCreator}
                                    maxLength={13}
                                  />
                                  {limitErrors.dailyCountLimit && (
                                    <p className="text-[10px] text-red-500 font-medium">{limitErrors.dailyCountLimit}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <Button 
                              className="w-full h-12 text-sm font-medium rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all duration-300" 
                              onClick={() => handleAction(selectedMerchant.id, 'initial_approve')}
                              disabled={!canSetLimits || !selectedMerchant._permissions?.canSetLimits || submittingAction !== null}
                            >
                              {submittingAction === 'initial_approve' ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                'Confirm & Set Limits'
                              )}
                            </Button>
                          </div>
                        )}

                        {selectedMerchant.status === 'branch_approved' && (
                          <div className="space-y-4">
                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                              <p className="text-[10px] text-blue-800 font-medium leading-relaxed">
                                Initial review complete. Ready for final system activation.
                              </p>
                            </div>
                            {(!selectedMerchant._permissions?.canApprove && canApprove) && (
                              <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                                <p className="text-[10px] text-rose-800 font-medium leading-tight">
                                  Maker-Checker: You are restricted from approving this application because you {
                                    selectedMerchant._permissions?.isCreator ? "created it" : 
                                    selectedMerchant._permissions?.isLimitSetter ? "set its limits" : 
                                    "edited the form"
                                  }.
                                </p>
                              </div>
                            )}
                            <Button 
                              className="w-full h-12 text-sm font-medium rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all duration-300" 
                              onClick={() => handleAction(selectedMerchant.id, 'final_approve')}
                              disabled={!canApprove || !selectedMerchant._permissions?.canApprove || submittingAction !== null}
                            >
                              {submittingAction === 'final_approve' ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Activating...
                                </>
                              ) : (
                                'Finalize Activation'
                              )}
                            </Button>
                          </div>
                        )}

                        <Separator />

                        {!isRequestingUpdate ? (
                          <Button 
                            variant="outline" 
                            className="w-full h-9 text-amber-700 hover:bg-amber-50 rounded-xl transition-colors border-slate-200 shadow-sm"
                            onClick={() => {
                              setIsRequestingUpdate(true)
                              setIsRejecting(false)
                            }}
                          >
                            Request Update
                          </Button>
                        ) : (
                          <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium text-amber-900">Update Request Comments</Label>
                              <span className={`text-[10px] font-medium ${updateComments.general.length > 500 ? 'text-rose-600' : 'text-slate-400'}`}>
                                {updateComments.general.length}/500
                              </span>
                            </div>
                            <Textarea 
                              className={`min-h-[80px] text-xs rounded-lg border-slate-200 ${updateComments.general.length > 500 ? 'border-rose-300 focus-visible:ring-rose-300/20' : ''}`} 
                              placeholder="General instructions for the merchant..."
                              value={updateComments.general}
                              onChange={(e) => setUpdateComments({...updateComments, general: e.target.value})}
                              maxLength={500}
                            />
                            <p className="text-[10px] text-slate-500 italic">Field-level comments can be added in a future update or via the general comments above.</p>
                            <div className="flex gap-2">
                              <Button variant="outline" className="flex-1 text-xs h-8 rounded-lg border-slate-200 bg-white hover:bg-slate-50 transition-colors" onClick={() => setIsRequestingUpdate(false)} disabled={submittingAction !== null}>Cancel</Button>
                              <Button 
                                className="flex-1 text-xs h-8 rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all" 
                                onClick={handleRequestUpdate}
                                disabled={submittingAction !== null}
                              >
                                {submittingAction === 'request_update' ? (
                                  <>
                                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                    Sending...
                                  </>
                                ) : (
                                  'Send Request'
                                )}
                              </Button>
                            </div>
                          </div>
                        )}

                        {!isRejecting ? (
                          <Button 
                            variant="ghost" 
                            className="w-full h-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
                            onClick={() => {
                              setIsRejecting(true)
                              setIsRequestingUpdate(false)
                            }}
                          >
                            Reject Application
                          </Button>
                        ) : (
                          <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium text-rose-900">Reason for Rejection</Label>
                              <span className={`text-[10px] font-medium ${rejectionReason.length > 500 ? 'text-rose-600' : 'text-slate-400'}`}>
                                {rejectionReason.length}/500
                              </span>
                            </div>
                            <Textarea 
                              className={`min-h-[80px] text-xs rounded-lg border-slate-200 ${rejectionReason.length > 500 ? 'border-rose-300 focus-visible:ring-rose-300/20' : ''}`}
                              placeholder="Explain why this request is being denied..."
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              maxLength={500}
                            />
                            <div className="flex gap-2">
                              <Button variant="outline" className="flex-1 text-xs h-8 rounded-lg border-slate-200 bg-white hover:bg-slate-50 transition-colors" onClick={() => setIsRejecting(false)} disabled={submittingAction !== null}>Cancel</Button>
                              <Button 
                                variant="destructive" 
                                className="flex-1 text-xs h-8 rounded-lg shadow-sm" 
                                onClick={() => handleAction(selectedMerchant.id, 'reject')}
                                disabled={submittingAction !== null}
                              >
                                {submittingAction === 'reject' ? (
                                  <>
                                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                    Rejecting...
                                  </>
                                ) : (
                                  'Confirm Reject'
                                )}
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Audit Visibility */}
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">Action History</Label>
                      <div className="space-y-2">
                        <div className="flex gap-3 text-[10px]">
                          <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                            <Plus className="w-2 h-2" />
                          </div>
                          <div>
                            <p className="font-bold">Application Submitted</p>
                            <p className="text-muted-foreground">{new Date(selectedMerchant.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        {selectedMerchant.status === 'branch_approved' && (
                          <div className="flex gap-3 text-[10px]">
                            <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                              <CheckCircle className="w-2 h-2 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-bold text-blue-800">Initial Review Passed</p>
                              <p className="text-muted-foreground">Limits assigned and verified.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Preview Modal */}
          <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
            <DialogContent className="max-w-4xl bg-transparent border-none p-0 overflow-hidden shadow-none">
              <DialogHeader className="absolute top-0 left-0 right-0 z-10 p-4">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-white text-sm font-bold truncate pr-8 bg-black/40 px-3 py-1 rounded-lg backdrop-blur-md">
                    {previewFile?.name}
                  </DialogTitle>
                  <button
                    type="button"
                    className="text-white hover:bg-white/20 bg-black/40 rounded-full p-1.5 backdrop-blur-md transition-colors"
                    onClick={() => setPreviewFile(null)}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </DialogHeader>
              <div className="flex items-center justify-center min-h-[60vh] p-8">
                {previewFile?.type.startsWith('image/') ? (
                  <img
                    src={previewFile.url}
                    alt={previewFile.name}
                    className="max-w-full max-h-[80vh] object-contain shadow-2xl rounded-lg"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-6 text-white">
                    <div className="w-24 h-24 rounded-3xl bg-white/10 flex items-center justify-center border border-white/20">
                      <FileText className="w-12 h-12 text-white/60" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold">Preview not available</p>
                      <p className="text-sm text-white/60 mt-1">Download the file to view its content.</p>
                    </div>
                    <a
                      href={previewFile?.url}
                      download={previewFile?.name}
                      className="inline-flex items-center gap-2 px-8 py-3 bg-white text-black rounded-2xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      <Download className="w-4 h-4" /> Download File
                    </a>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
        </TabsContent>

        {(canRequestSubsidiary || canApproveSubsidiary) && (
          <TabsContent value="subsidiary" className="space-y-4">
            <Card className="overflow-hidden rounded-2xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/10">
              <CardHeader className="bg-[#FFFDF7] border-b border-black/5">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base tracking-tight">Subsidiary account requests</CardTitle>
                </div>
                <CardDescription className="text-slate-600">
                  Maker-checker: a different admin than the requester must approve or reject each request.
                </CardDescription>
                <div className="relative w-full sm:w-72 pt-2">
                  <Search className="absolute left-3 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    placeholder="Search by merchant name..."
                    className="h-10 rounded-2xl border-black/10 bg-white pl-9"
                    value={subsidiarySearch}
                    onChange={(e) => setSubsidiarySearch(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredSubsidiaryRequests.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                    No subsidiary account requests found.
                  </div>
                ) : (
                  <div className="divide-y divide-black/5">
                    {filteredSubsidiaryRequests.map((req) => {
                      const isOwnRequest = req.makerId === user?.id
                      const isActing = subsidiaryActionId === req.id
                      return (
                        <div key={req.id} className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{req.merchant.name}</p>
                              {getRequestStatusBadge(req.status)}
                            </div>
                            <p className="text-xs font-mono text-slate-600">
                              {req.previousAccountNumber ? `${req.previousAccountNumber} → ` : ""}
                              <span className="font-bold text-slate-900">{req.requestedAccountNumber}</span>
                            </p>
                            <p className="text-xs text-slate-500">{req.reason || "No reason provided."}</p>
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">
                              Requested by {req.maker.name || req.maker.email}
                            </p>
                          </div>

                          {req.status === 'PENDING' && (
                            isOwnRequest ? (
                              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs font-medium">
                                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                Maker-Checker: you submitted this request and cannot approve it.
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-9 rounded-2xl border-black/10 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                                  disabled={!canApproveSubsidiary || isActing}
                                  onClick={() => handleSubsidiaryDecision(req, 'reject')}
                                >
                                  {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Reject'}
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-9 rounded-2xl"
                                  disabled={!canApproveSubsidiary || isActing}
                                  onClick={() => handleSubsidiaryDecision(req, 'approve')}
                                >
                                  {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Approve'}
                                </Button>
                              </div>
                            )
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canApproveEligibility && (
          <TabsContent value="eligibility" className="space-y-4">
            <Card className="overflow-hidden rounded-2xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/10">
              <CardHeader className="bg-[#FFFDF7] border-b border-black/5">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base tracking-tight">Eligible customer imports</CardTitle>
                </div>
                <CardDescription className="text-slate-600">
                  Merchants import a phone-number allowlist here; approving one restricts that merchant's
                  Push, Payment Link, and QR payments to only these customers.
                </CardDescription>
                <div className="relative w-full sm:w-72 pt-2">
                  <Search className="absolute left-3 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    placeholder="Search by merchant name..."
                    className="h-10 rounded-2xl border-black/10 bg-white pl-9"
                    value={eligibilitySearch}
                    onChange={(e) => setEligibilitySearch(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredEligibilityRequests.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                    No eligible customer requests found.
                  </div>
                ) : (
                  <div className="divide-y divide-black/5">
                    {filteredEligibilityRequests.map((req) => {
                      const isActing = eligibilityActionId === req.id
                      return (
                        <div key={req.id} className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-900">{req.merchant.name}</p>
                              {getRequestStatusBadge(req.status)}
                              <Badge
                                variant="outline"
                                className={req.type === 'REMOVAL'
                                  ? 'text-rose-600 border-rose-200 bg-rose-50'
                                  : 'text-blue-600 border-blue-200 bg-blue-50'}
                              >
                                {req.type === 'REMOVAL' ? 'Removal' : 'Import'}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-600">
                              {req.fileName ?? 'Removal request'} —{' '}
                              <span className="font-bold text-slate-900">{req.totalRows}</span> customer(s)
                            </p>
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">
                              Submitted by {req.submitter.name || req.submitter.email} on{" "}
                              {new Date(req.createdAt).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 rounded-2xl border-black/10 bg-white hover:bg-amber-50/50"
                              onClick={() => openViewList(req)}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1.5" /> View List
                            </Button>
                            {req.status === 'PENDING' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-9 rounded-2xl border-black/10 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                                  disabled={isActing}
                                  onClick={() => handleEligibilityDecision(req, 'reject')}
                                >
                                  {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Reject'}
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-9 rounded-2xl"
                                  disabled={isActing}
                                  onClick={() => handleEligibilityDecision(req, 'approve')}
                                >
                                  {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Approve'}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={isViewListOpen} onOpenChange={setIsViewListOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <ListChecks className="w-5 h-5 text-primary" />
              {viewListRequest?.merchant.name} — Eligible Customers
              {viewListRequest && getRequestStatusBadge(viewListRequest.status)}
            </DialogTitle>
            <DialogDescription>
              {viewListRequest?.totalRows} phone number(s) {viewListRequest?.type === 'REMOVAL' ? 'requested for removal' : 'submitted for approval'}.
            </DialogDescription>
          </DialogHeader>
          {!isViewListLoading && viewListPhones.length > 10 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={viewListSearch}
                onChange={(e) => setViewListSearch(e.target.value)}
                placeholder="Search phone number..."
                className="h-10 rounded-2xl pl-9"
              />
            </div>
          )}
          {isViewListLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-xl border border-black/5 divide-y divide-black/5">
              {filteredViewListPhones.map((phone) => (
                <div key={phone} className="px-4 py-2 text-sm font-mono text-slate-800">
                  {phone}
                </div>
              ))}
            </div>
          )}
          {viewListRequest && viewListRequest.status === 'PENDING' && (
            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-2xl border-black/10 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                disabled={eligibilityActionId === viewListRequest.id}
                onClick={() => handleEligibilityDecision(viewListRequest, 'reject')}
              >
                Reject
              </Button>
              <Button
                className="rounded-2xl"
                disabled={eligibilityActionId === viewListRequest.id}
                onClick={() => handleEligibilityDecision(viewListRequest, 'approve')}
              >
                Approve
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function MerchantReviewPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <MerchantReviewContent />
    </Suspense>
  )
}
