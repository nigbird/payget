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
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  Loader2, 
  Sparkles, 
  Store, 
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
    districts: [],
    branches: [],
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
        const [configRes, masterDataRes] = await Promise.all([
          fetch('/api/system-config'),
          fetch('/api/master-data')
        ])
        if (configRes.ok) {
          const config = await configRes.json()
          setSystemConfig(config)
        }
        if (masterDataRes.ok) {
          const masterData = await masterDataRes.json()
          setCategories(masterData.categories || [])
          setBusinessTypes(masterData.businessTypes || [])
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
      }
    }
    fetchConfig()
  }, [])

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
          description: `${file.name} exceeds the ${systemConfig.maxFileSizeMB}MB limit.`
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
    
    if (documents.length === 0) {
      toast({
        variant: "destructive",
        title: "Documents Required",
        description: "Please upload at least one compliance document."
      })
      return
    }

    if (!formData.branchName || !formData.district) {
      toast({
        variant: "destructive",
        title: "Missing Selections",
        description: "Please select your preferred branch and district."
      })
      return
    }

    setIsSubmitting(true)
    
    const merchantId = `m_${Math.random().toString(36).substr(2, 9)}`
    
    try {
      const response = await fetch('/api/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: merchantId,
          ...formData,
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
        throw new Error('Failed to register')
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: "Could not submit your application at this time."
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
            <Button className="w-full h-14 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200 font-bold" asChild>
              <Link href="/">Return to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20">
      <header className="bg-white/80 backdrop-blur-md border-b h-16 flex items-center px-4 sticky top-0 z-50">
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

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Register Your Business</h2>
            <p className="text-gray-500 max-w-lg mx-auto">
              Complete the information below to start processing payments with NibTera Merchants.
            </p>
          </div>

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
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Company Profile</h3>
                      <p className="text-xs text-gray-400">Basic information about your legal entity</p>
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="text-sm font-medium text-gray-700">Business Logo (optional)</Label>
                      <div
                        className="border-2 border-dashed border-gray-100 rounded-2xl p-6 flex flex-col gap-1 bg-gray-50/50 hover:bg-gray-50 hover:border-primary/30 transition-all cursor-pointer"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        <p className="text-sm font-semibold text-gray-900">
                          {isLogoUploading ? "Uploading..." : "Click to upload your logo"}
                        </p>
                        <p className="text-xs text-gray-400">PNG, JPG, WEBP, or SVG.</p>
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
                      {formData.logoUrl ? (
                        <p className="text-xs text-gray-500">
                          Uploaded: <span className="font-mono">{formData.logoUrl}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">No logo uploaded.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium text-gray-700">Business Legal Name</Label>
                      <Input 
                        id="name" 
                        placeholder="e.g. Acme Retail Ltd" 
                        required 
                        className="h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-gray-700">Business Email</Label>
                      <div className="relative group">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                        <Input 
                          id="email" 
                          type="email" 
                          className="pl-10 h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                          placeholder="legal@business.com" 
                          required 
                          value={formData.email}
                          onChange={e => setFormData({...formData, email: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="accountNumber" className="text-sm font-medium text-gray-700">Settlement Account Number</Label>
                      <Input
                        id="accountNumber"
                        inputMode="numeric"
                        placeholder="e.g. 1234567890"
                        required
                        className="h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                        value={formData.accountNumber}
                        onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      />
                      <p className="text-xs text-gray-400">Payments will be settled to this account number.</p>
                    </div>
                  </div>
                </div>

                {/* Section 2: Authorized Contact */}
                <div className="p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                      <User className="w-5 h-5 text-gray-400" />
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
                        className="h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                        value={formData.contactName}
                        onChange={e => setFormData({...formData, contactName: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactUsername" className="text-sm font-medium text-gray-700">Username (Email or Phone Number)</Label>
                      <div className="relative group">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                        <Input 
                          id="contactUsername" 
                          className="pl-10 h-11 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-gray-300"
                          placeholder="email@example.com or +1234567890" 
                          required 
                          value={formData.contactUsername}
                          onChange={e => setFormData({...formData, contactUsername: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: Business Location */}
                <div className="p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                      <MapPin className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Business Location</h3>
                      <p className="text-xs text-gray-400">Where your business is physically located</p>
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
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
                          {(systemConfig.districts || []).map((district: string) => (
                            <SelectItem key={district} value={district}>{district}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="branchName" className="text-sm font-medium text-gray-700">Processing Hub</Label>
                      <Select 
                        value={formData.branchName} 
                        onValueChange={(val) => setFormData({...formData, branchName: val})}
                      >
                        <SelectTrigger id="branchName" className="h-11 rounded-xl border-gray-200 focus:ring-primary/20 transition-all">
                          <SelectValue placeholder="Select Processing Hub" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-gray-100">
                          {(systemConfig.branches || []).map((branch: string) => (
                            <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Section 4: Compliance Documents */}
                <div className="p-8 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                      <FileText className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Compliance Documents</h3>
                      <p className="text-xs text-gray-400">Upload required KYC documentation</p>
                    </div>
                  </div>

                  <div 
                    className="border-2 border-dashed border-gray-100 rounded-2xl p-10 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 hover:border-primary/30 transition-all cursor-pointer group"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-100 mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6 text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-gray-900">Upload KYC Documents</p>
                    <p className="text-xs text-gray-400 mt-1 text-center">
                      Supported formats: {(systemConfig.allowedFileTypes || []).join(', ')}<br/>
                      Maximum file size: {systemConfig.maxFileSizeMB}MB
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
                            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                              <FileCheck className="w-4 h-4 text-green-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{doc.name}</p>
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