"use client"

import { useEffect, useState, Suspense } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, AlertCircle } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import SetupPasswordForm from "@/app/merchant/setup-password/page"
import ResetPasswordPage from "@/app/reset-password/[token]/page"
import PayLinkPage from "@/app/pay/link/page"
import ReviewUpdatePage from "@/app/merchant/review-update/page"

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
          <CardHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
              <AlertCircle className="text-red-600 w-6 h-6" />
            </div>
            <CardTitle>Invalid or Expired Link</CardTitle>
            <CardDescription>
              {error || "This link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={() => router.push('/')}>
              Return Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  switch (tokenType) {
    case 'PASSWORD_SETUP':
      return <SetupPasswordFormWrapper merchantId={tokenData!.merchantId} token={tokenData!.originalToken} />
    case 'MERCHANT_UPDATE':
      return <ReviewUpdatePageWrapper token={tokenData!.originalToken} />
    case 'RESET_PASSWORD':
      return <ResetPasswordPageWrapper token={tokenData!.originalToken} />
    case 'PAYMENT':
      return <PayLinkPageWrapper token={tokenData!.originalToken} />
    default:
      return <div>Unknown token type</div>
  }
}

function SetupPasswordFormWrapper({ merchantId, token }: { merchantId: string; token: string }) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-amber-600" />}>
        <SetupPasswordFormStandalone merchantId={merchantId} token={token} />
      </Suspense>
    </div>
  )
}

function ResetPasswordPageWrapper({ token }: { token: string }) {
  return (
    <ResetPasswordPageStandalone token={token} />
  )
}

function PayLinkPageWrapper({ token }: { token: string }) {
  return (
    <PayLinkPageStandalone token={token} />
  )
}

function ReviewUpdatePageWrapper({ token }: { token: string }) {
  return (
    <ReviewUpdatePageStandalone token={token} />
  )
}

function SetupPasswordFormStandalone({ merchantId, token }: { merchantId: string; token: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
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
      <Card className="max-w-md w-full shadow-sm border border-slate-100 animate-in zoom-in-95 rounded-2xl overflow-hidden bg-white">
        <div className="p-8 text-center border-b border-slate-50">
          <div className="mx-auto w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="text-xl font-medium text-slate-800 tracking-tight">Account Activated</h3>
          <p className="text-slate-500 mt-1 text-sm">Setup complete</p>
        </div>
        <CardContent className="py-6 px-8 text-center space-y-4">
          <div className="bg-slate-50 rounded-xl p-5 text-center">
            <p className="text-sm text-slate-600 leading-relaxed">
              Your account has been successfully approved and activated.
            </p>
            <p className="text-sm text-slate-500 mt-3">
              You can now log in to the merchant portal using your registered Username (Email/Phone) and the password you just created.
            </p>
          </div>
        </CardContent>
        <CardFooter className="px-8 pb-8 pt-2">
            <Button className="w-full h-12 rounded-xl bg-amber-600 text-white hover:bg-amber-700 shadow-sm font-medium transition-all" onClick={() => router.push('/login/merchant')}>
              Continue to Login
            </Button>
          </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="max-w-md w-full shadow-lg border-none">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <ShieldCheck className="w-8 h-8 text-primary" />
        </div>
        <CardTitle className="text-2xl font-headline">Activate Account</CardTitle>
        <CardDescription>
          Set up your password to activate your merchant portal access.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4 py-6">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                id="password" 
                type={showPassword ? "text" : "password"} 
                className="pl-10 pr-10"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">Minimum 8 characters with letters and numbers.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                id="confirmPassword" 
                type={showPassword ? "text" : "password"} 
                className="pl-10"
                placeholder="••••••••"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Activate & Set Password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function ResetPasswordPageStandalone({ token }: { token: string }) {
  const router = useRouter()
  const { toast } = useToast()
  
  const [isLoading, setIsLoading] = useState(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [merchantId, setMerchantId] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [passwords, setPasswords] = useState({
    new: "",
    confirm: ""
  })

  useEffect(() => {
    const checkToken = async () => {
      try {
        const response = await fetch(`/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'check' })
        })
        
        if (response.ok) {
          const data = await response.json()
          setIsValid(true)
          setMerchantId(data.merchantId)
        } else {
          setIsValid(false)
        }
      } catch (error) {
        setIsValid(false)
      }
    }
    checkToken() 
  }, [token])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (passwords.new !== passwords.confirm) {
      toast({
        variant: "destructive",
        title: "Mismatch",
        description: "Passwords do not match."
      })
      return
    }

    if (passwords.new.length < 8) {
      toast({
        variant: "destructive",
        title: "Too Weak",
        description: "Password must be at least 8 characters."
      })
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: passwords.new,
          action: 'reset'
        })
      })

      if (response.ok) {
        toast({
          title: "Password Updated",
          description: "Your new password has been set successfully."
        })
        router.push("/")
      } else {
        const error = await response.json()
        toast({
          variant: "destructive",
          title: "Reset Failed",
          description: error.error || "Could not reset your password."
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Reset Failed",
        description: "An error occurred during password reset."
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isValid === null) return null

  if (!isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center border-none shadow-lg">
          <CardHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
              <AlertCircle className="text-red-600 w-6 h-6" />
            </div>
            <CardTitle>Invalid or Expired Link</CardTitle>
            <CardDescription>
              Security links expire quickly for your protection. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" asChild>
              <Link href="/forgot-password">Request New Link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-none shadow-xl">
        <CardHeader>
          <CardTitle>Create New Password</CardTitle>
          <CardDescription>
            Enter a strong password to secure your merchant account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="new" 
                  type={showPassword ? "text" : "password"} 
                  className="pr-11 pl-9"
                  required
                  value={passwords.new}
                  onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="confirm" 
                  type={showPassword ? "text" : "password"} 
                  className="pr-11 pl-9"
                  required
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
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

  const [pin, setPin] = useState("")
  const [showPinEntry, setShowPinEntry] = useState(false)
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
                        <span className="text-[11px] font-medium tracking-widest text-[#754319]">NT</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-widest text-amber-800/60">Powered by</p>
                        <p className="truncate text-sm font-medium text-[#5b371f]">Nib International Bank</p>
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
                      className="h-12 w-full rounded-xl bg-amber-600 text-white hover:bg-amber-700 font-medium shadow-sm transition-all"
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

function ReviewUpdatePageStandalone({ token }: { token: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  
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

type MerchantDocument = {
  id: string
  name: string
  type: string
  size: number
  url: string
  uploadedAt: string
}

import { useRef } from "react"
import { useToast } from "@/hooks/use-toast"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, ShieldCheck, Lock, Eye, EyeOff, XCircle, Clock, Building2, User, Store, FileText, Upload, X, MessageSquare, ArrowRight } from "lucide-react"
import Link from "next/link"
import { isValidEmail } from "@/lib/utils"

export default function OpaqueLinkPage() {
  return (
    <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-amber-600" />}>
      <OpaqueLinkContent />
    </Suspense>
  )
}
