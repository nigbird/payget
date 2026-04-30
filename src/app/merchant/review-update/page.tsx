"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Loader2, 
  Store, 
  Globe, 
  Building2, 
  User, 
  Link as LinkIcon,
  FileText,
  Upload,
  X,
  CreditCard,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ShieldCheck,
  MessageSquare,
  ArrowRight,
  AlertCircle
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { MerchantDocument } from "@/app/lib/db"
import Link from "next/link"
import { isValidEmail, isValidPhoneNumber, normalizePhoneNumber } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function ReviewUpdateForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  
  const token = searchParams.get('token')
  
  const [step, setStep] = useState<'validate' | 'otp' | 'review' | 'success'>('validate')
  const [merchant, setMerchant] = useState<any>(null)
  const [otp, setOtp] = useState("")
  const [submittingAction, setSubmittingAction] = useState<string | null>(null)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [systemConfig, setSystemConfig] = useState<any>({
    allowedFileTypes: [],
    maxFileSizeMB: 5
  })
  const [categories, setCategories] = useState<{ name: string; active: boolean }[]>([])
  const [businessTypes, setBusinessTypes] = useState<{ name: string; active: boolean }[]>([])
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    accountNumber: "",
    logoUrl: "",
    dailyLimit: "0",
    transactionLimit: "0",
    dailyCountLimit: "0",
    businessDescription: "",
    websiteUrl: "",
    callbackUrl: "",
    contactName: "",
    contactUsername: "",
    category: "",
    businessType: ""
  })
  
  const [documents, setDocuments] = useState<MerchantDocument[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!token) {
      setError("Missing token")
      return
    }
    validateToken()
    fetchSystemConfig()
  }, [token])

  const fetchSystemConfig = async () => {
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
        setCategories(masterData.categories || [])
        setBusinessTypes(masterData.businessTypes || [])
      }
    } catch (error) {
      console.error('Failed to fetch config:', error)
    }
  }

  const validateToken = async () => {
    try {
      const res = await fetch(`/api/auth/merchant-update/validate?token=${token}`)
      const data = await res.json()
      if (res.ok) {
        setMerchant(data.merchant)
        setStep('otp')
      } else {
        setError(data.error || "Invalid token")
      }
    } catch (e) {
      setError("Connection error")
    }
  }

  const handleSendOtp = async () => {
    setSubmittingAction('send_otp')
    try {
      const res = await fetch('/api/auth/merchant-update/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })
      if (res.ok) {
        toast({ title: "OTP Sent", description: `A verification code has been sent to your ${merchant.contactType}.` })
      } else {
        const data = await res.json()
        toast({ variant: "destructive", title: "Failed to send OTP", description: data.error })
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to connect to server" })
    } finally {
      setSubmittingAction(null)
    }
  }

  const handleVerifyOtp = async () => {
    if (!otp) return
    setSubmittingAction('verify_otp')
    try {
      const res = await fetch('/api/auth/merchant-update/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, otp })
      })
      if (res.ok) {
        fetchDetails()
      } else {
        const data = await res.json()
        toast({ variant: "destructive", title: "Verification Failed", description: data.error })
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to connect to server" })
    } finally {
      setSubmittingAction(null)
    }
  }

  const fetchDetails = async () => {
    try {
      const res = await fetch(`/api/merchants/update-details?token=${token}`)
      const data = await res.json()
      if (res.ok) {
        setMerchant(data.merchant)
        setFormData({
          name: data.merchant.name || "",
          email: data.merchant.email || "",
          accountNumber: data.merchant.accountNumber || "",
          logoUrl: data.merchant.logoUrl || "",
          dailyLimit: String(data.merchant.dailyLimit || 0),
          transactionLimit: String(data.merchant.transactionLimit || 0),
          dailyCountLimit: String(data.merchant.dailyCountLimit || 0),
          businessDescription: data.merchant.businessDescription || "",
          websiteUrl: data.merchant.websiteUrl || "",
          callbackUrl: data.merchant.callbackUrl || "",
          contactName: data.merchant.contactName || "",
          contactUsername: data.merchant.contactUsername || "",
          category: data.merchant.category || "",
          businessType: data.merchant.businessType || ""
        })
        setDocuments(data.merchant.documents || [])
        setStep('review')
      } else {
        setError(data.error || "Failed to fetch details")
      }
    } catch (e) {
      setError("Connection error")
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024
    const MAX_TOTAL_BYTES = 15 * 1024 * 1024
    const allowedTypes = systemConfig.allowedFileTypes
    
    let currentTotalSize = documents.reduce((sum, doc) => sum + doc.size, 0)
    const newFiles = Array.from(files)
    const validFiles: File[] = []
    
    for (const file of newFiles) {
      const extension = `.${file.name.split('.').pop()?.toLowerCase()}`
      if (!allowedTypes.includes(extension)) {
        toast({ variant: "destructive", title: "Invalid File Type", description: `${file.name} is not supported.` })
        continue
      }
      if (file.size > MAX_SINGLE_FILE_BYTES) {
        toast({ variant: "destructive", title: "File Too Large", description: `${file.name} exceeds 5MB.` })
        continue
      }
      if (currentTotalSize + file.size > MAX_TOTAL_BYTES) {
        toast({ variant: "destructive", title: "Total Size Exceeded", description: "Total size cannot exceed 15MB." })
        break
      }
      currentTotalSize += file.size
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    setSubmittingAction('upload_docs')
    try {
      const fd = new FormData()
      validFiles.forEach(file => fd.append("files", file))
      const res = await fetch("/api/uploads/compliance-docs", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")
      setDocuments(prev => [...prev, ...data.documents])
      toast({ title: "Files Uploaded", description: `${validFiles.length} document(s) uploaded.` })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: error.message })
    } finally {
      setSubmittingAction(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
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
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Logo upload failed")
      setFormData(prev => ({ ...prev, logoUrl: data.url }))
    } catch (e: any) {
      toast({ variant: "destructive", title: "Upload failed", description: e?.message })
    } finally {
      setIsLogoUploading(false)
    }
  }

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    const newErrors: Record<string, string> = {}
    
    if (!formData.name?.trim()) newErrors.name = "Business name is required"
    if (!formData.email?.trim() || !isValidEmail(formData.email)) newErrors.email = "Valid business email is required"
    if (!formData.contactName?.trim()) newErrors.contactName = "Contact name is required"
    if (!formData.category) newErrors.category = "Category is required"
    if (!formData.businessType) newErrors.businessType = "Business type is required"
    if (!formData.accountNumber?.trim()) newErrors.accountNumber = "Account number is required"
    if (isNaN(Number(formData.dailyLimit))) newErrors.dailyLimit = "Daily limit must be a number"
    if (isNaN(Number(formData.transactionLimit))) newErrors.transactionLimit = "Transaction limit must be a number"
    if (documents.length === 0) newErrors.documents = "Upload at least one document"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      toast({ variant: "destructive", title: "Validation Error", description: "Please fix form errors." })
      return
    }

    setSubmittingAction('resubmit')
    try {
      const res = await fetch('/api/merchants/resubmit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...formData, documents })
      })
      if (res.ok) {
        setStep('success')
      } else {
        const data = await res.json()
        toast({ variant: "destructive", title: "Resubmission Failed", description: data.error })
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Connection error" })
    } finally {
      setSubmittingAction(null)
    }
  }

  if (error) {
    return (
      <Card className="max-w-md w-full shadow-lg border-none">
        <CardHeader className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <CardTitle className="text-red-600">Invalid or Expired Link</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        {/* <CardFooter>
          <Button variant="outline" className="w-full" onClick={() => router.push('/')}>Return Home</Button>
        </CardFooter> */}
      </Card>
    )
  }

  if (step === 'validate') return <div className="flex items-center gap-2"><Loader2 className="animate-spin" /> Validating link...</div>

  if (step === 'otp') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-sm border border-slate-100 animate-in zoom-in-95 rounded-2xl overflow-hidden bg-white">
          <div className="p-8 text-center border-b border-slate-50">
            <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-xl font-medium text-slate-800 tracking-tight">Verify Identity</h3>
            <p className="text-slate-500 mt-1 text-sm">Security check</p>
          </div>
          <CardContent className="py-8 px-8 space-y-6">
            <div className="bg-slate-50 rounded-xl p-5 text-center">
              <p className="text-sm text-slate-600 leading-relaxed">
                Enter the code sent to your {merchant.contactType}: <span className="font-bold text-slate-900">{merchant.contactUsername}</span>
              </p>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="link"
                  className="text-xs font-bold text-amber-600 hover:text-amber-700"
                  onClick={handleSendOtp}
                  disabled={submittingAction !== null}
                >
                  {submittingAction === 'send_otp' ? <Loader2 className="animate-spin mr-2" /> : "Send OTP"}
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Verification Code</Label>
                <Input 
                  placeholder="Enter 6-digit code" 
                  className="h-12 rounded-xl text-center text-lg tracking-widest font-bold border-slate-200 bg-white shadow-sm focus:ring-amber-500/20"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                />
              </div>
              <Button 
                className="w-full h-12 rounded-xl bg-amber-600 text-white hover:bg-amber-700 font-bold shadow-sm transition-all" 
                onClick={handleVerifyOtp} 
                disabled={submittingAction !== null || otp.length < 6}
              >
                {submittingAction === 'verify_otp' ? <Loader2 className="animate-spin mr-2" /> : "Verify & Continue"}
              </Button>
              <Button 
                variant="ghost" 
                className="w-full h-10 text-xs font-bold text-amber-600 hover:text-amber-700 hover:bg-amber-50" 
                onClick={handleSendOtp} 
                disabled={submittingAction !== null}
              >
                {submittingAction === 'send_otp' ? <Loader2 className="animate-spin mr-2" /> : "Resend code"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'review') {
    return (
      <div className="max-w-5xl w-full py-8 space-y-10">
        <div className="relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#eadcc4]/40">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 shadow-sm">
                <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">
                  Correction Required
                </span>
              </div>
              <div className="space-y-1">
                <h2 className="text-4xl font-black tracking-tight text-gray-900">Update Your Application</h2>
                <p className="text-sm text-gray-500 font-medium max-w-xl">
                  Review the feedback from our compliance team and resubmit your corrected information.
                </p>
              </div>
            </div>
          </div>
        </div>

        <Card className="border-amber-200 bg-amber-50/50 rounded-[26px]">
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-800">
              <MessageSquare className="w-5 h-5" />
              <CardTitle className="text-lg">Reviewer Feedback</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-900 font-medium leading-relaxed break-words">
              {merchant.updateComments?.general || "Please review all fields and documents for accuracy."}
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[26px] border border-[#eddcc0] bg-white/90 shadow-xl">
          <CardContent className="p-0">
            <form onSubmit={handleResubmit} className="divide-y divide-gray-100">
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                    <Building2 className="h-5 w-5 text-[#754319]" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Company Profile</h3>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Business Name</Label>
                    <Input 
                      maxLength={50}
                      className={`h-11 rounded-xl ${errors.name ? 'border-red-500' : ''}`}
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Business Email</Label>
                    <Input 
                      maxLength={50}
                      className={`h-11 rounded-xl ${errors.email ? 'border-red-500' : ''}`}
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Settlement Account Number</Label>
                    <Input 
                      maxLength={15}
                      className={`h-11 rounded-xl ${errors.accountNumber ? 'border-red-500' : ''}`}
                      value={formData.accountNumber}
                      onChange={e => setFormData({...formData, accountNumber: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                    <User className="h-5 w-5 text-[#754319]" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Authorized Contact</h3>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input 
                      maxLength={50}
                      className={`h-11 rounded-xl ${errors.contactName ? 'border-red-500' : ''}`}
                      value={formData.contactName}
                      onChange={e => setFormData({...formData, contactName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email or Phone Number</Label>
                    <Input 
                      maxLength={50}
                      className={`h-11 rounded-xl ${errors.contactUsername ? 'border-red-500' : ''}`}
                      value={formData.contactUsername}
                      onChange={e => setFormData({...formData, contactUsername: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                    <Store className="h-5 w-5 text-[#754319]" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Business Details</h3>
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Business Logo (Optional)</Label>
                    <div className="flex items-center gap-4">
                      {formData.logoUrl && (
                        <div className="w-20 h-20 rounded-xl border overflow-hidden bg-white flex-shrink-0">
                          <img src={formData.logoUrl} className="w-full h-full object-contain" />
                        </div>
                      )}
                      <Button variant="outline" type="button" onClick={() => logoInputRef.current?.click()} disabled={isLogoUploading}>
                        {isLogoUploading ? <Loader2 className="animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                        Change Logo
                      </Button>
                      <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Business Description</Label>
                    <Textarea 
                      rows={3}
                      className="rounded-xl"
                      value={formData.businessDescription}
                      maxLength={500}
                      onChange={e => setFormData({...formData, businessDescription: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Website URL (Optional)</Label>
                    <Input 
                      className="h-11 rounded-xl"
                      value={formData.websiteUrl}
                      maxLength={255}
                      onChange={e => setFormData({...formData, websiteUrl: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Callback URL (Optional)</Label>
                    <Input 
                      className="h-11 rounded-xl"
                      value={formData.callbackUrl}
                      maxLength={255}
                      onChange={e => setFormData({...formData, callbackUrl: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry Category</Label>
                    <Select onValueChange={v => setFormData({...formData, category: v})} value={formData.category}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Business Type</Label>
                    <Select onValueChange={v => setFormData({...formData, businessType: v})} value={formData.businessType}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {businessTypes.map(bt => <SelectItem key={bt.name} value={bt.name}>{bt.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eddcc0] bg-[#fff8ea]">
                    <FileText className="h-5 w-5 text-[#754319]" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Compliance Documents</h3>
                </div>
                <div 
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center bg-slate-50 transition-all ${submittingAction === 'upload_docs' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100 cursor-pointer'}`}
                  onClick={() => submittingAction !== 'upload_docs' && fileInputRef.current?.click()}
                >
                  {submittingAction === 'upload_docs' ? (
                    <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                  ) : (
                    <Upload className="w-8 h-8 text-primary mb-2" />
                  )}
                  <p className="text-sm font-semibold">
                    {submittingAction === 'upload_docs' ? "Uploading documents..." : "Upload Replacement or Additional Documents"}
                  </p>
                  <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                </div>
                <div className="grid gap-3">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-xl bg-white shadow-sm">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium truncate max-w-[250px]">{doc.name}</p>
                          <p className="text-[10px] text-slate-400">{(doc.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="text-red-500" onClick={() => removeDoc(doc.id)}><X className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-8 bg-slate-50/50">
                <Button type="submit" className="w-full h-12 text-base font-bold rounded-xl bg-amber-600 hover:bg-amber-700 shadow-lg" disabled={submittingAction !== null}>
                  {submittingAction === 'resubmit' ? <Loader2 className="animate-spin mr-2" /> : <ArrowRight className="w-5 h-5 mr-2" />}
                  Resubmit Application
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-sm border border-slate-100 animate-in zoom-in-95 rounded-2xl overflow-hidden bg-white">
          <div className="p-8 text-center border-b border-slate-50">
            <div className="mx-auto w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-xl font-medium text-slate-800 tracking-tight">Application Resubmitted</h3>
            <p className="text-slate-500 mt-1 text-sm">Update received</p>
          </div>
          <CardContent className="py-8 px-8 space-y-6">
            <div className="bg-slate-50 rounded-xl p-5 text-center">
              <p className="text-sm text-slate-600 leading-relaxed">
                Your corrections have been successfully received. Our compliance team will <span className="font-medium text-slate-900">Review Them Shortly</span>.
              </p>
              <p className="text-sm text-slate-500 mt-3">
                You will be notified via email or SMS once the final decision has been made.
              </p>
            </div>
          </CardContent>
          <CardFooter className="px-8 pb-8 pt-2">
            <Button className="w-full h-12 rounded-xl bg-amber-600 text-white hover:bg-amber-700 font-medium shadow-sm transition-all" asChild>
              <Link href="/">Return to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return null
}

export default function ReviewUpdatePage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-primary" />}>
        <ReviewUpdateForm />
      </Suspense>
    </div>
  )
}
