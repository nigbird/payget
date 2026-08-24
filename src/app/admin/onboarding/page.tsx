"use client"

import { Suspense, useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Loader2,
  UserPlus,
  Globe,
  Building2,
  User,
  Phone,
  MapPin,
  Link as LinkIcon,
  FileText,
  Upload,
  X,
  FileCheck,
  History,
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit2,
  ShieldCheck,
  CheckCircle,
  Mail,
  TrendingUp,
  Search,
  Eye,
  ShieldAlert,
  Lock,
  Plus,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowRight,
  SlidersHorizontal,
  CreditCard,
  Store,
  Download,
  MessageSquare,
  MoreVertical,
  Landmark,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { MerchantDocument, Merchant } from "@/lib/db"
import { useAuth } from "@/lib/auth-context"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { normalizePhoneNumber, isValidEmail, isValidPhoneNumber } from "@/lib/utils"
import {
  sanitizeAccountNumberInput,
  getAccountNumberValidationError,
  sanitizeSubsidiaryAccountNumberInput,
  getSubsidiaryAccountNumberValidationError,
} from "@/lib/account-number"

function MerchantOnboardingContent() {
  const { user: session } = useAuth()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const editMerchantIdParam = searchParams.get("editMerchantId")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [registrationId] = useState(() => crypto.randomUUID())
  const [systemConfig, setSystemConfig] = useState<any>({
    districts: [],
    branches: [],
    allowedFileTypes: [],
    maxFileSizeMB: 5
  })
  const [categories, setCategories] = useState<{ name: string; code?: string; active: boolean }[]>([])
  const [businessTypes, setBusinessTypes] = useState<{ name: string; code?: string; active: boolean }[]>([])
  const [submissions, setSubmissions] = useState<Merchant[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false)
  const [editingMerchantId, setEditingMerchantId] = useState<string | null>(null)
  const [editingOriginalContactUsername, setEditingOriginalContactUsername] = useState<string | null>(null)
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)
  const [selectedForReview, setSelectedForReview] = useState<Merchant | null>(null)
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
  const [selectedForSubsidiary, setSelectedForSubsidiary] = useState<Merchant | null>(null)
  const [isSubsidiaryDialogOpen, setIsSubsidiaryDialogOpen] = useState(false)
  const [subsidiaryLoading, setSubsidiaryLoading] = useState(false)
  const [subsidiarySubmitting, setSubsidiarySubmitting] = useState(false)
  const [subsidiaryCurrent, setSubsidiaryCurrent] = useState<string | null>(null)
  const [subsidiaryPendingRequest, setSubsidiaryPendingRequest] = useState<{
    requestedAccountNumber: string
    maker: { name: string | null; email: string | null }
  } | null>(null)
  const [subsidiaryForm, setSubsidiaryForm] = useState({ accountNumber: "", reason: "" })
  const [subsidiaryFieldErrors, setSubsidiaryFieldErrors] = useState<Record<string, string>>({})
  const [limits, setLimits] = useState({
    dailyLimit: "10000",
    transactionLimit: "1000",
    dailyCountLimit: "100"
  })
  const [limitErrors, setLimitErrors] = useState<Record<string, string>>({})
  const [resendLoadingId, setResendLoadingId] = useState<string | null>(null)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const sanitizeLimitInput = (value: string): string => {
    // Strip non-numeric characters except a single decimal point
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

  const handleFormLimitChange = (field: keyof typeof formData, value: string) => {
    const sanitized = sanitizeLimitInput(value)
    setFormData(prev => ({ ...prev, [field]: sanitized }))
    setErrors(prev => ({ ...prev, [field]: validateLimit(sanitized) || '' }))
  }
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null)

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    accountNumber: "",
    logoUrl: "",
    businessDescription: "",
    websiteUrl: "",
    callbackUrl: "",
    contactName: "",
    contactUsername: "",
    branchName: "",
    district: "",
    category: "",
    businessType: "",
    dailyLimit: "10000",
    transactionLimit: "1000",
    dailyCountLimit: "100"
  })

  // Sync organization details from session when modal opens
  useEffect(() => {
    if (isRegisterDialogOpen && session) {
      const user = session as any
      setFormData(prev => ({
        ...prev,
        district: user.isHeadOffice ? "Head Office" : (user.district || ""),
        branchName: user.isHeadOffice ? "Head Office" : (user.branch || "")
      }))
    }
  }, [isRegisterDialogOpen, session])
  
  const [documents, setDocuments] = useState<MerchantDocument[]>([])
  const [riskFactors, setRiskFactors] = useState<string[]>([])
  const openEditForm = (merchant: Merchant) => {
    if (!merchant.createdBy) return
    setEditingMerchantId(merchant.id)
    setEditingOriginalContactUsername(merchant.contactUsername || null)
    setFormData({
      name: merchant.name || "",
      email: merchant.email || "",
      accountNumber: merchant.accountNumber || "",
      logoUrl: merchant.logoUrl || "",
      businessDescription: merchant.businessDescription || "",
      websiteUrl: merchant.websiteUrl || "",
      callbackUrl: merchant.callbackUrl || "",
      contactName: merchant.contactName || "",
      contactUsername: merchant.contactUsername || "",
      branchName: merchant.branchName || "",
      district: merchant.district || "",
      category: merchant.category || "",
      businessType: merchant.businessType || "",
      dailyLimit: String(merchant.dailyLimit ?? "10000"),
      transactionLimit: String(merchant.transactionLimit ?? "1000"),
      dailyCountLimit: String(merchant.dailyCountLimit ?? "100"),
    })
    setDocuments(merchant.documents || [])
    setRiskFactors(merchant.riskFactors || [])
    setErrors({})
    setIsRegisterDialogOpen(true)
  }


  const userPermissions = session?.permissions || []
  const canRegister = userPermissions.includes('MERCHANT_REGISTER')
  const canSetLimits = userPermissions.includes('TRANSACTION_LIMIT_SET') || userPermissions.includes('TRANSACTION_LIMIT_OVERRIDE')
  const canApprove = userPermissions.includes('MERCHANT_APPROVE')
  const canRequestSubsidiary = userPermissions.includes('SUBSIDIARY_ACCOUNT_REQUEST')

  const openSubsidiaryDialog = async (merchant: Merchant) => {
    setSelectedForSubsidiary(merchant)
    setSubsidiaryForm({ accountNumber: "", reason: "" })
    setSubsidiaryFieldErrors({})
    setSubsidiaryCurrent(null)
    setSubsidiaryPendingRequest(null)
    setIsSubsidiaryDialogOpen(true)
    setSubsidiaryLoading(true)
    try {
      const res = await fetch(`/api/merchants/${merchant.id}/subsidiary-account`)
      if (res.ok) {
        const data = await res.json()
        setSubsidiaryCurrent(data.subsidiaryAccountNumber ?? null)
        setSubsidiaryPendingRequest(data.pendingRequest ?? null)
      }
    } catch {
      toast({ variant: 'destructive', title: 'Failed to load subsidiary account status' })
    } finally {
      setSubsidiaryLoading(false)
    }
  }

  const handleSubsidiaryAccountChange = (value: string) => {
    const sanitized = sanitizeSubsidiaryAccountNumberInput(value)
    setSubsidiaryForm(prev => ({ ...prev, accountNumber: sanitized }))
    setSubsidiaryFieldErrors(prev => ({ ...prev, requestedAccountNumber: '' }))
  }

  const submitSubsidiaryRequest = async () => {
    if (!selectedForSubsidiary) return
    const errors: Record<string, string> = {}
    const accountError = getSubsidiaryAccountNumberValidationError(subsidiaryForm.accountNumber)
    if (accountError) errors.requestedAccountNumber = accountError

    setSubsidiaryFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubsidiarySubmitting(true)
    try {
      const res = await fetch(`/api/merchants/${selectedForSubsidiary.id}/subsidiary-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_request',
          requestedAccountNumber: subsidiaryForm.accountNumber,
          reason: subsidiaryForm.reason.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.errors) setSubsidiaryFieldErrors(data.errors)
        throw new Error(data.error || 'Failed to submit request')
      }
      toast({
        title: 'Request submitted',
        description: 'A different admin must approve this before it takes effect.',
      })
      setIsSubsidiaryDialogOpen(false)
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Request failed', description: error.message })
    } finally {
      setSubsidiarySubmitting(false)
    }
  }

  const handleResendSetupLink = async (merchantId: string) => {
    setResendLoadingId(merchantId)
    try {
      const response = await fetch(`/api/merchants/${merchantId}/resend-setup`, {
        method: 'POST'
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Unable to resend setup link')
      }

      const result = await response.json()
      toast({
        title: 'Setup Link Sent',
        description: result.message || 'A new setup link was sent to the merchant.'
      })
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Resend Failed',
        description: error.message
      })
    } finally {
      setResendLoadingId(null)
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [configRes, merchantRes, masterDataRes] = await Promise.all([
          fetch('/api/system-config'),
          fetch('/api/merchants'),
          fetch('/api/master-data')
        ])

        if (configRes.ok) setSystemConfig(await configRes.json())
        if (merchantRes.ok) setSubmissions(await merchantRes.json())
        if (masterDataRes.ok) {
          const masterData = await masterDataRes.json()
          setCategories(masterData.categories || [])
          setBusinessTypes(masterData.businessTypes || [])
        }
      } catch (error) {
        console.error('Failed to fetch data:', error)
      }
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (!editMerchantIdParam || submissions.length === 0) return
    const merchant = submissions.find((m) => m.id === editMerchantIdParam)
    if (merchant && merchant.createdBy) {
      openEditForm(merchant)
    }
  }, [editMerchantIdParam, submissions])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    if (id === "accountNumber") {
      setFormData((prev) => ({
        ...prev,
        accountNumber: sanitizeAccountNumberInput(value),
      }))
      return
    }
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (id: string, value: string) => {
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024
    const MAX_TOTAL_BYTES = 15 * 1024 * 1024
    
    let currentTotalSize = documents.reduce((sum, doc) => sum + doc.size, 0)
    const validFiles: File[] = []
    
    for (const file of Array.from(files)) {
      if (file.size > MAX_SINGLE_FILE_BYTES) {
        toast({ variant: "destructive", title: "File Too Large", description: `${file.name} exceeds 5MB.` })
        continue
      }
      if (currentTotalSize + file.size > MAX_TOTAL_BYTES) {
        toast({ variant: "destructive", title: "Limit Exceeded", description: "Total compliance files cannot exceed 15MB." })
        break
      }
      currentTotalSize += file.size
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    try {
      const fd = new FormData()
      validFiles.forEach(file => fd.append("files", file))
      
      const res = await fetch("/api/uploads/compliance-docs", { method: "POST", headers: { "X-Registration-Id": registrationId }, body: fd })
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.error || "Upload failed")
      
      setDocuments(prev => [...prev, ...data.documents])
      toast({ title: "Files Uploaded", description: `${validFiles.length} document(s) added.` })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: error.message })
    }
  }

  const handleRemoveDoc = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id))
  }

  const handleLogoUpload = async (file: File) => {
    setIsLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/uploads/merchant-logo", { method: "POST", headers: { "X-Registration-Id": registrationId }, body: fd })
      
      const contentType = res.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid server response. Please try again later.")
      }

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || "Logo upload failed")
      }
      setFormData((prev) => ({ ...prev, logoUrl: data.url }))
      toast({ title: "Logo uploaded", description: "Merchant logo has been attached to this onboarding." })
    } catch (e: any) {
      toast({ variant: "destructive", title: "Upload failed", description: e?.message || "Could not upload logo." })
    } finally {
      setIsLogoUploading(false)
    }
  }

  const handleInitialReview = async (id: string) => {
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/merchants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyLimit: Number(limits.dailyLimit),
          transactionLimit: Number(limits.transactionLimit),
          dailyCountLimit: Number(limits.dailyCountLimit),
          status: 'branch_approved'
        })
      })

      if (response.ok) {
        toast({
          title: "Limits Assigned",
          description: "Initial compliance review complete. Merchant is now in the activation queue."
        })
        setIsReviewDialogOpen(false)
        setSelectedForReview(null)
        // Refresh
        const res = await fetch('/api/merchants')
        if (res.ok) setSubmissions(await res.json())
      } else {
        const err = await response.json()
        throw new Error(err.error || 'Failed to update')
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Review Error",
        description: error.message
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    setErrors({})
    
    // Client-side validation
    const newErrors: Record<string, string> = {}
    
    if (!formData.name?.trim()) newErrors.name = "Business name is required"
    if (!formData.email?.trim()) {
      newErrors.email = "Business email is required"
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = "Invalid email format"
    }
    
    if (!formData.contactName?.trim()) newErrors.contactName = "Contact name is required"
    if (!formData.contactUsername?.trim()) {
      newErrors.contactUsername = "Contact username (email or phone) is required"
    } else {
      const isEmail = isValidEmail(formData.contactUsername)
      const isPhone = isValidPhoneNumber(formData.contactUsername)
      
      if (!isEmail && !isPhone) {
        newErrors.contactUsername = "Please enter a valid email or phone number"
      } else {
        const contactChanged = !editingMerchantId || formData.contactUsername !== editingOriginalContactUsername
        if (contactChanged) {
          // Check uniqueness only when creating or changing contact username.
          const checkUniqueRes = await fetch('/api/users/check-unique', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: formData.contactUsername })
          })
          const uniqueData = await checkUniqueRes.json()
          if (!uniqueData.isUnique) {
            newErrors.contactUsername = uniqueData.message
          }
        }
      }
    }

    if (!formData.category) newErrors.category = "Industry category is required"
    if (!formData.businessType) newErrors.businessType = "Business type is required"
    const accountNumberError = getAccountNumberValidationError(formData.accountNumber)
    if (accountNumberError) newErrors.accountNumber = accountNumberError

    if (documents.length === 0) {
      newErrors.documents = "Please upload at least one compliance document"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please correct the errors in the form."
      })
      return
    }

    setIsSubmitting(true)
    try {
      // Normalize phone number if contactUsername is a phone number
      const finalFormData = { ...formData }
      if (isValidPhoneNumber(finalFormData.contactUsername) && !isValidEmail(finalFormData.contactUsername)) {
        finalFormData.contactUsername = normalizePhoneNumber(finalFormData.contactUsername)
      }

      const payload = {
        ...finalFormData,
        dailyLimit: Number(formData.dailyLimit),
        transactionLimit: Number(formData.transactionLimit),
        dailyCountLimit: Number(formData.dailyCountLimit),
        documents,
        riskFactors
      }

      const response = await fetch(editingMerchantId ? `/api/merchants/${editingMerchantId}` : '/api/merchants', {
        method: editingMerchantId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingMerchantId
            ? payload
            : { ...payload, status: 'pending' }
        )
      })

      if (response.ok) {
        toast({
          title: editingMerchantId ? "Application Updated" : "Application Submitted",
          description: editingMerchantId
            ? "Merchant application form updated successfully."
            : "The merchant onboarding request has been queued for review."
        })
        // Reset form
        setFormData({
          name: "", email: "", accountNumber: "", businessDescription: "",
          logoUrl: "",
          websiteUrl: "", callbackUrl: "", contactName: "", contactUsername: "",
          branchName: "", district: "", category: "", businessType: "",
          dailyLimit: "10000", transactionLimit: "1000", dailyCountLimit: "100"
        })
        setDocuments([])
        setRiskFactors([])
        setErrors({})
        setEditingMerchantId(null)
        setEditingOriginalContactUsername(null)
        
        // Refresh submissions
        const res = await fetch('/api/merchants')
        if (res.ok) setSubmissions(await res.json())
        setIsRegisterDialogOpen(false)
      } else {
        const result = await response.json()
        if (result.errors) {
          setErrors(result.errors)
          toast({
            variant: "destructive",
            title: "Validation Failed",
            description: "Some fields are invalid. Please check the form."
          })
        } else {
          throw new Error(result.error || 'Failed to submit')
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Submission Error",
        description: error.message
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredSubmissions = submissions.filter(s => {
    // Visibility Constraint: Self-registered merchants (createdBy === null)
    // should only appear here AFTER they are approved.
    const isSelfRegistered = !s.createdBy;
    const isApproved = s.status === 'approved' || s.status === 'active';
    if (isSelfRegistered && !isApproved) return false;

    const query = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query);
  })

  const totalPages = Math.ceil(filteredSubmissions.length / itemsPerPage)
  const paginatedSubmissions = filteredSubmissions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium gap-1.5"><CheckCircle className="w-3 h-3" /> Approved</Badge>
      case 'active':
        return <Badge className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium gap-1.5"><CheckCircle className="w-3 h-3" /> Active</Badge>
      case 'branch_approved':
        return <Badge className="rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium gap-1.5"><ShieldCheck className="w-3 h-3" /> Initial Review OK</Badge>
      case 'pending':
        return <Badge className="rounded-full bg-amber-50 text-amber-800 border border-amber-100 font-medium gap-1.5"><Clock className="w-3 h-3" /> Pending</Badge>
      case 'rejected':
        return <Badge className="rounded-full bg-rose-50 text-rose-700 border border-rose-100 font-medium gap-1.5"><AlertCircle className="w-3 h-3" /> Rejected</Badge>
      case 'rejected_with_update':
        return <Badge className="rounded-full bg-amber-100 text-amber-900 border border-amber-200 font-medium gap-1.5"><MessageSquare className="w-3 h-3" /> Update Requested</Badge>
      case 'resubmitted':
        return <Badge className="rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium gap-1.5"><ArrowRight className="w-3 h-3" /> Resubmitted</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/25 bg-white/30 backdrop-blur-xl shadow-sm shadow-amber-950/10">
        <div className="relative overflow-hidden rounded-2xl px-5 py-4">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(244,219,159,0.55),rgba(248,181,19,0.28),rgba(117,67,25,0.18))]" />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-700">
                <Link href="/admin" className="hover:text-slate-900 transition-colors">Admin</Link>
                <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                <span className="font-medium text-slate-800">Merchant onboarding</span>
              </div>
              <h2 className="truncate text-lg font-semibold tracking-tight text-slate-950">Merchant onboarding</h2>
              <p className="text-sm text-slate-700/80">Lightweight queue management with high readability.</p>
            </div>

            <Dialog
              open={isRegisterDialogOpen}
              onOpenChange={(open) => {
                setIsRegisterDialogOpen(open)
                if (!open) {
                  setEditingMerchantId(null)
                  setEditingOriginalContactUsername(null)
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Register merchant
                </Button>
              </DialogTrigger>
                  <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto border border-[#eddcc0] bg-[#fffdf8] p-0 rounded-[32px] shadow-2xl">
                    <DialogHeader className="relative overflow-hidden p-8 border-b border-[#eadcc4]/40 flex flex-col">
                      {/* Subtle Background Accent */}
                      <div className="absolute -right-4 -top-8 opacity-[0.03] pointer-events-none">
                        <svg width="160" height="160" viewBox="0 0 100 100" fill="currentColor" className="text-[#754319]">
                          <path d="M50 5L89 27.5V72.5L50 95L11 72.5V27.5L50 5Z" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </div>

                      <div className="flex flex-col gap-4 relative z-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-[#fff8ea] to-[#fdf2d9] border border-[#f4db9f]/30 shadow-sm w-fit">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#f8b513] animate-pulse" />
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#754319]/80">
                            {editingMerchantId ? "Merchant Application Edit" : "Merchant Registration"}
                          </span>
                        </div>

                        <div>
                          <DialogTitle className="text-3xl font-black tracking-tight text-gray-900 font-headline flex items-center gap-3">
                            <Store className="w-8 h-8 text-[#f8b513]" />
                            {editingMerchantId ? "Edit Merchant Application" : "Register New Merchant"}
                          </DialogTitle>
                          <DialogDescription className="text-sm text-gray-500 font-medium mt-1">
                            {editingMerchantId
                              ? "Update merchant details before final approval."
                              : "Provide legal entity details and compliance documents to initiate the onboarding process."}
                          </DialogDescription>
                        </div>
                      </div>
                    </DialogHeader>

                    <div className="p-8">
                    {!canRegister ? (
                      <Card className="border-rose-100 bg-rose-50/50 shadow-sm rounded-3xl">
                        <CardContent className="pt-8 flex flex-col items-center text-center gap-4">
                          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-rose-100">
                            <Lock className="w-8 h-8 text-rose-600" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-rose-900">Registration Restricted</h3>
                            <p className="text-rose-700/80 max-w-md text-sm mt-1">
                              Your account does not have the necessary permissions to register new merchants. Please contact your system administrator.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-8">
                          {/* Business Information Section */}
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                                <Building2 className="h-5 w-5 text-[#754319]" />
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Company Profile</h3>
                                <p className="text-xs text-gray-400">Basic information about the legal entity</p>
                              </div>
                            </div>

                            <div className="grid gap-6">
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-gray-700">Merchant Logo</Label>
                                <div className="flex items-center gap-4">
                                  <div 
                                    className="flex-1 border-2 border-dashed border-[#eadcc4] rounded-xl p-4 text-center cursor-pointer hover:bg-[#fffcf5] transition-colors"
                                    onClick={() => logoInputRef.current?.click()}
                                  >
                                    <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                                    <p className="text-xs font-medium text-gray-600">
                                      {isLogoUploading ? "Uploading..." : "Click to upload logo"}
                                    </p>
                                    <input
                                      type="file"
                                      ref={logoInputRef}
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0]
                                        if (f) void handleLogoUpload(f)
                                      }}
                                    />
                                  </div>
                                  {formData.logoUrl && (
                                    <div className="relative group w-16 h-16 rounded-xl border border-[#eadcc4] overflow-hidden bg-white flex items-center justify-center p-2 shadow-sm">
                                      <img src={formData.logoUrl} alt="Preview" className="max-w-full max-h-full object-contain" />
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setFormData(prev => ({ ...prev, logoUrl: "" }));
                                        }}
                                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <p className="text-[10px] text-gray-400 italic">Optional. Recommended size: 512x512px.</p>
                              </div>

                              <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                  <Label htmlFor="name" className="text-sm font-medium text-gray-700">Business Name</Label>
                                  <Input 
                                    id="name" 
                                    placeholder="Legal Entity Name" 
                                    value={formData.name} 
                                    onChange={handleInputChange} 
                                    maxLength={50}
                                    className={`h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all ${errors.name ? "border-red-500" : ""}`}
                                  />
                                  {errors.name && <p className="text-[10px] text-red-500 font-medium">{errors.name}</p>}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">Business Email</Label>
                                  <Input 
                                    id="email" 
                                    type="email" 
                                    placeholder="contact@business.com" 
                                    value={formData.email} 
                                    onChange={handleInputChange} 
                                    maxLength={50}
                                    className={`h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all ${errors.email ? "border-red-500" : ""}`}
                                  />
                                  {errors.email && <p className="text-[10px] text-red-500 font-medium">{errors.email}</p>}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="businessDescription" className="text-sm font-medium text-gray-700">
                                  Business Description 
                                  <span className="text-[10px] ml-2 font-bold text-slate-400">
                                    ({formData.businessDescription.trim().split(/\s+/).filter(Boolean).length}/50 words, max 500 chars)
                                  </span>
                                </Label>
                                <div className="relative">
                                  <Textarea
                                    id="businessDescription"
                                    placeholder="Describe the nature of business and products sold..."
                                    className={`min-h-[120px] rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all ${errors.businessDescription ? "border-red-500" : ""}`}
                                    value={formData.businessDescription}
                                    maxLength={500}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const words = val.trim().split(/\s+/).filter(Boolean);
                                      if (words.length <= 50 || val.length < formData.businessDescription.length) {
                                        setFormData({...formData, businessDescription: val});
                                      }
                                    }}
                                  />
                                </div>
                                {errors.businessDescription && <p className="text-[10px] text-red-500 font-medium">{errors.businessDescription}</p>}
                              </div>

                              <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium text-gray-700">Industry Category</Label>
                                  <Select onValueChange={(v) => handleSelectChange('category', v)} value={formData.category}>
                                    <SelectTrigger className={`h-11 rounded-xl border-gray-200 ${errors.category ? "border-red-500" : ""}`}>
                                      <SelectValue placeholder="Select Category" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-[#eddcc0]">
                                      {categories.filter(c => c.active).map((cat, i) => (
                                        <SelectItem key={i} value={cat.name}>{cat.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {errors.category && <p className="text-[10px] text-red-500 font-medium">{errors.category}</p>}
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium text-gray-700">Business Type</Label>
                                  <Select onValueChange={(v) => handleSelectChange('businessType', v)} value={formData.businessType}>
                                    <SelectTrigger className={`h-11 rounded-xl border-gray-200 ${errors.businessType ? "border-red-500" : ""}`}>
                                      <SelectValue placeholder="Select Type" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-[#eddcc0]">
                                      {businessTypes.filter(bt => bt.active).map((bt, i) => (
                                        <SelectItem key={i} value={bt.name}>{bt.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {errors.businessType && <p className="text-[10px] text-red-500 font-medium">{errors.businessType}</p>}
                                </div>
                              </div>
                            </div>
                          </div>

                          <Separator className="bg-[#eadcc4]/40" />

                          {/* Primary Contact Section */}
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                                <User className="h-5 w-5 text-[#754319]" />
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Primary Contact</h3>
                                <p className="text-xs text-gray-400">Account management and communications</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <Label htmlFor="contactName" className="text-sm font-medium text-gray-700">Full Name</Label>
                                <Input 
                                  id="contactName" 
                                  placeholder="Abebe Kebede" 
                                  value={formData.contactName} 
                                  onChange={handleInputChange} 
                                  maxLength={50}
                                  className={`h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all ${errors.contactName ? "border-red-500" : ""}`}
                                />
                                {errors.contactName && <p className="text-[10px] text-red-500 font-medium">{errors.contactName}</p>}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="contactUsername" className="text-sm font-medium text-gray-700">Email or Phone</Label>
                                <Input 
                                  id="contactUsername" 
                                  placeholder="email@example.com or 0912345678" 
                                  value={formData.contactUsername} 
                                  onChange={handleInputChange} 
                                  maxLength={50}
                                  className={`h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all ${errors.contactUsername ? "border-red-500" : ""}`}
                                />
                                {errors.contactUsername && <p className="text-[10px] text-red-500 font-medium">{errors.contactUsername}</p>}
                              </div>
                            </div>
                          </div>

                          <Separator className="bg-[#eadcc4]/40" />

                          {/* Technical & Financial Section */}
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                                <Globe className="h-5 w-5 text-[#754319]" />
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Financial & Technical</h3>
                                <p className="text-xs text-gray-400">Payout details and integration settings</p>
                              </div>
                            </div>

                            <div className="grid gap-6">
                              <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                  <Label htmlFor="accountNumber" className="text-sm font-medium text-gray-700">Payout Account #</Label>
                                  <div className="relative">
                                    <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <Input 
                                      id="accountNumber" 
                                      inputMode="numeric"
                                      placeholder="7000123456789" 
                                      value={formData.accountNumber} 
                                      onChange={handleInputChange} 
                                      maxLength={13}
                                      className={`h-11 rounded-xl border-gray-200 pl-10 focus:ring-primary/20 focus:border-primary transition-all ${errors.accountNumber ? "border-red-500" : ""}`}
                                    />
                                  </div>
                                  {errors.accountNumber && <p className="text-[10px] text-red-500 font-medium">{errors.accountNumber}</p>}
                                  <p className="text-[10px] text-gray-400">Must start with 7000, digits only, exactly 13 characters.</p>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="websiteUrl" className="text-sm font-medium text-gray-700">Website URL (Optional)</Label>
                                  <div className="relative">
                                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <Input 
                                      id="websiteUrl" 
                                      placeholder="https://..." 
                                      value={formData.websiteUrl} 
                                      onChange={handleInputChange} 
                                      maxLength={255}
                                      className={`h-11 rounded-xl border-gray-200 pl-10 focus:ring-primary/20 focus:border-primary transition-all ${errors.websiteUrl ? "border-red-500" : ""}`}
                                    />
                                  </div>
                                  {errors.websiteUrl && <p className="text-[10px] text-red-500 font-medium">{errors.websiteUrl}</p>}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="callbackUrl" className="text-sm font-medium text-gray-700">Webhook Callback URL (Optional)</Label>
                                <div className="relative">
                                  <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                  <Input 
                                    id="callbackUrl" 
                                    placeholder="https://api.merchant.com/webhook" 
                                    value={formData.callbackUrl} 
                                    onChange={handleInputChange} 
                                    maxLength={255}
                                    className={`h-11 rounded-xl border-gray-200 pl-10 focus:ring-primary/20 focus:border-primary transition-all ${errors.callbackUrl ? "border-red-500" : ""}`}
                                  />
                                </div>
                                {errors.callbackUrl && <p className="text-[10px] text-red-500 font-medium">{errors.callbackUrl}</p>}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-8">
                          {/* Organization Section */}
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                                <MapPin className="h-5 w-5 text-[#754319]" />
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Organization</h3>
                                <p className="text-xs text-gray-400">Assigned processing hub</p>
                              </div>
                            </div>

                            <Card className="border-[#eddcc0] bg-white/50 rounded-2xl overflow-hidden shadow-sm">
                              <CardContent className="p-5 space-y-4">
                                {formData.district === "Head Office" ? (
                                  <div className="space-y-2">
                                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-tight">Processing Center</Label>
                                    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-br from-[#fff8ea] to-[#fdf2d9] border border-[#f4db9f]/30">
                                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
                                        <Building2 className="h-4 w-4 text-[#754319]" />
                                      </div>
                                      <span className="text-sm font-bold text-[#754319]">Head Office</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label className="text-xs font-bold text-gray-500 uppercase tracking-tight">District</Label>
                                      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
                                          <Globe className="h-4 w-4 text-gray-400" />
                                        </div>
                                        <span className="text-sm font-bold text-gray-700">{formData.district}</span>
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-xs font-bold text-gray-500 uppercase tracking-tight">Branch</Label>
                                      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
                                          <Building2 className="h-4 w-4 text-gray-400" />
                                        </div>
                                        <span className="text-sm font-bold text-gray-700">{formData.branchName}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                <p className="text-[10px] text-gray-400 italic text-center px-2">
                                  Organization details are automatically assigned based on your account profile.
                                </p>
                              </CardContent>
                            </Card>
                          </div>

                          {/* Documentation Section */}
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                                <FileText className="h-5 w-5 text-[#754319]" />
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Compliance</h3>
                                <p className="text-xs text-gray-400">Required legal documents</p>
                              </div>
                            </div>

                            <div 
                              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer hover:bg-[#fffcf5] transition-all group ${errors.documents ? 'border-red-500 bg-red-50/10' : 'border-[#eadcc4]'}`}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-[#eadcc4] mx-auto mb-3 group-hover:scale-110 transition-transform">
                                <Upload className="w-6 h-6 text-gray-400" />
                              </div>
                              <p className="text-sm font-bold text-gray-700">Upload documents</p>
                              <p className="text-[10px] text-gray-400 mt-1 px-4">
                                Max {systemConfig.maxFileSizeMB}MB per file.
                              </p>
                              <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                multiple
                                onChange={handleFileUpload}
                              />
                            </div>
                            {errors.documents && <p className="text-[10px] text-red-500 font-medium text-center">{errors.documents}</p>}

                            {documents.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {documents.map(doc => (
                                  <div key={doc.id} className="group relative flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 text-xs shadow-sm hover:border-[#f8b513]/30 transition-all">
                                    <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden border border-gray-100">
                                      {doc.type?.startsWith('image/') && doc.url ? (
                                        <img src={doc.url} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full bg-emerald-50 flex items-center justify-center">
                                          <FileCheck className="w-4 h-4 text-emerald-600" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="truncate font-medium text-gray-700">{doc.name}</p>
                                      <p className="text-[10px] text-gray-400">{(doc.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg hover:bg-amber-50 hover:text-amber-600 transition-all"
                                        onClick={() => setPreviewFile({ url: doc.url, name: doc.name, type: doc.type })}
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all"
                                        onClick={() => handleRemoveDoc(doc.id)}
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {riskFactors.length > 0 && (
                            <div className="p-5 rounded-2xl bg-rose-50 border border-rose-100 space-y-3">
                              <div className="flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-rose-600" />
                                <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Risk Analysis</span>
                              </div>
                              <div className="space-y-1.5">
                                {riskFactors.map((rf, idx) => (
                                  <div key={idx} className="text-[10px] text-rose-700 flex items-center gap-2 font-medium">
                                    <div className="w-1 h-1 rounded-full bg-rose-400" />
                                    {rf}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <Button 
                            className="button-honey-solid w-full h-14 rounded-2xl text-base font-bold shadow-lg shadow-amber-900/20" 
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              editingMerchantId ? "Save Changes" : "Submit for Review"
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  </DialogContent>
                </Dialog>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden rounded-2xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/10">
        <CardHeader className="bg-[#FFFDF7] border-b border-black/5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base tracking-tight">Onboarding queue</CardTitle>
              <CardDescription className="text-slate-600">
                Search, filter, and inspect merchant submissions quickly.
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] hover:bg-white/95">
                      <TableHead className="pl-6 py-4 text-xs font-semibold tracking-wide text-slate-700">Merchant</TableHead>
                      <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Hub / District</TableHead>
                      <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Status</TableHead>
                      <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Submitted</TableHead>
                      <TableHead className="py-4 text-right pr-6 text-xs font-semibold tracking-wide text-slate-700">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSubmissions.map((s) => (
                      <TableRow
                        key={s.id}
                        className="bg-[#FFFDF7] group transition-all duration-200 hover:bg-amber-50/40 hover:shadow-sm hover:-translate-y-[1px]"
                      >
                        <TableCell className="pl-6 py-5 align-middle">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-950">{s.name}</span>
                            <span className="mt-0.5 text-[10px] font-mono uppercase text-slate-500">{s.id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-5 align-middle">
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-slate-800">{s.branchName}</span>
                            <span className="mt-0.5 text-[10px] text-slate-500">{s.district}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-5 align-middle">{getStatusBadge(s.status)}</TableCell>
                        <TableCell className="py-5 align-middle text-xs text-slate-600">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="py-5 align-middle text-right pr-6">
                          <div className="flex items-center justify-end gap-2">
                            {s.status === 'pending' && canSetLimits && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-2xl border-black/10 bg-white hover:bg-amber-50/50 transition-colors"
                                onClick={() => {
                                  setSelectedForReview(s)
                                  setIsReviewDialogOpen(true)
                                }}
                              >
                                Initial Review
                              </Button>
                            )}
                            {s.status === 'approved' && canApprove && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-2xl border-black/10 bg-white hover:bg-amber-50/50 transition-colors"
                                onClick={() => handleResendSetupLink(s.id)}
                                disabled={resendLoadingId === s.id}
                              >
                                {resendLoadingId === s.id ? (
                                  <span className="inline-flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Sending
                                  </span>
                                ) : (
                                  'Resend Link'
                                )}
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 rounded-2xl hover:bg-amber-50/50 transition-colors"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault()
                                    setTimeout(() => {
                                      setSelectedMerchant(s)
                                      setIsDetailsDialogOpen(true)
                                    }, 0)
                                  }}
                                >
                                  <Eye className="w-3.5 h-3.5 mr-2" /> View Details
                                </DropdownMenuItem>
                                {canRequestSubsidiary && (
                                  <DropdownMenuItem
                                    onSelect={(e) => {
                                      e.preventDefault()
                                      setTimeout(() => openSubsidiaryDialog(s), 0)
                                    }}
                                  >
                                    <Landmark className="w-3.5 h-3.5 mr-2" /> Add Subsidiary Account
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {paginatedSubmissions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                          No submissions found in the queue.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-black/5 bg-amber-50/20">
              <div className="text-xs font-medium text-slate-500">
                Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * itemsPerPage, filteredSubmissions.length)}</span> of <span className="text-slate-900 font-bold">{filteredSubmissions.length}</span> results
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                
                <div className="flex items-center gap-1 mx-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = currentPage
                    if (totalPages <= 5) pageNum = i + 1
                    else if (currentPage <= 3) pageNum = i + 1
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                    else pageNum = currentPage - 2 + i

                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        className={`h-8 min-w-[32px] rounded-2xl border-black/10 text-xs font-bold transition-all ${
                          currentPage === pageNum 
                            ? "bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white border-white/30 shadow-sm shadow-amber-950/15" 
                            : "bg-white text-slate-600 hover:bg-amber-50/50"
                        }`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

            <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="border-b pb-4">
                  <DialogTitle className="flex items-center gap-3 text-xl">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{selectedMerchant?.name ?? "Merchant"} Details</p>
                      <p className="text-xs text-muted-foreground font-normal">Submitted on {selectedMerchant?.createdAt ? new Date(selectedMerchant.createdAt).toLocaleString() : "—"}</p>
                    </div>
                  </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-6">
                  {/* Left Column: Core Info & Logo */}
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <Label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Business Logo</Label>
                      <div className="relative group w-full aspect-square max-w-[200px] mx-auto rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden">
                        {selectedMerchant?.logoUrl ? (
                          <>
                            <img 
                              src={selectedMerchant.logoUrl} 
                              alt="Logo" 
                              className="w-full h-full object-contain p-4"
                            />
                            <button 
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              onClick={() => setPreviewFile({ url: selectedMerchant.logoUrl!, name: "Business Logo", type: "image/png" })}
                            >
                              <Eye className="w-6 h-6 text-white" />
                            </button>
                          </>
                        ) : (
                          <div className="text-center p-4">
                            <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-[10px] text-slate-400 font-medium">No logo provided</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-slate-500 font-bold">Merchant ID</Label>
                          <p className="text-sm font-mono font-bold text-slate-900">{selectedMerchant?.id ?? "—"}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-slate-500 font-bold">Status</Label>
                          <div>{selectedMerchant?.status ? getStatusBadge(selectedMerchant.status) : <Badge variant="secondary">—</Badge>}</div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase text-slate-500 font-bold">Registration Path</Label>
                          <p className="text-xs font-bold text-slate-700">{selectedMerchant?.branchName === "Self-Service" ? "Self-Registration Portal" : `Staff: ${selectedMerchant?.branchName}`}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle & Right Columns: Business Details */}
                  <div className="md:col-span-2 space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      {/* Section: Identifiers */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <User className="w-3.5 h-3.5" /> Primary Contact
                        </h4>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Full Name</Label>
                            <p className="text-sm font-bold text-slate-900">{selectedMerchant?.contactName || "—"}</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Username / Login</Label>
                            <p className="text-sm font-bold text-slate-900">{selectedMerchant?.contactUsername || "—"}</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Business Email</Label>
                            <p className="text-sm font-bold text-slate-900">{selectedMerchant?.email || "—"}</p>
                          </div>
                        </div>
                      </div>

                      {/* Section: Professional Info */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <Store className="w-3.5 h-3.5" /> Industry Info
                        </h4>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Industry Category</Label>
                            <p className="text-sm font-bold text-slate-900">{selectedMerchant?.category || "—"}</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Business Type</Label>
                            <p className="text-sm font-bold text-slate-900">{selectedMerchant?.businessType || "—"}</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Hub / Location</Label>
                            <p className="text-sm font-bold text-slate-900">{selectedMerchant?.district || "—"}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Section: Technical & Financial */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5" /> Online Presence
                        </h4>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Website URL</Label>
                            <p className="text-sm font-bold text-blue-600 truncate">
                              <a href={selectedMerchant?.websiteUrl || "#"} target="_blank" className="hover:underline">
                                {selectedMerchant?.websiteUrl || "—"}
                              </a>
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Webhook Callback</Label>
                            <p className="text-sm font-mono text-slate-700 truncate" title={selectedMerchant?.callbackUrl ?? undefined}>
                              {selectedMerchant?.callbackUrl || "—"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <CreditCard className="w-3.5 h-3.5" /> Financial Setup
                        </h4>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Settlement Account</Label>
                            <p className="text-sm font-mono font-bold text-slate-900">{selectedMerchant?.accountNumber || "—"}</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-slate-400 font-bold">Configured Limits</Label>
                            <div className="flex gap-4">
                              <div className="text-center p-2 rounded-lg bg-slate-50 border border-slate-100 flex-1">
                                <p className="text-[9px] uppercase text-slate-400 font-bold">Daily</p>
                                <p className="text-xs font-bold">{selectedMerchant?.dailyLimit ?? "—"}</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-slate-50 border border-slate-100 flex-1">
                                <p className="text-[9px] uppercase text-slate-400 font-bold">Max Tx</p>
                                <p className="text-xs font-bold">{selectedMerchant?.transactionLimit ?? "—"}</p>
                              </div>
                              <div className="text-center p-2 rounded-lg bg-slate-50 border border-slate-100 flex-1">
                                <p className="text-[9px] uppercase text-slate-400 font-bold">Daily Count</p>
                                <p className="text-xs font-bold">{selectedMerchant?.dailyCountLimit ?? "—"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 p-4 rounded-2xl bg-amber-50/30 border border-amber-100">
                      <Label className="text-[10px] uppercase text-amber-700 font-bold">Business Description</Label>
                      <p className="text-sm text-slate-700 italic leading-relaxed">
                        "{selectedMerchant?.businessDescription || "No description provided."}"
                      </p>
                    </div>

                    {/* Section: Documents */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Uploaded Documents
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedMerchant?.documents?.length ? (
                          selectedMerchant.documents.map(doc => (
                            <div key={doc.id} className="group flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 hover:border-primary/50 transition-all">
                              <div className="flex items-center gap-3 truncate">
                                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                                  {doc.type.startsWith('image/') ? (
                                    <img src={doc.url} alt="" className="w-full h-full object-cover rounded-lg" />
                                  ) : (
                                    <FileText className="w-4 h-4 text-slate-400" />
                                  )}
                                </div>
                                <div className="truncate">
                                  <p className="text-xs font-bold text-slate-900 truncate" title={doc.name}>{doc.name}</p>
                                  <p className="text-[9px] text-slate-500 font-medium">{(doc.size / 1024).toFixed(1)} KB</p>
                                </div>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewFile({ url: doc.url!, name: doc.name, type: doc.type })}>
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                  <a href={doc.url} download={doc.name}>
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                </Button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-2 py-8 text-center rounded-2xl border-2 border-dashed border-slate-100">
                            <p className="text-xs text-slate-400 font-medium">No documents attached.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className="border-t pt-4">
                  <Button variant="outline" className="rounded-xl px-8 h-11 font-bold" onClick={() => setIsDetailsDialogOpen(false)}>Close</Button>
                  {selectedMerchant?.status === 'pending' && canSetLimits ? (
                    <Button
                      className="rounded-xl px-8 h-11 font-bold bg-primary text-white hover:bg-primary/90"
                      onClick={() => {
                        setIsDetailsDialogOpen(false)
                        setSelectedForReview(selectedMerchant)
                        setIsReviewDialogOpen(true)
                      }}
                    >
                      Initial Review
                    </Button>
                  ) : null}
                </DialogFooter>
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
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-white hover:bg-white/20 bg-black/40 rounded-full backdrop-blur-md" 
                      onClick={() => setPreviewFile(null)}
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                </DialogHeader>
                <div className="flex items-center justify-center min-h-[60vh] p-8">
                  {previewFile?.type.startsWith('image/') ? (
                    <img 
                      src={previewFile.url} 
                      alt={previewFile.name} 
                      className="max-w-full max-h-[80vh] object-contain shadow-2xl animate-in zoom-in-95 duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-6 text-white animate-in fade-in duration-300">
                      <div className="w-24 h-24 rounded-3xl bg-white/10 flex items-center justify-center border border-white/20">
                        <FileText className="w-12 h-12 text-white/60" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold">Preview not available for this file type</p>
                        <p className="text-sm text-white/60 mt-1">Please download the file to view its content.</p>
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

            {/* Initial Review & Limit Setting Dialog */}
            <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Initial Compliance Review
                  </DialogTitle>
                  <DialogDescription>
                    Assign transaction limits for <span className="font-bold text-foreground">{selectedForReview?.name}</span>. 
                    This will move the merchant to the final activation queue.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="dailyLimit">Daily Transaction Volume (ETB)</Label>
                    <Input 
                      id="dailyLimit" 
                      placeholder="e.g. 10000" 
                      value={limits.dailyLimit}
                      onChange={(e) => handleLimitChange('dailyLimit', e.target.value)}
                      maxLength={13}
                      className={limitErrors.dailyLimit ? 'border-red-500' : ''}
                    />
                    {limitErrors.dailyLimit && (
                      <p className="text-[10px] text-red-500 font-medium">{limitErrors.dailyLimit}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="transactionLimit">Maximum Per-Transaction Amount (ETB)</Label>
                    <Input 
                      id="transactionLimit" 
                      placeholder="e.g. 1000" 
                      value={limits.transactionLimit}
                      onChange={(e) => handleLimitChange('transactionLimit', e.target.value)}
                      maxLength={13}
                      className={limitErrors.transactionLimit ? 'border-red-500' : ''}
                    />
                    {limitErrors.transactionLimit && (
                      <p className="text-[10px] text-red-500 font-medium">{limitErrors.transactionLimit}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dailyCountLimit">Maximum Daily Transaction Count</Label>
                    <Input 
                      id="dailyCountLimit" 
                      placeholder="e.g. 100" 
                      value={limits.dailyCountLimit}
                      onChange={(e) => handleLimitChange('dailyCountLimit', e.target.value)}
                      maxLength={13}
                      className={limitErrors.dailyCountLimit ? 'border-red-500' : ''}
                    />
                    {limitErrors.dailyCountLimit && (
                      <p className="text-[10px] text-red-500 font-medium">{limitErrors.dailyCountLimit}</p>
                    )}
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0" />
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Setting these limits performs an intermediate compliance check. Final activation will still require a separate review in the Approvals module.
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
                  <Button onClick={() => selectedForReview && handleInitialReview(selectedForReview.id)} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Queuing...
                      </>
                    ) : (
                      'Confirm & Queue for Activation'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Add Subsidiary Account (Maker) Dialog */}
            <Dialog open={isSubsidiaryDialogOpen} onOpenChange={setIsSubsidiaryDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Landmark className="w-5 h-5 text-primary" />
                    Add Subsidiary Account
                  </DialogTitle>
                  <DialogDescription>
                    Propose a subsidiary funding account for{" "}
                    <span className="font-bold text-foreground">{selectedForSubsidiary?.name}</span>.
                    A different admin must approve this before it takes effect.
                  </DialogDescription>
                </DialogHeader>

                {subsidiaryLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4 py-2">
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-1">
                      <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Current subsidiary account</p>
                      <p className="text-sm font-mono font-semibold text-slate-900">
                        {subsidiaryCurrent || "Not yet configured"}
                      </p>
                    </div>

                    {subsidiaryPendingRequest ? (
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
                        <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-800 leading-relaxed">
                          A request for <span className="font-mono font-bold">{subsidiaryPendingRequest.requestedAccountNumber}</span>{" "}
                          submitted by {subsidiaryPendingRequest.maker.name || subsidiaryPendingRequest.maker.email} is already
                          pending approval on the Review &amp; Approvals page.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <Label>New subsidiary account number</Label>
                          <Input
                            value={subsidiaryForm.accountNumber}
                            onChange={(e) => handleSubsidiaryAccountChange(e.target.value)}
                            placeholder="e.g. ABC1234567890"
                            className={subsidiaryFieldErrors.requestedAccountNumber ? 'border-red-500' : ''}
                          />
                          {subsidiaryFieldErrors.requestedAccountNumber && (
                            <p className="text-[10px] text-red-500 font-medium">{subsidiaryFieldErrors.requestedAccountNumber}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
                          <Textarea
                            value={subsidiaryForm.reason}
                            onChange={(e) => {
                              setSubsidiaryForm(prev => ({ ...prev, reason: e.target.value }))
                              setSubsidiaryFieldErrors(prev => ({ ...prev, reason: '' }))
                            }}
                            placeholder="Why is this subsidiary account being added? (optional)"
                            className={subsidiaryFieldErrors.reason ? 'border-red-500' : ''}
                          />
                          {subsidiaryFieldErrors.reason && (
                            <p className="text-[10px] text-red-500 font-medium">{subsidiaryFieldErrors.reason}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsSubsidiaryDialogOpen(false)} disabled={subsidiarySubmitting}>
                    Cancel
                  </Button>
                  {!subsidiaryLoading && !subsidiaryPendingRequest && (
                    <Button onClick={submitSubsidiaryRequest} disabled={subsidiarySubmitting}>
                      {subsidiarySubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit for Approval'
                      )}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
    </div>
  )
}

export default function MerchantOnboardingPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <MerchantOnboardingContent />
    </Suspense>
  )
}
