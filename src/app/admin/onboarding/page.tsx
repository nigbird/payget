"use client"

import { useState, useRef, useEffect } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
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
  Loader2, 
  Sparkles, 
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
  SlidersHorizontal
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { MerchantDocument, Merchant } from "@/app/lib/db"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { aiMerchantOnboardingAssistant } from "@/lib/ai/merchant-onboarding-assistant"
import { normalizePhoneNumber, isValidEmail, isValidPhoneNumber } from "@/lib/utils"

export default function MerchantOnboardingPage() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isAiLoading, setIsAiLoading] = useState(false)
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
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)
  const [selectedForReview, setSelectedForReview] = useState<Merchant | null>(null)
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false)
  const [limits, setLimits] = useState({
    dailyLimit: "10000",
    transactionLimit: "1000",
    dailyCountLimit: "100"
  })
  const [resendLoadingId, setResendLoadingId] = useState<string | null>(null)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
  
  const [documents, setDocuments] = useState<MerchantDocument[]>([])
  const [riskFactors, setRiskFactors] = useState<string[]>([])

  const userPermissions = (session?.user as any)?.permissions || []
  const canRegister = userPermissions.includes('MERCHANT_REGISTER')
  const canSetLimits = userPermissions.includes('TRANSACTION_LIMIT_SET') || userPermissions.includes('TRANSACTION_LIMIT_OVERRIDE')
  const canApprove = userPermissions.includes('MERCHANT_APPROVE')

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (id: string, value: string) => {
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newDocs: MerchantDocument[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).slice(2, 11),
      name: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString()
    }))

    setDocuments(prev => [...prev, ...newDocs])
    toast({
      title: "Files Uploaded",
      description: `${files.length} document(s) added to the application.`
    })
  }

  const handleRemoveDoc = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id))
  }

  const handleLogoUpload = async (file: File) => {
    setIsLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/uploads/merchant-logo", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))
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
    }
  }

  const handleAiAssist = async () => {
    if (!formData.name && !formData.businessDescription) {
      toast({
        variant: "destructive",
        title: "More Info Needed",
        description: "Please provide at least a business name or description for AI assistance."
      })
      return
    }

    setIsAiLoading(true)
    try {
      const result = await aiMerchantOnboardingAssistant({
        name: formData.name,
        description: formData.businessDescription
      })

      if (result) {
        setFormData(prev => ({
          ...prev,
          category: result.suggestedCategory || prev.category,
          businessType: result.suggestedBusinessType || prev.businessType,
          businessDescription: result.refinedDescription || prev.businessDescription
        }))
        setRiskFactors(result.potentialRiskFactors || [])
        toast({
          title: "AI Analysis Complete",
          description: "Merchant profile has been refined based on industry patterns."
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "AI Assistant Error",
        description: "Failed to analyze merchant data. Please continue manually."
      })
    } finally {
      setIsAiLoading(false)
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
      }
    }

    if (!formData.category) newErrors.category = "Industry category is required"
    if (!formData.businessType) newErrors.businessType = "Business type is required"
    if (!formData.accountNumber?.trim()) newErrors.accountNumber = "Account number is required"
    if (!formData.callbackUrl?.trim()) newErrors.callbackUrl = "Callback URL is required"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please correct the errors in the form."
      })
      return
    }

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
        riskFactors,
        status: canSetLimits ? 'branch_approved' : 'pending'
      }

      const response = await fetch('/api/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        toast({
          title: canSetLimits ? "Registration & Initial Review Complete" : "Application Submitted",
          description: canSetLimits 
            ? "Merchant registered and moved to activation queue." 
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
    }
  }

  const filteredSubmissions = submissions.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium gap-1.5"><CheckCircle className="w-3 h-3" /> Approved</Badge>
      case 'active':
        return <Badge className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium gap-1.5"><CheckCircle className="w-3 h-3" /> Active</Badge>
      case 'branch_approved':
        return <Badge className="rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium gap-1.5"><ShieldCheck className="w-3 h-3" /> Approved</Badge>
      case 'pending':
        return <Badge className="rounded-full bg-amber-50 text-amber-800 border border-amber-100 font-medium gap-1.5"><Clock className="w-3 h-3" /> Pending</Badge>
      case 'rejected':
        return <Badge className="rounded-full bg-rose-50 text-rose-700 border border-rose-100 font-medium gap-1.5"><AlertCircle className="w-3 h-3" /> Rejected</Badge>
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

            <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Register merchant
                </Button>
              </DialogTrigger>
                  <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-primary" />
                        Register New Merchant
                      </DialogTitle>
                      <DialogDescription>
                        Create a merchant profile and submit it into the onboarding workflow.
                      </DialogDescription>
                    </DialogHeader>

                    {!canRegister ? (
                      <Card className="border-orange-100 bg-orange-50/30">
                        <CardContent className="pt-6 flex flex-col items-center text-center gap-4">
                          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                            <Lock className="w-6 h-6 text-orange-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-orange-900">Registration Restricted</h3>
                            <p className="text-orange-800/70 max-w-md">
                              Your account does not have the necessary permissions to register new merchants. Please contact your system administrator.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                          <Card className="border-none shadow-sm">
                            <CardHeader className="bg-white border-b">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-primary" />
                                Business Information
                              </CardTitle>
                              <CardDescription>Enter the legal and operational details of the merchant.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                            <div className="space-y-2">
                              <Label>Merchant Logo</Label>
                              <div className="flex items-center gap-3">
                                <Input
                                  type="file"
                                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                                  className="bg-white"
                                  disabled={isLogoUploading}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0]
                                    if (f) void handleLogoUpload(f)
                                  }}
                                />
                              </div>
                              {formData.logoUrl ? (
                                <p className="text-xs text-muted-foreground">Uploaded: <span className="font-mono">{formData.logoUrl}</span></p>
                              ) : (
                                <p className="text-xs text-muted-foreground">Optional. This will appear on hosted payment pages.</p>
                              )}
                            </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="name">Business Name</Label>
                                  <Input 
                                    id="name" 
                                    placeholder="Legal Entity Name" 
                                    value={formData.name} 
                                    onChange={handleInputChange} 
                                    className={errors.name ? "border-red-500" : ""}
                                  />
                                  {errors.name && <p className="text-[10px] text-red-500 font-medium">{errors.name}</p>}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="email">Business Email</Label>
                                  <Input 
                                    id="email" 
                                    type="email" 
                                    placeholder="contact@business.com" 
                                    value={formData.email} 
                                    onChange={handleInputChange} 
                                    className={errors.email ? "border-red-500" : ""}
                                  />
                                  {errors.email && <p className="text-[10px] text-red-500 font-medium">{errors.email}</p>}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="businessDescription">Business Description</Label>
                                <div className="relative">
                                  <Textarea
                                    id="businessDescription"
                                    placeholder="Describe the nature of business and products sold..."
                                    className={`min-h-[100px] pr-10 ${errors.businessDescription ? "border-red-500" : ""}`}
                                    value={formData.businessDescription}
                                    onChange={handleInputChange}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-2 top-2 text-primary hover:text-primary/80 hover:bg-primary/5"
                                    onClick={handleAiAssist}
                                    disabled={isAiLoading}
                                  >
                                    {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                  </Button>
                                </div>
                                {errors.businessDescription && <p className="text-[10px] text-red-500 font-medium">{errors.businessDescription}</p>}
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Industry Category</Label>
                                  <Select onValueChange={(v) => handleSelectChange('category', v)} value={formData.category}>
                                    <SelectTrigger className={errors.category ? "border-red-500" : ""}><SelectValue placeholder="Select Category" /></SelectTrigger>
                                    <SelectContent>
                                      {categories.filter(c => c.active).map((cat, i) => (
                                        <SelectItem key={i} value={cat.name}>{cat.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {errors.category && <p className="text-[10px] text-red-500 font-medium">{errors.category}</p>}
                                </div>
                                <div className="space-y-2">
                                  <Label>Business Type</Label>
                                  <Select onValueChange={(v) => handleSelectChange('businessType', v)} value={formData.businessType}>
                                    <SelectTrigger className={errors.businessType ? "border-red-500" : ""}><SelectValue placeholder="Select Type" /></SelectTrigger>
                                    <SelectContent>
                                      {businessTypes.filter(bt => bt.active).map((bt, i) => (
                                        <SelectItem key={i} value={bt.name}>{bt.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {errors.businessType && <p className="text-[10px] text-red-500 font-medium">{errors.businessType}</p>}
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          {canSetLimits && (
                            <Card className="border-none shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
                              <CardHeader className="bg-white border-b">
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <TrendingUp className="w-5 h-5 text-primary" />
                                  Compliance: Initial Limits
                                </CardTitle>
                                <CardDescription>Authorize transaction volumes for this merchant.</CardDescription>
                              </CardHeader>
                              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="dailyLimit">Daily Vol. Limit (ETB)</Label>
                                  <Input id="dailyLimit" placeholder="10000" value={formData.dailyLimit} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="transactionLimit">Max Per Tx (ETB)</Label>
                                  <Input id="transactionLimit" placeholder="1000" value={formData.transactionLimit} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="dailyCountLimit">Max Daily Count</Label>
                                  <Input id="dailyCountLimit" placeholder="100" value={formData.dailyCountLimit} onChange={handleInputChange} />
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          <Card className="border-none shadow-sm">
                            <CardHeader className="bg-white border-b">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <User className="w-5 h-5 text-primary" />
                                Primary Contact
                              </CardTitle>
                              <CardDescription>Person responsible for managing this account.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="contactName">Full Name</Label>
                                <Input 
                                  id="contactName" 
                                  placeholder="John Doe" 
                                  value={formData.contactName} 
                                  onChange={handleInputChange} 
                                  className={errors.contactName ? "border-red-500" : ""}
                                />
                                {errors.contactName && <p className="text-[10px] text-red-500 font-medium">{errors.contactName}</p>}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="contactUsername">Username (Email or Phone)</Label>
                                <Input 
                                  id="contactUsername" 
                                  placeholder="email@example.com or +1234567890" 
                                  value={formData.contactUsername} 
                                  onChange={handleInputChange} 
                                  className={errors.contactUsername ? "border-red-500" : ""}
                                />
                                {errors.contactUsername && <p className="text-[10px] text-red-500 font-medium">{errors.contactUsername}</p>}
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border-none shadow-sm">
                            <CardHeader className="bg-white border-b">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Globe className="w-5 h-5 text-primary" />
                                Technical & Financial
                              </CardTitle>
                              <CardDescription>Integration endpoints and payout information.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="accountNumber">Payout Account #</Label>
                                  <Input 
                                    id="accountNumber" 
                                    placeholder="Bank Account Number" 
                                    value={formData.accountNumber} 
                                    onChange={handleInputChange} 
                                    className={errors.accountNumber ? "border-red-500" : ""}
                                  />
                                  {errors.accountNumber && <p className="text-[10px] text-red-500 font-medium">{errors.accountNumber}</p>}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="websiteUrl">Website URL</Label>
                                  <Input 
                                    id="websiteUrl" 
                                    placeholder="https://..." 
                                    value={formData.websiteUrl} 
                                    onChange={handleInputChange} 
                                    className={errors.websiteUrl ? "border-red-500" : ""}
                                  />
                                  {errors.websiteUrl && <p className="text-[10px] text-red-500 font-medium">{errors.websiteUrl}</p>}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="callbackUrl">Webhook Callback URL</Label>
                                <Input 
                                  id="callbackUrl" 
                                  placeholder="https://api.merchant.com/webhook" 
                                  value={formData.callbackUrl} 
                                  onChange={handleInputChange} 
                                  className={errors.callbackUrl ? "border-red-500" : ""}
                                />
                                {errors.callbackUrl && <p className="text-[10px] text-red-500 font-medium">{errors.callbackUrl}</p>}
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                    <div className="space-y-6">
                      <Card className="border-none shadow-sm">
                        <CardHeader className="bg-white border-b">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-primary" />
                            Organization
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                          {formData.district === "Head Office" ? (
                            <div className="space-y-2">
                              <Label>Assigned Organization</Label>
                              <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#754319]" />
                                <Input 
                                  value="Head Office" 
                                  readOnly 
                                  className="pl-10 bg-amber-50 border-amber-100 font-bold text-[#754319]" 
                                />
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <Label>District</Label>
                                <div className="relative">
                                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    value={formData.district} 
                                    readOnly 
                                    className="pl-10 bg-primary/5 border-primary/10 font-medium" 
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label>Branch</Label>
                                <div className="relative">
                                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    value={formData.branchName} 
                                    readOnly 
                                    className="pl-10 bg-primary/5 border-primary/10 font-medium" 
                                  />
                                </div>
                              </div>
                            </>
                          )}
                          <p className="text-[10px] text-muted-foreground italic">
                            * Organization details are automatically assigned based on your account profile.
                          </p>
                        </CardContent>
                      </Card>

                          <Card className="border-none shadow-sm">
                            <CardHeader className="bg-white border-b">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <FileText className="w-5 h-5 text-primary" />
                                Documentation
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                              <div
                                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                              >
                                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm font-medium">Click to upload documents</p>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  Max {systemConfig.maxFileSizeMB}MB. Allowed: {systemConfig.allowedFileTypes.join(', ')}
                                </p>
                                <input
                                  type="file"
                                  ref={fileInputRef}
                                  className="hidden"
                                  multiple
                                  onChange={handleFileUpload}
                                />
                              </div>

                              <div className="space-y-2">
                                {documents.map(doc => (
                                  <div key={doc.id} className="flex items-center justify-between p-2 rounded bg-white border text-xs">
                                    <div className="flex items-center gap-2">
                                      <FileCheck className="w-3 h-3 text-green-500" />
                                      <span className="truncate max-w-[120px]">{doc.name}</span>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveDoc(doc.id)}>
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>

                          {riskFactors.length > 0 && (
                            <Card className="border-none shadow-sm bg-red-50/50">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-bold uppercase text-red-800 flex items-center gap-2">
                                  <AlertCircle className="w-3 h-3" /> AI Risk Analysis
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="p-4 space-y-2">
                                {riskFactors.map((rf, idx) => (
                                  <div key={idx} className="text-[10px] text-red-700 bg-red-100/50 p-1.5 rounded flex items-center gap-2">
                                    <div className="w-1 h-1 rounded-full bg-red-500" />
                                    {rf}
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          )}

                          <Button className="w-full h-12 text-lg shadow-lg shadow-primary/20" onClick={handleSubmit}>
                            Submit for Review
                          </Button>
                        </div>
                      </div>
                    )}
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
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
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
                    {filteredSubmissions.map((s) => (
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
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 rounded-2xl gap-2 hover:bg-amber-50/50 transition-colors"
                              onClick={() => {
                                setSelectedMerchant(s)
                                setIsDetailsDialogOpen(true)
                              }}
                            >
                              View Details <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredSubmissions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                          No submissions found in the queue.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
        </CardContent>
      </Card>

            <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    {selectedMerchant?.name ?? "Merchant"} Details
                  </DialogTitle>
                  <DialogDescription>
                    Submitted on{" "}
                    {selectedMerchant?.createdAt ? new Date(selectedMerchant.createdAt).toLocaleString() : "—"}.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Merchant ID</Label>
                      <p className="text-sm font-mono">{selectedMerchant?.id ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Identifiers</Label>
                      <div className="flex flex-col gap-1">
                        <p className="text-sm flex items-center gap-2">
                          <Mail className="w-3 h-3" /> {selectedMerchant?.email ?? "—"}
                        </p>
                        <p className="text-sm flex items-center gap-2">
                          <User className="w-3 h-3" /> {selectedMerchant?.contactUsername ?? "—"}
                        </p>
                        {selectedMerchant?.contactName ? (
                          <p className="text-sm flex items-center gap-2">
                            <User className="w-3 h-3" /> {selectedMerchant.contactName}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Hub / District</Label>
                      <p className="text-sm">{selectedMerchant?.branchName ?? "—"} — {selectedMerchant?.district ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Category</Label>
                      <p className="text-sm">
                        {(selectedMerchant as any)?.category ?? "—"} — {(selectedMerchant as any)?.businessType ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Status</Label>
                      <div>{selectedMerchant?.status ? getStatusBadge(selectedMerchant.status) : <Badge variant="secondary">—</Badge>}</div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Limits</Label>
                      <div className="text-sm space-y-1">
                        <p>Daily: <span className="font-semibold">{(selectedMerchant as any)?.dailyLimit ?? "—"}</span></p>
                        <p>Per Tx: <span className="font-semibold">{(selectedMerchant as any)?.transactionLimit ?? "—"}</span></p>
                        <p>Daily Count: <span className="font-semibold">{(selectedMerchant as any)?.dailyCountLimit ?? "—"}</span></p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Risk Factors</Label>
                      <div className="flex flex-wrap gap-2">
                        {(selectedMerchant as any)?.riskFactors?.length ? (
                          (selectedMerchant as any).riskFactors.map((rf: string) => (
                            <Badge key={rf} variant="destructive" className="text-[10px]">{rf}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <FileCheck className="w-3 h-3" /> None flagged.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>Close</Button>
                  {selectedMerchant?.status === 'pending' && canSetLimits ? (
                    <Button
                      onClick={() => {
                        setIsDetailsDialogOpen(false)
                        setSelectedForReview(selectedMerchant)
                        setIsReviewDialogOpen(true)
                      }}
                    >
                      Initial Review
                    </Button>
                  ) : null}
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
                      onChange={(e) => setLimits({...limits, dailyLimit: e.target.value})}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="transactionLimit">Maximum Per-Transaction Amount (ETB)</Label>
                    <Input 
                      id="transactionLimit" 
                      placeholder="e.g. 1000" 
                      value={limits.transactionLimit}
                      onChange={(e) => setLimits({...limits, transactionLimit: e.target.value})}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dailyCountLimit">Maximum Daily Transaction Count</Label>
                    <Input 
                      id="dailyCountLimit" 
                      placeholder="e.g. 100" 
                      value={limits.dailyCountLimit}
                      onChange={(e) => setLimits({...limits, dailyCountLimit: e.target.value})}
                    />
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0" />
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Setting these limits performs an intermediate compliance check. Final activation will still require a separate review in the Approvals module.
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)}>Cancel</Button>
                  <Button onClick={() => selectedForReview && handleInitialReview(selectedForReview.id)}>
                    Confirm & Queue for Activation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
    </div>
  )
}
