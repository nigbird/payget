"use client"

import { useEffect, useState, Suspense } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Loader2, AlertCircle, Lock, CheckCircle2, XCircle, Clock,
  Eye, EyeOff, Phone, CreditCard, Copy, Check, Building,
  FileText, ArrowRight, Receipt
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { PasswordStrength } from "@/components/auth/password-strength"
import { validatePassword } from "@/lib/password-policy"
import { QRCodeSVG } from "qrcode.react"
import { Separator } from "@/components/ui/separator"

type ResolvedPayment = {
  merchantId: string
  merchantName: string
  merchantLogoUrl?: string | null
  merchantAccountNumber: string
  transactionId: string
  transactionReference: string
  amount: number
  serviceDescription: string
  status: string
  transactionTimestamp: string
  payerPhone: string
}


function OpaqueLinkContent() {
  const params = useParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [tokenType, setTokenType] = useState<string | null>(null)
  const [tokenData, setTokenData] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const token = params.token as string

  useEffect(() => {
    const checkToken = async () => {
      try {
        const res = await fetch(`/api/opaque-token/resolve?token=${encodeURIComponent(token)}`)
        if (res.ok) {
          const data = await res.json()
          setTokenType(data.type)
          setTokenData(data.data)
          setStatus('success')
        } else {
          const err = await res.json()
          setError(err.error || 'Invalid link')
          setStatus('error')
        }
      } catch {
        setError('Could not verify link')
        setStatus('error')
      }
    }
    checkToken()
  }, [token])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    )
  }

  if (status === 'error' || !tokenType) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center border-none shadow-lg">
          <CardContent className="pt-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
              <AlertCircle className="text-red-600 w-6 h-6" />
            </div>
            <h1 className="text-xl font-medium text-amber-900">Invalid or Expired Link</h1>
            <p className="text-sm text-amber-800/70">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  switch (tokenType) {
    case 'PAYMENT':
      return <PayLinkPageStandalone token={tokenData!.originalToken} />
    case 'PASSWORD_SETUP':
      return (
        <Suspense fallback={
          <div className="min-h-screen bg-white flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
          </div>
        }>
          <SetupPasswordFormStandalone merchantId={tokenData!.merchantId} token={tokenData!.originalToken} />
        </Suspense>
      )
    case 'RESET_PASSWORD':
      router.push(`/reset-password/${tokenData!.originalToken}`)
      return null
    case 'MERCHANT_UPDATE':
      router.push(`/merchant/review-update?token=${tokenData!.originalToken}`)
      return null
    default:
      return <div>Unknown token type</div>
  }
}

