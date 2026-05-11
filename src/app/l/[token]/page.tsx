"use client"

import { useEffect, useState, Suspense } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Loader2, AlertCircle, Lock, CheckCircle2, XCircle, Clock, ShieldCheck, Eye, EyeOff } from "lucide-react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"

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

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

const gatewayBrand = {
  name: "NibTera Merchants",
  initials: "NT",
  logoUrl: "/niblogo.png",
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
          <CardFooter className="pb-8">
            <Button className="w-full" onClick={() => router.push('/')}>
              Return Home
            </Button>
          </CardFooter>
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

    if (password.length < 8) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 8 characters long."
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
                <p className="text-[11px] text-[#6B7280] mt-1">Minimum 8 characters with letters and numbers.</p>
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
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payment, setPayment] = useState<ResolvedPayment | null>(null)
  const [merchantSessionToken, setMerchantSessionToken] = useState<string | null>(null)

  const [processing, setProcessing] = useState(false)
  const [pushSent, setPushSent] = useState(false)
  const [view, setView] = useState<"checkout" | "success" | "failed">("checkout")

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setError("Missing token")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/payments/resolve?token=${encodeURIComponent(token)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data?.error || "Invalid or expired link")
          setLoading(false)
          return
        }

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
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/payments/resolve?token=${encodeURIComponent(token)}`)
          const data = await res.json().catch(() => ({}))
          if (res.ok) {
            if (data?.status === "success") {
              setPayment(data)
              setView("success")
              clearInterval(interval)
            } else if (data?.status === "failed") {
              setPayment(data)
              setView("failed")
              clearInterval(interval)
            }
          }
        } catch (err) {
          console.error("Polling error:", err)
        }
      }, 3000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [pushSent, view, token])

  const handleExecute = async () => {
    if (!payment) return
    setProcessing(true)
    try {
      const res = await fetch("/api/provider/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token,
          merchantSessionToken,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ variant: "destructive", title: "Payment failed", description: data?.error || "Try again." })
        setProcessing(false)
        return
      }

      setPushSent(true)
      
      toast({ 
        title: "USSD Push Sent", 
        description: "Please check your phone and enter your PIN to authorize the payment." 
      })
      
      setPayment(prev => prev ? { ...prev, status: "awaiting_pin" } : null)

    } catch {
      toast({ variant: "destructive", title: "Payment error", description: "Could not initiate USSD push." })
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    )
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen bg-white p-4 flex items-center justify-center">
        <Card className="w-full max-w-md rounded-2xl border border-amber-100 bg-white shadow-sm">
          <CardContent className="p-8 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-2 border border-rose-100">
              <XCircle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-medium text-amber-900 tracking-tight">Unable to process payment</h1>
            <p className="text-sm text-amber-800/70">{error || "This payment link is invalid or has expired."}</p>
            <div className="pt-4">
              <Button variant="outline" className="w-full rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50" onClick={() => router.push("/")}>
                Return Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-4 flex items-center justify-center">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm shadow-amber-950/5">
          <CardContent className="p-0">
            <div className="bg-white px-6 pb-8 pt-6 border-b border-black/5">
              <div className="flex flex-col gap-6">
                <div className="rounded-xl border border-amber-100 bg-gradient-to-r from-white to-amber-50/40 px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-amber-100">
                        {gatewayBrand.logoUrl ? (
                          <Image
                            src={gatewayBrand.logoUrl}
                            alt={gatewayBrand.name}
                            width={32}
                            height={32}
                            className="rounded-md"
                          />
                        ) : (
                          <span className="text-[11px] font-medium tracking-widest text-[#754319]">{gatewayBrand.initials}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-widest text-amber-800/60">Powered by</p>
                        <p className="truncate text-sm font-medium text-[#5b371f]">Nib International Bank</p>
                      </div>
                    </div>

                    <div className="h-8 w-px bg-amber-100" />

                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-amber-100 shadow-[0_1px_6px_rgba(117,67,25,0.08)]">
                        {payment.merchantLogoUrl ? (
                          <Image
                            src={payment.merchantLogoUrl}
                            alt={payment.merchantName}
                            width={32}
                            height={32}
                            className="rounded-md object-cover"
                          />
                        ) : (
                          <span className="text-[11px] font-medium tracking-widest text-[#754319]">{getInitials(payment.merchantName)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-medium uppercase tracking-widest text-amber-800/60">Payment</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-[#3f210f]">{payment.amount.toFixed(2)} ETB</p>
                  <p className="mt-1 max-w-[14rem] text-sm text-[#754319]">{payment.serviceDescription}</p>
                </div>
              </div>
            </div>

            <div className="space-y-5 bg-white p-6">
              <div className="rounded-xl border border-amber-100 bg-white p-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-amber-100 pb-3">
                    <p className="text-[11px] uppercase tracking-widest text-amber-800/60">Merchant</p>
                    <p className="text-right text-sm font-medium text-[#5b371f]">{payment.merchantName}</p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-amber-100 pb-3">
                    <p className="text-[11px] uppercase tracking-widest text-amber-800/60">Account</p>
                    <p className="break-all text-right font-mono text-sm text-[#754319]">{payment.merchantAccountNumber}</p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-amber-100 pb-3">
                    <p className="text-[11px] uppercase tracking-widest text-amber-800/60">Reference</p>
                    <p className="break-all text-right font-mono text-sm text-[#754319]">{payment.transactionReference}</p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-amber-100 pb-3">
                    <p className="text-[11px] uppercase tracking-widest text-amber-800/60">Status</p>
                    <p className="text-right text-sm font-medium text-[#5b371f] capitalize">
                      {payment.status === "awaiting_pin"
                        ? "Awaiting PIN"
                        : payment.status === "processing"
                          ? "Processing"
                          : payment.status}
                    </p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3">
                    <p className="text-[11px] uppercase tracking-widest text-amber-800/60">Paying With</p>
                    <p className="text-right text-sm font-medium text-[#5b371f]">{payment.payerPhone || "Customer"}</p>
                  </div>
                </div>
              </div>

              {view === "checkout" && (
                <div className="space-y-4">
                  {!pushSent ? (
                    <Button
                      className="h-12 w-full rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 font-medium transition-all"
                      onClick={handleExecute}
                      disabled={processing}
                    >
                      {processing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Lock className="mr-2 h-4 w-4" />
                      )}
                      Pay Now
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                          <Clock className="w-6 h-6 text-amber-600 animate-pulse" />
                        </div>
                        <h3 className="text-base font-medium text-amber-900">USSD Push Sent</h3>
                        <p className="mt-2 text-sm text-amber-800/80 leading-relaxed">
                          Please check your phone (<strong>{payment.payerPhone}</strong>) and enter your PIN to authorize the payment.
                         </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {view === "success" && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-6 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-medium text-emerald-900">Payment Successful</h3>
                  <p className="mt-2 text-sm text-emerald-700/80">
                    Your payment of {payment.amount.toFixed(2)} ETB has been confirmed.
                  </p>
                </div>
              )}

              {view === "failed" && (
                <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-6 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
                    <XCircle className="w-6 h-6 text-rose-600" />
                  </div>
                  <h3 className="text-lg font-medium text-rose-900">Payment Failed</h3>
                  <p className="mt-2 text-sm text-rose-700/80">
                    Your payment could not be processed. Please try again.
                  </p>
                  <Button variant="outline" className="mt-6 w-full rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => window.location.reload()}>
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
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
