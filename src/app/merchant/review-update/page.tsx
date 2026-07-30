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
  AlertCircle,
  Eye,
  Download
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import type { MerchantDocument } from "@/lib/db"
import Link from "next/link"
import { isValidEmail, isValidPhoneNumber, normalizePhoneNumber } from "@/lib/utils"
import { validateUrl } from "@/lib/url-validation"
import {
  sanitizeAccountNumberInput,
  getAccountNumberValidationError,
} from "@/lib/account-number"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function ReviewUpdateForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const otpRefs = useRef<Array<HTMLInputElement | null>>([])
  
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
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null)

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(0, 1)
    const nextDigits = otp.padEnd(6, "").split("").slice(0, 6)
    nextDigits[index] = digit
    const nextOtp = nextDigits.join("").trimEnd()
    setOtp(nextOtp)

    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      const prev = otpRefs.current[index - 1]
      prev?.focus()
    }
  }

  const handleOtpPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (!pasted) return
    event.preventDefault()
    setOtp(pasted)
    const focusIndex = Math.min(pasted.length, 5)
    requestAnimationFrame(() => otpRefs.current[focusIndex]?.focus())
  }

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
      
      const contentType = res.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid server response. Please try again later.")
      }

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
      
      const contentType = res.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid server response. Please try again later.")
      }

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
    const accountNumberError = getAccountNumberValidationError(formData.accountNumber)
    if (accountNumberError) newErrors.accountNumber = accountNumberError
    if (isNaN(Number(formData.dailyLimit))) newErrors.dailyLimit = "Daily limit must be a number"
    if (isNaN(Number(formData.transactionLimit))) newErrors.transactionLimit = "Transaction limit must be a number"
    if (documents.length === 0) newErrors.documents = "Upload at least one document"

    // Website URL validation
    const websiteUrlValidation = validateUrl(formData.websiteUrl, 'website')
    if (!websiteUrlValidation.valid) {
      newErrors.websiteUrl = websiteUrlValidation.error
    }

    // Callback URL validation
    const callbackUrlValidation = validateUrl(formData.callbackUrl, 'callback')
    if (!callbackUrlValidation.valid) {
      newErrors.callbackUrl = callbackUrlValidation.error
    }

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
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
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
      </div>
    )
  }

  if (step === 'validate') return <div className="min-h-screen bg-white flex items-center gap-2"><Loader2 className="animate-spin" /> Validating link...</div>

  if (step === 'otp') {

    return (
      <div className="min-h-screen relative overflow-hidden bg-white">
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-br from-[#f4db9f]/30 to-[#f8b513]/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-20 w-80 h-80 bg-gradient-to-tl from-[#f8b513]/25 to-[#754319]/15 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-gradient-to-r from-[#754319]/20 to-[#f4db9f]/15 rounded-full blur-2xl animate-pulse delay-500" />
          
          <div className="absolute inset-0 opacity-5">
            <svg className="w-full h-full min-w-full min-h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="honeycomb" x="0" y="0" width="60" height="52" patternUnits="userSpaceOnUse">
                  <polygon points="30,5 50,15 50,35 30,45 10,35 10,15" fill="none" stroke="#754319" strokeWidth="1"/>
                  <polygon points="0,26 20,36 20,56 0,66 -20,56 -20,36" fill="none" stroke="#754319" strokeWidth="1"/>
                  <polygon points="60,26 80,36 80,56 60,66 40,56 40,36" fill="none" stroke="#754319" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#honeycomb)" />
            </svg>
          </div>
        </div>

        <div className="relative z-10 min-h-screen flex items-center justify-center p-8">
          <div className="w-full max-w-md animate-fade-in-up">
            <div className="backdrop-blur-md bg-white/60 border border-white/40 rounded-2xl shadow-2xl p-8 space-y-8">
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">Verify Identity</h1>
                <p className="text-[#6B7280] font-medium">
                  Security check
                </p>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-50 rounded-xl p-5 text-center">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Enter the code sent to your {merchant.contactType}: <span className="font-bold text-slate-900">{merchant.contactUsername}</span>
                  </p>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button
                      variant="link"
                      className="text-xs font-bold text-[#f8b513] hover:text-[#754319]"
                      onClick={handleSendOtp}
                      disabled={submittingAction !== null}
                    >
                      {submittingAction === 'send_otp' ? <Loader2 className="animate-spin mr-2" /> : "Send OTP"}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-medium uppercase tracking-widest text-amber-800/60">OTP Code</Label>
                    <div className="flex items-center justify-center gap-2">
                      {Array.from({ length: 6 }).map((_, index) => {
                        const digit = otp[index] ?? ""
                        return (
                          <input
                            key={index}
                            ref={(el) => {
                              otpRefs.current[index] = el
                            }}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => {
                              handleOtpChange(index, e.target.value)
                            }}
                            onKeyDown={(event) => handleOtpKeyDown(index, event)}
                            onPaste={handleOtpPaste}
                            className="w-12 h-14 rounded-2xl border border-[#E5E7EB] bg-white/80 text-center text-xl font-semibold tracking-[0.35em] focus:border-[#f8b513] focus:ring-2 focus:ring-[#f8b513]/20 outline-none transition shadow-sm"
                          />
                        )
                      })}
                    </div>
                    <p className="text-xs text-[#6B7280] mt-1 text-center">Code expires in 5 minutes.</p>
                  </div>
                  <Button 
                    className="w-full h-12 text-base font-bold rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 hover:-translate-y-0.5 transition-all duration-300" 
                    onClick={handleVerifyOtp} 
                    disabled={submittingAction !== null || otp.length < 6}
                  >
                    {submittingAction === 'verify_otp' ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Verify & Continue"}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full h-10 text-xs font-bold text-[#f8b513] hover:text-[#754319] transition-colors" 
                    onClick={handleSendOtp} 
                    disabled={submittingAction !== null}
                  >
                    {submittingAction === 'send_otp' ? <Loader2 className="animate-spin mr-2" /> : "Resend verification code"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'review') {
    return (<>
      <div className="min-h-screen bg-white flex items-start justify-center p-4">
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
                      id="accountNumber"
                      inputMode="numeric"
                      placeholder="7000123456789"
                      maxLength={13}
                      className={`h-11 rounded-xl ${errors.accountNumber ? 'border-red-500' : ''}`}
                      value={formData.accountNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accountNumber: sanitizeAccountNumberInput(e.target.value),
                        })
                      }
                    />
                    <p className="text-xs text-gray-400">Must start with 7000, digits only, exactly 13 characters.</p>
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
                      {formData.logoUrl ? (
                        <div className="relative group w-20 h-20 rounded-xl border border-[#eadcc4] overflow-hidden bg-white flex-shrink-0 shadow-sm">
                          <img src={formData.logoUrl} alt="Business logo" className="w-full h-full object-contain p-1" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          <button
                            type="button"
                            onClick={() => setPreviewFile({ url: formData.logoUrl, name: "Business Logo", type: "image/png" })}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <Eye className="w-5 h-5 text-white" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-7 h-7 text-gray-300" />
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
                      className={`h-11 rounded-xl ${errors.websiteUrl ? 'border-red-500' : ''}`}
                      value={formData.websiteUrl}
                      maxLength={255}
                      onChange={e => setFormData({...formData, websiteUrl: e.target.value})}
                    />
                    {errors.websiteUrl && <p className="text-[11px] text-red-500 font-medium">{errors.websiteUrl}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Callback URL (Optional)</Label>
                    <Input 
                      className={`h-11 rounded-xl ${errors.callbackUrl ? 'border-red-500' : ''}`}
                      value={formData.callbackUrl}
                      maxLength={2048}
                      onChange={e => setFormData({...formData, callbackUrl: e.target.value})}
                    />
                    {errors.callbackUrl && <p className="text-[11px] text-red-500 font-medium">{errors.callbackUrl}</p>}
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
                    <div key={doc.id} className="group flex items-center justify-between p-3 border rounded-xl bg-white shadow-sm hover:border-[#f8b513]/40 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden border border-gray-100">
                          {doc.type?.startsWith('image/') && doc.url ? (
                            <img src={doc.url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-slate-400" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-[200px]">{doc.name}</p>
                          <p className="text-[10px] text-slate-400">{(doc.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 hover:bg-amber-50 hover:text-amber-600" onClick={() => setPreviewFile({ url: doc.url, name: doc.name, type: doc.type })}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-rose-50" onClick={() => removeDoc(doc.id)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-8 bg-slate-50/50">
                <Button type="submit" className="w-full h-12 text-base font-bold rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all" disabled={submittingAction !== null}>
                  {submittingAction === 'resubmit' ? <Loader2 className="animate-spin mr-2" /> : <ArrowRight className="w-5 h-5 mr-2" />}
                  Resubmit Application
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* File preview modal */}
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
    </>)
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
            <Button className="w-full h-12 rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 font-medium transition-all" asChild>
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
    <div className="min-h-screen w-full">
      <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
        <ReviewUpdateForm />
      </Suspense>
    </div>
  )
}