function SetupPasswordFormStandalone({ merchantId, token }: { merchantId: string; token: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords do not match",
        description: "Please ensure both password fields match."
      })
      return
    }

    const policy = validatePassword(password)
    if (!policy.valid) {
      toast({
        variant: "destructive",
        title: "Password does not meet requirements",
        description: policy.errors[0] ?? "Password does not meet the required policy."
      })
      return
    }

    setIsSubmitting(true)
    
    try {
      const response = await fetch(`/api/merchants/${merchantId}/setup-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, token })
      })

      if (response.ok) {
        setIsSuccess(true)
        toast({
          title: "Account Activated!",
          description: "Your password has been set and your account is now active."
        })
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to set password')
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Setup Failed",
        description: error.message
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-white">
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-br from-[#f4db9f]/30 to-[#f8b513]/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-20 w-80 h-80 bg-gradient-to-tl from-[#f8b513]/25 to-[#754319]/15 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-gradient-to-r from-[#754319]/20 to-[#f4db9f]/15 rounded-full blur-2xl animate-pulse delay-500" />
          
          <div className="absolute inset-0 opacity-5">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
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
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-2">
                  <CheckCircle2 className="text-green-600 w-6 h-6" />
                </div>
                <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">Account Activated!</h1>
                <p className="text-[#6B7280] font-medium">
                  Your account has been successfully approved and activated.
                </p>
              </div>
              <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] text-left space-y-3">
                <p className="text-sm leading-relaxed text-[#374151]">
                  You can now log in to the merchant portal using your registered Username (Email/Phone) and the password you just created.
                </p>
              </div>
              <Button 
                className="w-full h-12 text-base font-bold rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300" 
                onClick={() => router.push('/login/merchant')}
              >
                Continue to Login
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-white">
      {/* Animated Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-br from-[#f4db9f]/30 to-[#f8b513]/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-gradient-to-tl from-[#f8b513]/25 to-[#754319]/15 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-gradient-to-r from-[#754319]/20 to-[#f4db9f]/15 rounded-full blur-2xl animate-pulse delay-500" />
        
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
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
              <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">
                Set Up Your Password
              </h1>
              <p className="text-[#6B7280] font-medium">
                Create a password to activate your merchant portal access.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2.5">
                <Label htmlFor="password" className="text-sm font-semibold text-[#374151]">New Password</Label>
                <div className="relative group transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"} 
                    className="h-12 pl-10 pr-12 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#6B7280] hover:text-[#f8b513] transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>
              
              <div className="space-y-2.5">
                <Label htmlFor="confirmPassword" className="text-sm font-semibold text-[#374151]">Confirm Password</Label>
                <div className="relative group transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                  <Input 
                    id="confirmPassword" 
                    type={showConfirmPassword ? "text" : "password"} 
                    className="h-12 pl-10 pr-12 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                    placeholder="••••••••"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#6B7280] hover:text-[#f8b513] transition-colors"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full h-12 text-base font-bold rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 hover:-translate-y-0.5 transition-all duration-300" 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Activating...
                  </>
                ) : "Activate & Set Password"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

function PayLinkPageStandalone({ token }: { token: string }) {
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payment, setPayment] = useState<ResolvedPayment | null>(null)
  const [merchantSessionToken, setMerchantSessionToken] = useState<string | null>(null)

  const [processing, setProcessing] = useState(false)
  const [pushSent, setPushSent] = useState(false)
  const [view, setView] = useState<"checkout" | "success" | "failed" | "pending">("checkout")
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast({ description: "Account number copied to clipboard" })
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadReceipt = async (transactionId: string) => {
    setDownloadingReceipt(true)
    try {
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ variant: "destructive", title: "Receipt unavailable", description: data.error || "Could not generate receipt." })
        return
      }
      window.open(data.viewUrl, "_blank", "noopener,noreferrer")
    } catch {
      toast({ variant: "destructive", title: "Receipt unavailable", description: "Could not connect to receipt service." })
    } finally {
      setDownloadingReceipt(false)
    }
  }

  useEffect(() => {
    const run = async () => {
      if (!token) { setError("Missing token"); setLoading(false); return }
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/payments/resolve?token=${encodeURIComponent(token)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError(data?.error || "Invalid or expired link"); setLoading(false); return }
        setPayment(data)
        setMerchantSessionToken(data.merchantSessionToken)
        if (data?.status === "success") setView("success")
        else if (data?.status === "failed") setView("failed")
      } catch {
        setError("Could not resolve payment link")
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [token])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (pushSent && view === "checkout") {
      let pollCount = 0
      const maxPolls = 100
      interval = setInterval(async () => {
        pollCount++
        if (pollCount > maxPolls) { clearInterval(interval); setView("pending"); return }
        try {
          const res = await fetch(`/api/pay/status/${payment?.transactionId}`)
          const data = await res.json().catch(() => ({}))
          if (res.ok) {
            if (data?.status === "success") {
              clearInterval(interval)
              const txRes = await fetch(`/api/payments/resolve?token=${encodeURIComponent(token)}`)
              if (txRes.ok) setPayment(await txRes.json().catch(() => payment))
              setView("success")
            } else if (data?.status === "failed") {
              clearInterval(interval)
              const txRes = await fetch(`/api/payments/resolve?token=${encodeURIComponent(token)}`)
              if (txRes.ok) setPayment(await txRes.json().catch(() => payment))
              setView("failed")
            }
          }
        } catch (err) { console.error("Polling error:", err) }
      }, 3000)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [pushSent, view, token, payment?.transactionId])

  const handleExecute = async () => {
    if (!payment) return
    setProcessing(true)
    try {
      const res = await fetch("/api/provider/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, merchantSessionToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ variant: "destructive", title: "Payment failed", description: data?.error || "Try again." })
        setProcessing(false)
        return
      }
      setPushSent(true)
      setPayment(prev => prev ? { ...prev, status: "awaiting_pin" } : null)
    } catch {
      toast({ variant: "destructive", title: "Payment error", description: "Could not initiate USSD push." })
    } finally {
      setProcessing(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !payment) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-2 border border-rose-100">
          <XCircle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Invalid Payment Link</h1>
        <p className="text-sm text-slate-500 max-w-xs">{error || "This payment link is invalid or has expired."}</p>
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (view === "success") {
    const transactionAmount = payment.amount.toFixed(2)
    const transactionDate = new Date(payment.transactionTimestamp).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    })
    const qrData = `TXN:${payment.transactionReference}|AMT:${transactionAmount}|DATE:${transactionDate}|FROM:${payment.payerPhone}|TO:${payment.merchantName}`

    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <div className="relative bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 px-6 pt-14 pb-24 flex flex-col items-center text-center overflow-hidden">
          <div className="absolute -top-6 -left-6 w-24 h-24 rounded-full bg-orange-400/40" />
          <div className="absolute top-4 right-0 w-20 h-20 rounded-full bg-amber-300/30" />
          <div className="absolute -bottom-2 right-8 w-14 h-14 rounded-full bg-orange-600/20" />
          <div className="relative z-10 mb-5">
            <div className="w-20 h-20 rounded-full bg-white/25 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-9 h-9 text-emerald-500" />
              </div>
            </div>
          </div>
          <h1 className="relative z-10 text-white font-black text-2xl mb-1">Successful!</h1>
          <p className="relative z-10 text-white font-bold text-sm">Thank You for Banking with NIB!</p>
        </div>

        <div className="flex-1 flex flex-col pb-4">
          <div className="-mt-12 mx-4 bg-white rounded-3xl shadow-lg overflow-hidden">
            <div className="px-5 pt-6 space-y-3">
              {[
                { label: "From", value: payment.payerPhone },
                { label: "To", value: payment.merchantName },
                { label: "Account", value: payment.merchantAccountNumber },
                { label: "Date", value: transactionDate },
                { label: "Reference", value: payment.transactionReference },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">{label}</span>
                  <span className="font-medium text-gray-800 text-right max-w-[60%] break-all">{value}</span>
                </div>
              ))}
              <Separator />
              {[
                { label: "Amount", value: `ETB ${transactionAmount}` },
                { label: "Amount Credited", value: "ETB 0.00" },
                { label: "Service Charge", value: "ETB 0.00" },
                { label: "Tax", value: "ETB 0.00" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-gray-500">{value}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between items-center pb-1">
                <span className="font-bold text-gray-900 text-sm">Total Debited</span>
                <span className="font-bold text-amber-500">ETB {transactionAmount}</span>
              </div>
            </div>

            <div className="flex justify-center py-5 px-5">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <QRCodeSVG value={qrData} size={150} level="H" />
              </div>
            </div>

            <div className="px-5 pb-4">
              <Button
                className="w-full h-12 rounded-2xl bg-amber-400 hover:bg-amber-500 text-white font-bold"
                onClick={() => handleDownloadReceipt(payment.transactionId)}
                disabled={downloadingReceipt}
              >
                {downloadingReceipt
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
                  : <><Receipt className="mr-2 h-4 w-4" />View Receipt</>}
              </Button>
            </div>

            <div className="flex items-center justify-center gap-3 px-5 pb-6">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-amber-900 border-2 border-amber-700 flex items-center justify-center shadow-sm">
                <img src="/niblogo.png" alt="NIB" className="w-7 h-7 object-contain" />
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-900 text-sm">Nib International Bank</p>
                <p className="text-gray-400 text-xs">Committed to Service Excellence</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Failed ─────────────────────────────────────────────────────────────────
  if (view === "failed") {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex flex-col">
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-md mx-auto p-4 pb-10 space-y-4">
            {/* Branding header */}
            <div className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-amber-900 border border-amber-800 flex items-center justify-center shadow-sm">
                  <img src="/niblogo.png" alt="NIB" className="w-6 h-6 object-contain" />
                </div>
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-amber-800/50 leading-none">Powered by</p>
                  <p className="text-xs font-bold text-amber-900 leading-tight mt-0.5">Nib Bank</p>
                </div>
              </div>
              <div className="h-9 w-px bg-slate-100 mx-1 shrink-0" />
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center overflow-hidden border border-amber-100 shadow-sm shrink-0">
                  {payment.merchantLogoUrl ? (
                    <img src={payment.merchantLogoUrl} alt={payment.merchantName} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-amber-700 font-black text-base uppercase">{payment.merchantName?.charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate">{payment.merchantName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-xs text-amber-600 font-semibold">Verified Merchant</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Failure card */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-8 text-center space-y-5 animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 rounded-full bg-rose-50 flex items-center justify-center mx-auto border border-rose-100">
                <XCircle className="w-10 h-10 text-rose-500" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-2xl font-black text-slate-800">Payment Failed</h2>
                <p className="text-sm text-slate-500">We couldn&apos;t process your payment at this time.</p>
              </div>
              <button
                className="w-full h-14 rounded-2xl bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white font-bold text-base shadow-lg shadow-amber-950/20 hover:opacity-95 transition-opacity flex items-center justify-center gap-2"
                onClick={() => window.location.reload()}
              >
                <ArrowRight className="w-4 h-4" />
                Try Again
              </button>
            </div>

            <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 pb-2">
              <Lock className="w-3 h-3" />
              Secured by Nib Bank
            </p>
          </div>
        </main>
      </div>
    )
  }

  // ── Pending ────────────────────────────────────────────────────────────────
  if (view === "pending") {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex flex-col">
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-md mx-auto p-4 pb-10 space-y-4">
            {/* Branding header */}
            <div className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-amber-900 border border-amber-800 flex items-center justify-center shadow-sm">
                  <img src="/niblogo.png" alt="NIB" className="w-6 h-6 object-contain" />
                </div>
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-amber-800/50 leading-none">Powered by</p>
                  <p className="text-xs font-bold text-amber-900 leading-tight mt-0.5">Nib Bank</p>
                </div>
              </div>
              <div className="h-9 w-px bg-slate-100 mx-1 shrink-0" />
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center overflow-hidden border border-amber-100 shadow-sm shrink-0">
                  {payment.merchantLogoUrl ? (
                    <img src={payment.merchantLogoUrl} alt={payment.merchantName} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-amber-700 font-black text-base uppercase">{payment.merchantName?.charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate">{payment.merchantName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-xs text-amber-600 font-semibold">Verified Merchant</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pending card */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-8 text-center space-y-5 animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mx-auto border border-amber-100">
                <Clock className="w-10 h-10 text-amber-500" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-2xl font-black text-slate-800">Payment Pending</h2>
                <p className="text-sm text-slate-500">
                  We haven&apos;t received a confirmation yet. If your PIN was accepted, the payment will be reflected shortly.
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">What to do</p>
                <p className="text-sm text-slate-600">Check your bank statement or contact Nib Bank if the amount was debited but not confirmed here.</p>
              </div>
              <p className="text-xs font-mono text-slate-400">Ref: {payment.transactionReference}</p>
            </div>

            <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 pb-2">
              <Lock className="w-3 h-3" />
              Secured by Nib Bank
            </p>
          </div>
        </main>
      </div>
    )
  }

  // ── Checkout ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F5F0] flex flex-col">
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto p-4 pb-10 space-y-4">

          {/* Merchant card */}
          <div className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-amber-900 border border-amber-800 flex items-center justify-center shadow-sm">
                <img src="/niblogo.png" alt="NIB" className="w-6 h-6 object-contain" />
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-widest text-amber-800/50 leading-none">Powered by</p>
                <p className="text-xs font-bold text-amber-900 leading-tight mt-0.5">Nib Bank</p>
              </div>
            </div>
            <div className="h-9 w-px bg-slate-100 mx-1 shrink-0" />
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center overflow-hidden border border-amber-100 shadow-sm shrink-0">
                {payment.merchantLogoUrl ? (
                  <img src={payment.merchantLogoUrl} alt={payment.merchantName} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-amber-700 font-black text-base uppercase">{payment.merchantName?.charAt(0)}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-sm truncate">{payment.merchantName}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-600 font-semibold">Verified Merchant</span>
                </div>
              </div>
            </div>
          </div>

          {/* Awaiting PIN */}
          {pushSent ? (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center space-y-6">
                <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 rounded-full bg-amber-200/60 animate-ping" style={{ animationDuration: "1.6s" }} />
                  <div className="absolute inset-2 rounded-full bg-amber-100/80 animate-ping" style={{ animationDuration: "1.6s", animationDelay: "0.3s" }} />
                  <div className="relative w-full h-full rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shadow-sm">
                    <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-black text-slate-800">Pushing USSD Request</h2>
                  <p className="text-sm text-slate-500 leading-relaxed max-w-[270px] mx-auto">
                    Please check your phone{" "}
                    <span className="font-bold text-slate-700">({payment.payerPhone})</span>
                    {" "}and enter your PIN to authorize the payment.
                  </p>
                </div>
                <div className="bg-amber-50 rounded-2xl px-4 py-3.5 border border-amber-100/70 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>You are paying</span>
                    <span className="font-bold text-slate-800">{payment.merchantName}</span>
                  </div>
                  <span className="font-bold text-slate-800 text-sm shrink-0 ml-2">
                    ETB {payment.amount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-5 py-2.5 rounded-full w-fit mx-auto">
                  <Clock className="w-3.5 h-3.5" />
                  Awaiting PIN entry...
                </div>
              </div>
              <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                <Lock className="w-3 h-3" />
                Secured by Nib Bank
              </p>
            </div>
          ) : (
            /* Payment details + Pay Now */
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* Amount */}
              <div className="text-center py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Amount</p>
                <p className="text-6xl font-black text-amber-500">{payment.amount.toFixed(2)}</p>
                <div className="w-28 h-0.5 bg-amber-300/70 rounded-full mx-auto mt-1" />
                <p className="text-sm font-semibold text-slate-400/60 mt-1.5">ETB</p>
                <p className="text-xs text-slate-400 mt-3">
                  Paying <span className="font-bold text-slate-700">{payment.merchantName}</span>
                </p>
              </div>

              {/* Phone */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Phone Number</p>
                <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                  <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="flex-1 font-medium text-slate-800 text-sm">{payment.payerPhone}</span>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Payment Method</p>
                <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                  <Building className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="flex-1 font-medium text-slate-800 text-sm">Nib Bank</span>
                </div>
              </div>

              {/* Account Number */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Merchant Account Number</p>
                <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                  <CreditCard className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="flex-1 font-mono font-medium text-slate-800 text-sm">{payment.merchantAccountNumber}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(payment.merchantAccountNumber)}
                    className="text-slate-300 hover:text-amber-500 transition-colors"
                    aria-label="Copy account number"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Description */}
              {payment.serviceDescription && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Payment Description</p>
                  <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                    <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="flex-1 font-medium text-slate-800 text-sm">{payment.serviceDescription}</span>
                  </div>
                </div>
              )}

              {/* Pay Button */}
              <button
                type="button"
                disabled={processing}
                onClick={handleExecute}
                className="w-full h-14 mt-1 rounded-2xl bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white font-bold text-base shadow-xl shadow-amber-950/20 hover:shadow-2xl hover:shadow-amber-950/30 transition-all duration-300 flex items-center justify-between px-5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  <>
                    <Lock className="w-5 h-5 opacity-80" />
                    <span>Pay ETB {payment.amount.toFixed(2)}</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 pt-1">
                <Lock className="w-3 h-3" />
                Secured by Nib Bank
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default function OpaqueLinkPage() {
  return (
    <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-amber-600" />}>
      <OpaqueLinkContent />
    </Suspense>
  )
}
