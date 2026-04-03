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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  Mail
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { aiMerchantOnboardingAssistant } from "@/ai/flows/ai-merchant-onboarding-assistant"
import type { MerchantDocument, Merchant } from "@/app/lib/db"

export default function MakerPortal() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState("register")
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [systemConfig, setSystemConfig] = useState<any>({
    districts: [],
    branches: [],
    allowedFileTypes: [],
    maxFileSizeMB: 5
  })
  const [mySubmissions, setMySubmissions] = useState<Merchant[]>([])
  const [editingMerchantId, setEditingMerchantId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    accountNumber: "",
    businessDescription: "",
    websiteUrl: "",
    callbackUrl: "",
    contactName: "",
    contactPhone: "",
    branchName: "",
    district: "",
    category: "",
    businessType: ""
  })
  
  const [documents, setDocuments] = useState<MerchantDocument[]>([])
  const [riskFactors, setRiskFactors] = useState<string[]>([])

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/system-config')
        if (response.ok) {
          const config = await response.json()
          setSystemConfig(config)
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
      }
    }
    fetchConfig()
    refreshSubmissions()
  }, [])

  const refreshSubmissions = async () => {
    try {
      const response = await fetch('/api/merchants')
      if (response.ok) {
        const merchants = await response.json()
        setMySubmissions([...merchants].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      }
    } catch (error) {
      console.error('Failed to fetch merchants:', error)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newDocs: MerchantDocument[] = []
    const maxSize = (systemConfig.maxFileSizeMB || 5) * 1024 * 1024
    const allowedTypes = systemConfig.allowedFileTypes || []

    Array.from(files).forEach(file => {
      const extension = `.${file.name.split('.').pop()?.toLowerCase()}`
      
      if (!allowedTypes.includes(extension)) {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: `${file.name} is not a supported format.`
        })
        return
      }

      if (file.size > maxSize) {
        toast({
          variant: "destructive",
          title: "File Too Large",
          description: `${file.name} exceeds the ${systemConfig.maxFileSizeMB || 5}MB limit.`
        })
        return
      }

      newDocs.push({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: file.type,
        size: file.size,
        uploadedAt: new Date().toISOString()
      })
    })

    setDocuments(prev => [...prev, ...newDocs])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeDoc = (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  const handleAiAssistant = async () => {
    if (!formData.websiteUrl && !formData.businessDescription) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please provide a website URL or business description for the AI assistant to analyze."
      })
      return
    }

    setIsAiLoading(true)
    try {
      const result = await aiMerchantOnboardingAssistant({
        businessDescription: formData.businessDescription,
        websiteUrl: formData.websiteUrl
      })

      setFormData(prev => ({
        ...prev,
        name: result.prefilledFields.companyName || prev.name,
        businessType: result.prefilledFields.businessType || prev.businessType,
        category: result.suggestedCategories[0] || prev.category
      }))
      setRiskFactors(result.riskFactors)

      toast({
        title: "Analysis Complete",
        description: "AI assistant has suggested details based on your input."
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "AI Analysis Failed",
        description: "Could not process information at this time."
      })
    } finally {
      setIsAiLoading(false)
    }
  }

  const startEdit = (merchant: Merchant) => {
    setEditingMerchantId(merchant.id)
    setFormData({
      name: merchant.name,
      email: merchant.email,
      accountNumber: merchant.accountNumber,
      businessDescription: merchant.businessDescription,
      websiteUrl: merchant.websiteUrl,
      callbackUrl: merchant.callbackUrl,
      contactName: merchant.contactName,
      contactPhone: merchant.contactPhone,
      branchName: merchant.branchName,
      district: merchant.district,
      category: merchant.category,
      businessType: merchant.businessType
    })
    setDocuments(merchant.documents)
    setRiskFactors(merchant.riskFactors)
    setActiveTab("register")
  }

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      accountNumber: "",
      businessDescription: "",
      websiteUrl: "",
      callbackUrl: "",
      contactName: "",
      contactPhone: "",
      branchName: "",
      district: "",
      category: "",
      businessType: ""
    })
    setDocuments([])
    setRiskFactors([])
    setEditingMerchantId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (documents.length === 0) {
      toast({
        variant: "destructive",
        title: "Documents Required",
        description: "Please upload at least one document (e.g. Trade License)."
      })
      return
    }

    if (!formData.branchName || !formData.district) {
      toast({
        variant: "destructive",
        title: "Missing Selections",
        description: "Please select a branch and district."
      })
      return
    }

    try {
      if (editingMerchantId) {
        const response = await fetch(`/api/merchants/${editingMerchantId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            status: 'pending', // Re-submit for review
            documents,
            riskFactors
          })
        })

        if (response.ok) {
          toast({
            title: "Submission Updated",
            description: "Changes saved and sent back for Branch review."
          })
        } else {
          throw new Error('Failed to update')
        }
      } else {
        const merchantId = `m_${Math.random().toString(36).substr(2, 9)}`
        const response = await fetch('/api/merchants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: merchantId,
            ...formData,
            dailyLimit: 0,
            transactionLimit: 0,
            dailyCountLimit: 0,
            jweSecret: `demo_jwe_secret_${formData.name || "merchant"}`,
            status: 'pending',
            documents,
            riskFactors,
            createdAt: new Date().toISOString()
          })
        })

        if (response.ok) {
          toast({
            title: "Merchant Registered",
            description: "Successfully submitted to Branch Approval."
          })
        } else {
          throw new Error('Failed to register')
        }
      }

      resetForm()
      refreshSubmissions()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: "Could not process your request at this time."
      })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50 gap-1.5 px-2.5 py-1 rounded-full font-medium">
            <CheckCircle className="w-3.5 h-3.5" /> Approved
          </Badge>
        )
      case 'branch_approved':
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-50 gap-1.5 px-2.5 py-1 rounded-full font-medium">
            <ShieldCheck className="w-3.5 h-3.5" /> Branch Verified
          </Badge>
        )
      case 'pending':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50 gap-1.5 px-2.5 py-1 rounded-full font-medium">
            <Clock className="w-3.5 h-3.5" /> Pending Review
          </Badge>
        )
      case 'rejected':
        return (
          <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-100 hover:bg-red-50 gap-1.5 px-2.5 py-1 rounded-full font-medium">
            <AlertCircle className="w-3.5 h-3.5" /> Rejected
          </Badge>
        )
      default:
        return <Badge variant="secondary" className="rounded-full px-2.5 py-1">{status}</Badge>
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
            <h1 className="text-lg font-bold text-[#5b371f] font-headline tracking-tight">Merchant Administration</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
              <div className="flex items-center justify-between">
                <TabsList className="bg-white/50 backdrop-blur-sm p-1 border border-gray-200 rounded-xl shadow-sm">
                  <TabsTrigger value="register" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">
                    <UserPlus className="w-4 h-4" /> {editingMerchantId ? 'Correct Submission' : 'Register New'}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex items-center gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all">
                    <History className="w-4 h-4" /> Submission Status
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="register" className="mt-0">
                <div className="space-y-6">
                  {editingMerchantId && (
                    <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                          <AlertCircle className="text-orange-600 w-4 h-4" />
                        </div>
                        <p className="text-sm text-orange-800 font-medium">
                          You are currently correcting a rejected application. 
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={resetForm} className="text-orange-800 hover:bg-orange-100/50 rounded-lg">
                        Cancel Edit
                      </Button>
                    </div>
                  )}

                  <Card className="shadow-sm border-gray-200 overflow-hidden bg-white rounded-2xl">
                    <CardContent className="p-0">
                      <form onSubmit={handleSubmit} className="divide-y divide-gray-100">
                        {/* Section 1: Company Profile */}
                        <div className="p-8 space-y-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                              <Building2 className="w-5 h-5 text-gray-400" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Company Details</h3>
                              <p className="text-xs text-gray-400">Capture legal entity information</p>
                            </div>
                          </div>

                          <div className="grid gap-6 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="name" className="text-sm font-medium text-gray-700">Company Name</Label>
                              <Input 
                                id="name" 
                                placeholder="Acme Inc." 
                                required 
                                className="h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email Address</Label>
                              <div className="relative group">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                                <Input 
                                  id="email" 
                                  type="email" 
                                  placeholder="contact@acme.com" 
                                  required 
                                  className="pl-10 h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                                  value={formData.email}
                                  onChange={e => setFormData({...formData, email: e.target.value})}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Section 2: Contact Person */}
                        <div className="p-8 space-y-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                              <User className="w-5 h-5 text-gray-400" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Contact Person</h3>
                              <p className="text-xs text-gray-400">Authorized representative for this merchant</p>
                            </div>
                          </div>

                          <div className="grid gap-6 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="contactName" className="text-sm font-medium text-gray-700">Full Name</Label>
                              <Input 
                                id="contactName" 
                                placeholder="Authorized Representative" 
                                required 
                                className="h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                                value={formData.contactName}
                                onChange={e => setFormData({...formData, contactName: e.target.value})}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="contactPhone" className="text-sm font-medium text-gray-700">Phone Number</Label>
                              <div className="relative group">
                                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                                <Input 
                                  id="contactPhone" 
                                  className="pl-10 h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                                  placeholder="+1 (555) 000-0000" 
                                  required 
                                  value={formData.contactPhone}
                                  onChange={e => setFormData({...formData, contactPhone: e.target.value})}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Section 3: Registration Branch */}
                        <div className="p-8 space-y-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                              <MapPin className="w-5 h-5 text-gray-400" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Registration Branch</h3>
                              <p className="text-xs text-gray-400">Select regional assignment for review</p>
                            </div>
                          </div>

                          <div className="grid gap-6 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="branchName" className="text-sm font-medium text-gray-700">Branch Name</Label>
                              <Select 
                                value={formData.branchName} 
                                onValueChange={(val) => setFormData({...formData, branchName: val})}
                              >
                                <SelectTrigger id="branchName" className="h-11 rounded-xl border-gray-200 focus:ring-primary/20 transition-all">
                                  <SelectValue placeholder="Select Branch" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-gray-100">
                                  {(systemConfig.branches || []).map(branch => (
                                    <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="district" className="text-sm font-medium text-gray-700">District</Label>
                              <Select 
                                value={formData.district} 
                                onValueChange={(val) => setFormData({...formData, district: val})}
                              >
                                <SelectTrigger id="district" className="h-11 rounded-xl border-gray-200 focus:ring-primary/20 transition-all">
                                  <SelectValue placeholder="Select District" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-gray-100">
                                  {(systemConfig.districts || []).map(district => (
                                    <SelectItem key={district} value={district}>{district}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>

                        {/* Section 4: Document Uploads */}
                        <div className="p-8 space-y-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                              <FileText className="w-5 h-5 text-gray-400" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Compliance Documents</h3>
                              <p className="text-xs text-gray-400">Trade License, ID, or Tax Certificates</p>
                            </div>
                          </div>
                          
                          <div 
                            className="border-2 border-dashed border-gray-100 rounded-2xl p-10 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 hover:border-primary/30 transition-all cursor-pointer group"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-100 mb-4 group-hover:scale-110 transition-transform">
                              <Upload className="w-6 h-6 text-primary" />
                            </div>
                            <p className="text-sm font-semibold text-gray-900">Click to upload documents</p>
                            <p className="text-xs text-gray-400 mt-1">
                              Max {systemConfig.maxFileSizeMB || 5}MB per file
                            </p>
                            <input 
                              type="file" 
                              multiple 
                              className="hidden" 
                              ref={fileInputRef}
                              onChange={handleFileUpload}
                              accept={(systemConfig.allowedFileTypes || []).join(',')}
                            />
                          </div>

                          {documents.length > 0 && (
                            <div className="grid gap-3">
                              {documents.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                      <FileCheck className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-gray-900 truncate max-w-[250px]">{doc.name}</p>
                                      <p className="text-[10px] text-gray-400">{(doc.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      removeDoc(doc.id)
                                    }}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Section 5: Integration & Details */}
                        <div className="p-8 space-y-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                              <LinkIcon className="w-5 h-5 text-gray-400" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Integration Details</h3>
                              <p className="text-xs text-gray-400">Settlement and technical configurations</p>
                            </div>
                          </div>

                          <div className="grid gap-6 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="accountNumber" className="text-sm font-medium text-gray-700">Bank Account Number</Label>
                              <Input 
                                id="accountNumber" 
                                placeholder="000123456789" 
                                required 
                                className="h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                                value={formData.accountNumber}
                                onChange={e => setFormData({...formData, accountNumber: e.target.value})}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="businessType" className="text-sm font-medium text-gray-700">Business Type</Label>
                              <Input 
                                id="businessType" 
                                placeholder="e.g. Retail, SaaS" 
                                className="h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                                value={formData.businessType}
                                onChange={e => setFormData({...formData, businessType: e.target.value})}
                              />
                            </div>
                          </div>

                          <div className="grid gap-6 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="websiteUrl" className="text-sm font-medium text-gray-700">Website URL</Label>
                              <div className="relative group">
                                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                                <Input 
                                  id="websiteUrl" 
                                  className="pl-10 h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                                  placeholder="https://example.com" 
                                  value={formData.websiteUrl}
                                  onChange={e => setFormData({...formData, websiteUrl: e.target.value})}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="callbackUrl" className="text-sm font-medium text-gray-700">Callback (Webhook) URL</Label>
                              <div className="relative group">
                                <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                                <Input 
                                  id="callbackUrl" 
                                  className="pl-10 h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                                  placeholder="https://api.example.com/webhook" 
                                  required
                                  value={formData.callbackUrl}
                                  onChange={e => setFormData({...formData, callbackUrl: e.target.value})}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="businessDescription" className="text-sm font-medium text-gray-700">Business Description</Label>
                            <Textarea 
                              id="businessDescription" 
                              placeholder="Briefly describe the business operations..." 
                              rows={3}
                              className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                              value={formData.businessDescription}
                              onChange={e => setFormData({...formData, businessDescription: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="p-8 bg-gray-50/50">
                          <Button type="submit" className="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all">
                            {editingMerchantId ? 'Update & Resubmit' : 'Submit for Approval'}
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="history">
                <Card className="shadow-sm border-gray-200 overflow-hidden bg-white rounded-2xl">
                  <CardHeader className="border-b border-gray-100 bg-gray-50/30">
                    <CardTitle className="text-lg font-bold text-gray-900">Submission History</CardTitle>
                    <CardDescription className="text-gray-500">Track the status of your merchant registrations and view feedback from Checkers.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-gray-50/50">
                        <TableRow className="border-gray-100">
                          <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider py-4">Merchant</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider py-4">Branch</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider py-4">Date</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider py-4">Status</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wider py-4 text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mySubmissions.map((m) => (
                          <TableRow key={m.id} className="border-gray-50 hover:bg-gray-50/30 transition-colors">
                            <TableCell className="py-4">
                              <div className="font-semibold text-gray-900">{m.name}</div>
                              <div className="text-[10px] text-gray-400 uppercase tracking-tight">{m.id}</div>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600 py-4">{m.branchName}</TableCell>
                            <TableCell className="text-sm text-gray-500 py-4">
                              {new Date(m.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="py-4">
                              {getStatusBadge(m.status)}
                            </TableCell>
                            <TableCell className="py-4 text-right">
                              <div className="flex flex-col items-end gap-2">
                                {m.status === 'rejected' && m.rejectionReason && (
                                  <div className="p-2 bg-red-50 text-red-700 text-[10px] rounded-lg border border-red-100 italic max-w-[200px]">
                                    "{m.rejectionReason}"
                                  </div>
                                )}
                                {m.status === 'rejected' && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 gap-2 rounded-lg border-gray-200 text-gray-600 hover:text-primary hover:border-primary/30 transition-all"
                                    onClick={() => startEdit(m)}
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    Correct
                                  </Button>
                                )}
                                {m.status !== 'rejected' && (
                                  <span className="text-xs text-gray-300 italic">No action required</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {mySubmissions.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-16 text-gray-400 italic">
                              No submissions found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
