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
  Plus
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { MerchantDocument, Merchant } from "@/app/lib/db"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { aiMerchantOnboardingAssistant } from "@/lib/ai/merchant-onboarding-assistant"

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

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    accountNumber: "",
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
        const [configRes, merchantRes] = await Promise.all([
          fetch('/api/system-config'),
          fetch('/api/merchants')
        ])
        
        if (configRes.ok) setSystemConfig(await configRes.json())
        if (merchantRes.ok) setSubmissions(await merchantRes.json())
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
    try {
      const payload = {
        ...formData,
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
          websiteUrl: "", callbackUrl: "", contactName: "", contactUsername: "",
          branchName: "", district: "", category: "", businessType: "",
          dailyLimit: "10000", transactionLimit: "1000", dailyCountLimit: "100"
        })
        setDocuments([])
        setRiskFactors([])
        
        // Refresh submissions
        const res = await fetch('/api/merchants')
        if (res.ok) setSubmissions(await res.json())
        setIsRegisterDialogOpen(false)
      } else {
        const err = await response.json()
        throw new Error(err.error || 'Failed to submit')
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
      case 'approved': return <Badge className="bg-green-500 gap-1"><CheckCircle className="w-3 h-3" /> Approved</Badge>
      case 'active': return <Badge className="bg-emerald-500 gap-1"><CheckCircle className="w-3 h-3" /> Active</Badge>
      case 'branch_approved': return <Badge className="bg-blue-500 gap-1"><ShieldCheck className="w-3 h-3" /> Initial OK</Badge>
      case 'pending': return <Badge variant="outline" className="text-orange-500 border-orange-200 bg-orange-50 gap-1"><Clock className="w-3 h-3" /> Pending Review</Badge>
      case 'rejected': return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Rejected</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-white/50 bg-white/70 backdrop-blur-md px-4 sticky top-0 z-50">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <UserPlus className="text-[#754319] w-5 h-5" />
            <h1 className="text-lg font-bold text-[#5b371f] font-headline tracking-tight">Merchant Onboarding</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-slate-50/50">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-slate-900">Onboarding Queue</h2>
                <p className="text-sm text-muted-foreground">Review submitted merchants and manage onboarding in one place.</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search merchants..."
                    className="pl-9 bg-white"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="justify-center sm:justify-start">
                      <Plus className="w-4 h-4 mr-2" />
                      Register New Merchant
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
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="name">Business Name</Label>
                                  <Input id="name" placeholder="Legal Entity Name" value={formData.name} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="email">Business Email</Label>
                                  <Input id="email" type="email" placeholder="contact@business.com" value={formData.email} onChange={handleInputChange} />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="businessDescription">Business Description</Label>
                                <div className="relative">
                                  <Textarea
                                    id="businessDescription"
                                    placeholder="Describe the nature of business and products sold..."
                                    className="min-h-[100px] pr-10"
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
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Industry Category</Label>
                                  <Select onValueChange={(v) => handleSelectChange('category', v)} value={formData.category}>
                                    <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="E-commerce">E-commerce</SelectItem>
                                      <SelectItem value="Retail">Retail</SelectItem>
                                      <SelectItem value="Services">Services</SelectItem>
                                      <SelectItem value="Gaming">Gaming/Digital</SelectItem>
                                      <SelectItem value="Education">Education</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Business Type</Label>
                                  <Select onValueChange={(v) => handleSelectChange('businessType', v)} value={formData.businessType}>
                                    <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Sole Proprietorship">Sole Proprietorship</SelectItem>
                                      <SelectItem value="Private Limited">Private Limited</SelectItem>
                                      <SelectItem value="Public Limited">Public Limited</SelectItem>
                                      <SelectItem value="Partnership">Partnership</SelectItem>
                                    </SelectContent>
                                  </Select>
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
                                  <Label htmlFor="dailyLimit">Daily Vol. Limit ($)</Label>
                                  <Input id="dailyLimit" placeholder="10000" value={formData.dailyLimit} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="transactionLimit">Max Per Tx ($)</Label>
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
                                <Input id="contactName" placeholder="John Doe" value={formData.contactName} onChange={handleInputChange} />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="contactUsername">Username (Email or Phone)</Label>
                                <Input id="contactUsername" placeholder="email@example.com or +1234567890" value={formData.contactUsername} onChange={handleInputChange} />
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
                                  <Input id="accountNumber" placeholder="Bank Account Number" value={formData.accountNumber} onChange={handleInputChange} />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="websiteUrl">Website URL</Label>
                                  <Input id="websiteUrl" placeholder="https://..." value={formData.websiteUrl} onChange={handleInputChange} />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="callbackUrl">Webhook Callback URL</Label>
                                <Input id="callbackUrl" placeholder="https://api.merchant.com/webhook" value={formData.callbackUrl} onChange={handleInputChange} />
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
                                    className="pl-10 bg-slate-50 border-slate-200 font-medium" 
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
                                    className="pl-10 bg-slate-50 border-slate-200 font-medium" 
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

            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white hover:bg-white">
                      <TableHead className="pl-6">Merchant</TableHead>
                      <TableHead>Hub / District</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right pr-6">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((s) => (
                      <TableRow key={s.id} className="bg-white group hover:bg-slate-50 transition-colors">
                        <TableCell className="pl-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{s.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{s.id}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-700 font-medium">{s.branchName}</span>
                            <span className="text-[10px] text-muted-foreground">{s.district}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(s.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-2">
                            {s.status === 'pending' && canSetLimits && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
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
                                className="bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100"
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
                              className="gap-2"
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
                    <Label htmlFor="dailyLimit">Daily Transaction Volume ($)</Label>
                    <Input 
                      id="dailyLimit" 
                      placeholder="e.g. 10000" 
                      value={limits.dailyLimit}
                      onChange={(e) => setLimits({...limits, dailyLimit: e.target.value})}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="transactionLimit">Maximum Per-Transaction Amount ($)</Label>
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
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
