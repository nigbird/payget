"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { 
  Loader2, 
  Sparkles, 
  Store, 
  Globe, 
  Building2, 
  User, 
  Phone, 
  Link as LinkIcon,
  FileText,
  Upload,
  X,
  FileCheck,
  CreditCard,
  ArrowLeft,
  Copy,
  CheckCircle2,
  Clock,
  Mail
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { MerchantDocument } from "@/app/lib/db"
import Link from "next/link"
import { aiMerchantOnboardingAssistant } from "@/lib/ai/merchant-onboarding-assistant"
import { normalizePhoneNumber, isValidEmail, isValidPhoneNumber } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"


export default function MerchantSelfRegistration() {
  const { toast } = useToast()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [systemConfig, setSystemConfig] = useState<any>({
    allowedFileTypes: [],
    maxFileSizeMB: 5
  })
  const [categories, setCategories] = useState<{ name: string; code?: string; active: boolean }[]>([])
  const [businessTypes, setBusinessTypes] = useState<{ name: string; code?: string; active: boolean }[]>([])
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    accountNumber: "",
    logoUrl: "",
    dailyLimit: "10000",
    transactionLimit: "1000",
    businessDescription: "",
    websiteUrl: "",
    callbackUrl: "",
    contactName: "",
    contactUsername: "",
    category: "",
    businessType: ""
  })
  
  const [documents, setDocuments] = useState<MerchantDocument[]>([])
  const [riskFactors, setRiskFactors] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [configRes, masterDataRes] = await Promise.all([
          fetch('/api/system-config'),
          fetch('/api/master-data')
        ])
        if (configRes.ok) {
          const config = await configRes.json()
          setSystemConfig({
            allowedFileTypes: Array.isArray(config?.allowedFileTypes) ? config.allowedFileTypes : [],
            maxFileSizeMB: Number(config?.maxFileSizeMB ?? 5)
          })
        }
        if (masterDataRes.ok) {
          const masterData = await masterDataRes.json()
          console.log("Master Data:", masterData);
          setCategories(masterData.categories || [])
          setBusinessTypes(masterData.businessTypes || [])
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
      }
    }
    fetchConfig()
  }, [])

  const allowedTypes = Array.isArray(systemConfig.allowedFileTypes) ? systemConfig.allowedFileTypes : []
  const maxFileSizeMB = Number(systemConfig.maxFileSizeMB || 5)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024
    const MAX_TOTAL_BYTES = 15 * 1024 * 1024
    
    // Calculate current total size
    let currentTotalSize = documents.reduce((sum, doc) => sum + doc.size, 0)
    const newFiles = Array.from(files)
    
    const validFiles: File[] = []
    
    for (const file of newFiles) {
      const extension = `.${file.name.split('.').pop()?.toLowerCase()}`
      
      if (!allowedTypes.includes(extension)) {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: `${file.name} is not a supported format.`
        })
        continue
      }

      if (file.size > MAX_SINGLE_FILE_BYTES) {
        toast({
          variant: "destructive",
          title: "File Too Large",
          description: `${file.name} exceeds the 5MB limit.`
        })
        continue
      }

      if (currentTotalSize + file.size > MAX_TOTAL_BYTES) {
        toast({
          variant: "destructive",
          title: "Total Size Exceeded",
          description: "Total size of all compliance documents cannot exceed 15MB."
        })
        break
      }

      currentTotalSize += file.size
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    setIsSubmitting(true) // Use isSubmitting to show a loader if needed, or create a new state
    try {
      const fd = new FormData()
      validFiles.forEach(file => fd.append("files", file))
      
      const res = await fetch("/api/uploads/compliance-docs", {
        method: "POST",
        body: fd
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")
      
      setDocuments(prev => [...prev, ...data.documents])
      toast({
        title: "Files Uploaded",
        description: `${validFiles.length} document(s) uploaded successfully.`
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Could not upload documents."
      })
    } finally {
      setIsSubmitting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const removeDoc = (id: string) => {
    setDocuments(prev => {
      const doc = prev.find(d => d.id === id)
      if (doc?.url && doc.url.startsWith('blob:')) {
        URL.revokeObjectURL(doc.url)
      }
      return prev.filter(d => d.id !== id)
    })
  }

  const handleLogoUpload = async (file: File) => {
    setIsLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/uploads/merchant-logo", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Logo upload failed")
      setFormData(prev => ({ ...prev, logoUrl: data.url }))
      toast({ title: "Logo uploaded", description: "Your logo will appear on hosted payment pages." })
    } catch (e: any) {
      toast({ variant: "destructive", title: "Upload failed", description: e?.message || "Could not upload logo." })
    } finally {
      setIsLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ""
    }
  }

  const handleAiAssistant = async () => {
    if (!formData.websiteUrl && !formData.businessDescription) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please provide a website URL or business description for AI analysis."
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
        title: "AI Analysis Complete",
        description: "Suggested details have been populated."
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
    
    const merchantId = `m_${Math.random().toString(36).substr(2, 9)}`
    
    // Normalize phone number if contactUsername is a phone number
    const finalFormData = { ...formData }
    if (isValidPhoneNumber(finalFormData.contactUsername) && !isValidEmail(finalFormData.contactUsername)) {
      finalFormData.contactUsername = normalizePhoneNumber(finalFormData.contactUsername)
    }

    try {
      const response = await fetch('/api/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: merchantId,
          ...finalFormData,
          branchName: "Self-Service",
          district: "Self-Service",
          dailyLimit: Number(formData.dailyLimit),
          transactionLimit: Number(formData.transactionLimit),
          dailyCountLimit: 100,
          jweSecret: `demo_jwe_secret_${merchantId}`,
          status: 'pending',
          documents,
          riskFactors,
          createdAt: new Date().toISOString()
        })
      })

      if (response.ok) {
        setIsSuccess(true)
        toast({
          title: "Application Submitted",
          description: "Your application has been submitted successfully."
        })
        setFormData(prev => ({ ...prev, logoUrl: "" }))
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
          throw new Error(result.error || 'Failed to register')
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: error.message || "Could not submit your application at this time."
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      description: "Copied to clipboard"
    })
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-2xl border-none animate-in zoom-in-95 rounded-3xl overflow-hidden">
          <div className="bg-gradient-to-br from-[#f4db9f] via-[#f8b513] to-[#754319] p-8 text-[#3f210f] text-center">
            <div className="mx-auto w-16 h-16 bg-white/30 rounded-2xl backdrop-blur-md flex items-center justify-center mb-4 shadow-sm border border-white/40">
              <CheckCircle2 className="w-10 h-10 text-[#3f210f]" />
            </div>
            <h3 className="text-2xl font-black tracking-tight uppercase">Application Submitted!</h3>
            <p className="text-[#3f210f]/80 mt-1 text-xs font-bold uppercase tracking-widest">In review</p>
          </div>
          <CardContent className="py-8 px-8 space-y-6">
            <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6 text-center">
              <p className="text-sm text-blue-800 leading-relaxed font-medium">
                Thank you for applying. Your application is currently <span className="font-bold uppercase text-xs px-2 py-0.5 bg-blue-100 rounded-full">Pending Review</span>.
              </p>
              <p className="text-xs text-blue-700/70 mt-4 font-semibold">
                You will receive an email or SMS notification once your account has been approved.
              </p>
            </div>
          </CardContent>
          <CardFooter className="px-8 pb-8">
            <Button className="w-full h-14 rounded-2xl bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_100%)] text-[#3f210f] hover:brightness-95 shadow-lg shadow-amber-950/10 font-bold border border-white/40" asChild>
              <Link href="/">Return to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fffdf8_0%,#fff8ea_38%,#fffdf9_100%)] pb-20">
      <header className="sticky top-0 z-50 flex h-16 items-center border-b border-[#eadcc4]/70 bg-[#fffdf8]/90 px-4 backdrop-blur-md">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="text-primary w-5 h-5" />
              </div>
              <h1 className="text-lg font-bold text-gray-900">Merchant Onboarding</h1>
            </div>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-medium">
            Self-Service Portal
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="space-y-8">
          <div className="mx-auto max-w-2xl rounded-[28px] border border-[#eddcc0] bg-white/80 px-8 py-7 text-center shadow-[0_16px_50px_rgba(117,67,25,0.08)] backdrop-blur">
            <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-[#efd9af] bg-[#fff8ea] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#754319]">
              <Sparkles className="h-3.5 w-3.5" />
              Merchant self-service onboarding
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">Register Your Business</h2>
            <p className="mx-auto mt-2 max-w-lg text-gray-500">
              Complete the information below to start processing payments with NibTera Merchants.
            </p>
          </div>

          <Card className="overflow-hidden rounded-[26px] border border-[#eddcc0] bg-white/90 shadow-[0_20px_60px_rgba(117,67,25,0.07)]">
            <CardContent className="p-0">
              <form onSubmit={handleSubmit} className="divide-y divide-gray-100">
                {/* Section 1: Company Profile */}
                <div className="p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                      <Building2 className="h-5 w-5 text-[#754319]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Company Profile</h3>
                      <p className="text-xs text-gray-400">Basic information about your legal entity</p>
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium text-gray-700">Business Name</Label>
                      <Input 
                        id="name" 
                        placeholder="Legal Entity Name" 
                        required 
                        className={`h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300 ${errors.name ? 'border-red-500' : ''}`}
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                      />
                      {errors.name && <p className="text-[11px] text-red-500 font-medium">{errors.name}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-gray-700">Business Email</Label>
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="contact@business.com" 
                        required 
                        className={`h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300 ${errors.email ? 'border-red-500' : ''}`}
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                      />
                      {errors.email && <p className="text-[11px] text-red-500 font-medium">{errors.email}</p>}
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="accountNumber" className="text-sm font-medium text-gray-700">Settlement Account Number</Label>
                      <Input
                        id="accountNumber"
                        inputMode="numeric"
                        placeholder="e.g. 1234567890"
                        required
                        className={`h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300 ${errors.accountNumber ? 'border-red-500' : ''}`}
                        value={formData.accountNumber}
                        onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      />
                      {errors.accountNumber && <p className="text-[11px] text-red-500 font-medium">{errors.accountNumber}</p>}
                      <p className="text-xs text-gray-400">Payments will be settled to this account number.</p>
                    </div>
                  </div>
                </div>

                {/* Section 2: Authorized Contact */}
                <div className="p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                      <User className="h-5 w-5 text-[#754319]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Authorized Contact</h3>
                      <p className="text-xs text-gray-400">Person authorized to manage this account</p>
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contactName" className="text-sm font-medium text-gray-700">Full Name</Label>
                      <Input 
                        id="contactName" 
                        placeholder="Authorized Representative" 
                        required 
                        className={`h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300 ${errors.contactName ? 'border-red-500' : ''}`}
                        value={formData.contactName}
                        onChange={e => setFormData({...formData, contactName: e.target.value})}
                      />
                      {errors.contactName && <p className="text-[11px] text-red-500 font-medium">{errors.contactName}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactUsername" className="text-sm font-medium text-gray-700">Username (Email or Phone Number)</Label>
                      <div className="relative group">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                        <Input 
                          id="contactUsername" 
                          className={`pl-10 h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300 ${errors.contactUsername ? 'border-red-500' : ''}`}
                          placeholder="email@example.com or +1234567890" 
                          required 
                          value={formData.contactUsername}
                          onChange={e => setFormData({...formData, contactUsername: e.target.value})}
                        />
                      </div>
                      {errors.contactUsername && <p className="text-[11px] text-red-500 font-medium">{errors.contactUsername}</p>}
                    </div>
                  </div>
                </div>

                {/* Section 3: Business Details */}
                <div className="p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                      <Store className="h-5 w-5 text-[#754319]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Business Details</h3>
                      <p className="text-xs text-gray-400">Information about your business operations</p>
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="text-sm font-medium text-gray-700">Business Logo (Optional)</Label>
                      <div
                        className="relative border-2 border-dashed border-gray-100 rounded-2xl p-6 flex flex-col items-center justify-center gap-1 bg-gray-50/50 hover:bg-gray-50 hover:border-primary/30 transition-all cursor-pointer overflow-hidden group"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {formData.logoUrl ? (
                          <div className="relative w-32 h-32 rounded-xl overflow-hidden shadow-sm border border-gray-200">
                            <img 
                              src={formData.logoUrl} 
                              alt="Business Logo" 
                              className="w-full h-full object-contain bg-white"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <p className="text-white text-[10px] font-bold uppercase">Change Logo</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-100 mb-2 group-hover:scale-110 transition-transform">
                              {isLogoUploading ? (
                                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                              ) : (
                                <Upload className="w-5 h-5 text-primary" />
                              )}
                            </div>
                            <p className="text-sm font-semibold text-gray-900">
                              {isLogoUploading ? "Uploading..." : "Click to upload your logo"}
                            </p>
                            <p className="text-xs text-gray-400 text-center">PNG, JPG, WEBP, or SVG.</p>
                          </>
                        )}
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                          className="hidden"
                          disabled={isLogoUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void handleLogoUpload(f)
                          }}
                        />
                      </div>
                      {formData.logoUrl && (
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] px-2 py-0.5">
                            Logo Uploaded
                          </Badge>
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, logoUrl: ""})}
                            className="text-[10px] text-red-500 hover:underline font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="businessDescription" className="text-sm font-medium text-gray-700">
                        Business Description 
                        <span className="text-[10px] ml-2 font-bold text-slate-400">
                          ({formData.businessDescription.trim().split(/\s+/).filter(Boolean).length}/50 words)
                        </span>
                      </Label>
                      <Textarea 
                        id="businessDescription" 
                        placeholder="Describe your business activities, products, and services" 
                        rows={3} 
                        className={`rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300 ${errors.businessDescription ? 'border-red-500' : ''}`}
                        value={formData.businessDescription}
                        onChange={e => {
                          const val = e.target.value;
                          const words = val.trim().split(/\s+/).filter(Boolean);
                          if (words.length <= 50 || val.length < formData.businessDescription.length) {
                            setFormData({...formData, businessDescription: val});
                          }
                        }}
                      />
                      {errors.businessDescription && <p className="text-[11px] text-red-500 font-medium">{errors.businessDescription}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="websiteUrl" className="text-sm font-medium text-gray-700">Website URL (Optional)</Label>
                      <div className="relative group">
                        <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                        <Input 
                          id="websiteUrl" 
                          type="url" 
                          placeholder="https://yourbusiness.com" 
                          className={`pl-10 h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300 ${errors.websiteUrl ? 'border-red-500' : ''}`}
                          value={formData.websiteUrl}
                          onChange={e => setFormData({...formData, websiteUrl: e.target.value})}
                        />
                      </div>
                      {errors.websiteUrl && <p className="text-[11px] text-red-500 font-medium">{errors.websiteUrl}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="callbackUrl" className="text-sm font-medium text-gray-700">Callback URL (Optional)</Label>
                      <div className="relative group">
                        <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                        <Input 
                          id="callbackUrl" 
                          type="url" 
                          placeholder="https://yourbusiness.com/callback" 
                          className={`pl-10 h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300 ${errors.callbackUrl ? 'border-red-500' : ''}`}
                          value={formData.callbackUrl}
                          onChange={e => setFormData({...formData, callbackUrl: e.target.value})}
                        />
                      </div>
                      {errors.callbackUrl && <p className="text-[11px] text-red-500 font-medium">{errors.callbackUrl}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="category" className="text-sm font-medium text-gray-700">Industry Category</Label>
                      <Select onValueChange={(v) => setFormData({...formData, category: v})} value={formData.category}>
                        <SelectTrigger className={`h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300 ${errors.category ? 'border-red-500' : ''}`}>
                          <SelectValue placeholder="Select Category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.filter(c => c.active).map((cat, i) => (
                            <SelectItem key={i} value={cat.name}>{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.category && <p className="text-[11px] text-red-500 font-medium">{errors.category}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="businessType" className="text-sm font-medium text-gray-700">Business Type</Label>
                      <Select onValueChange={(v) => setFormData({...formData, businessType: v})} value={formData.businessType}>
                        <SelectTrigger className={`h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300 ${errors.businessType ? 'border-red-500' : ''}`}>
                          <SelectValue placeholder="Select Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {businessTypes.filter(bt => bt.active).map((bt, i) => (
                            <SelectItem key={i} value={bt.name}>{bt.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.businessType && <p className="text-[11px] text-red-500 font-medium">{errors.businessType}</p>}
                    </div>
                  </div>
                </div>

                {/* Section 4: Compliance Documents */}
                <div className="p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                      <FileText className="h-5 w-5 text-[#754319]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Compliance Documents</h3>
                      <p className="text-xs text-gray-400">Upload required KYC documentation</p>
                    </div>
                  </div>

                  <div 
                    className={`border-2 border-dashed border-gray-100 rounded-2xl p-10 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 hover:border-primary/30 transition-all cursor-pointer group ${errors.documents ? 'border-red-500' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-100 mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6 text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-gray-900">Upload KYC Documents</p>
                    <p className="text-xs text-gray-400 mt-1 text-center">
                      Supported formats: {allowedTypes.join(', ') || ".pdf, .png, .jpg"}<br/>
                      Maximum file size: {maxFileSizeMB}MB
                    </p>
                    <input 
                      type="file" 
                      multiple 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept={allowedTypes.join(',')}
                    />
                  </div>
                  {errors.documents && <p className="text-[11px] text-red-500 font-medium text-center">{errors.documents}</p>}

                  <div className="grid gap-3">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-1">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden border border-gray-100">
                            {doc.type.startsWith('image/') ? (
                              <img 
                                src={doc.url || ""} 
                                alt={doc.name} 
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  // Fallback if URL is not available yet
                                  (e.target as any).src = "";
                                  (e.target as any).className = "hidden";
                                }}
                              />
                            ) : (
                              <FileText className="w-5 h-5 text-gray-400" />
                            )}
                            {!doc.url && doc.type.startsWith('image/') && <FileText className="w-5 h-5 text-gray-400" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{doc.name}</p>
                            <p className="text-[10px] text-gray-400">{(doc.size / 1024).toFixed(1)} KB • {doc.type.split('/')[1].toUpperCase()}</p>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
                </div>

                <div className="p-8 bg-gray-50/50">
                  <Button type="submit" className="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      "Submit Application"
                    )}
                  </Button>
                  <p className="text-[10px] text-center text-gray-400 mt-4">
                    By submitting, you agree to NibTera Merchants' Merchant Service Agreement and Privacy Policy.
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}