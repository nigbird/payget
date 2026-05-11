"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { safeCredentialsSignIn } from "@/lib/safe-credentials-signin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Lock, Mail, Phone, Eye, EyeOff, Building2 } from "lucide-react"
import { useLoginLockoutUi } from "@/app/login/use-login-lockout-ui"
import { formatLockoutCountdown } from "@/lib/login-lockout-ui"
import { SigningInOverlay } from "@/components/auth/signing-in-overlay"

export default function MerchantLogin() {
  const router = useRouter()
  const [loginMode, setLoginMode] = useState<'email' | 'sales'>('email')
  const [isLoading, setIsLoading] = useState(false)
  const [isSendingOtp, setIsSendingOtp] = useState(false)
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [credentials, setCredentials] = useState({
    email: "",
    password: ""
  })
  const [salesPhone, setSalesPhone] = useState("")
  const [salesOtp, setSalesOtp] = useState("")
  const [merchants, setMerchants] = useState<{ id: string, name: string }[]>([])
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>("")
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const [salesPhoneError, setSalesPhoneError] = useState<string | null>(null)
  const [salesOtpBanner, setSalesOtpBanner] = useState<string | null>(null)
  const [salesOtpError, setSalesOtpError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const lockout = useLoginLockoutUi()
  const otpRefs = useRef<Array<HTMLInputElement | null>>([])

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(0, 1)
    const nextDigits = salesOtp.padEnd(6, "").split("").slice(0, 6)
    nextDigits[index] = digit
    const nextOtp = nextDigits.join("").trimEnd()
    setSalesOtp(nextOtp)

    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !salesOtp[index] && index > 0) {
      const prev = otpRefs.current[index - 1]
      prev?.focus()
    }
  }

  const handleOtpPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (!pasted) return
    event.preventDefault()
    setSalesOtpError(null)
    setSalesOtp(pasted)
    const focusIndex = Math.min(pasted.length, 5)
    requestAnimationFrame(() => otpRefs.current[focusIndex]?.focus())
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lockout.submitBlockedFor(credentials.email)) {
      return
    }
    setIsLoading(true)
    setCredentialError(null)

    let authenticated = false
    try {
      const result = await safeCredentialsSignIn("credentials", {
        email: credentials.email,
        password: credentials.password,
        loginType: "merchant",
        redirect: false,
      })

      if (!result) {
        setCredentialError(
          "We could not reach the sign-in service. Check your connection and try again."
        )
        return
      }

      const authFailed = Boolean(result.error) || result.ok === false
      const lockoutActive = lockout.applyLockoutFromSignInResult(result, credentials.email)

      if (authFailed) {
        if (!lockoutActive) {
          let errorMessage = "Invalid username or password. Please try again."
          if (result.error === "AccessDenied" || result.code === "AccessDenied") {
            errorMessage = "Access Denied: Please use the correct login portal for your account."
          }
          setCredentialError(errorMessage)
        }
        return
      }

      authenticated = true
      setSigningIn(true)
      router.refresh()
      router.replace("/merchant")
    } catch {
      setCredentialError(
        "Something went wrong while signing in. Check your connection and try again."
      )
    } finally {
      if (!authenticated) setIsLoading(false)
    }
  }

  const handleSendSalesOtp = async () => {
    setSalesPhoneError(null)
    setSalesOtpError(null)
    if (!salesPhone.trim()) {
      setSalesPhoneError("Enter the phone number registered for sales access.")
      return
    }

    setIsSendingOtp(true)
    setSalesOtpBanner(null)
    try {
      const response = await fetch('/api/merchant/sales-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: salesPhone })
      })

      const result = await response.json()
      if (!response.ok) {
        setSalesOtpError(result.error || "Unable to send a code right now. Try again shortly.")
        return
      }

      setOtpSent(true)
      setMerchants(result.merchants || [])
      if (result.merchants && result.merchants.length > 0) {
        setSelectedMerchantId(result.merchants[0].id)
      }
      setSalesOtpBanner(result.message || "A one-time code was sent to your phone.")
      setSalesOtpError(null)
    } catch {
      setSalesOtpError("Unable to send OTP. Check your connection and try again.")
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleSalesLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalesPhoneError(null)
    setSalesOtpError(null)

    if (!otpSent) {
      await handleSendSalesOtp()
      return
    }

    if (!salesOtp.trim()) {
      setSalesOtpError("Enter the one-time code we sent to your phone.")
      return
    }

    setIsVerifyingOtp(true)
    let otpSuccess = false
    try {
      const result = await safeCredentialsSignIn("sales-otp", {
        phone: salesPhone,
        otp: salesOtp,
        merchantId: selectedMerchantId,
        redirect: false,
      })

      if (!result) {
        setSalesOtpError("Unable to verify the code right now. Try again.")
        return
      }

      const failed = Boolean(result.error) || result.ok === false
      if (failed) {
        setSalesOtpError("That code is invalid or expired. Request a new code and try again.")
        return
      }

      otpSuccess = true
      setSigningIn(true)
      router.refresh()
      router.replace("/merchant")
    } catch {
      setSalesOtpError("Could not verify your code. Check your connection and try again.")
    } finally {
      if (!otpSuccess) setIsVerifyingOtp(false)
    }
  }

  const resetSalesState = () => {
    setSalesPhone("")
    setSalesOtp("")
    setOtpSent(false)
    setMerchants([])
    setSelectedMerchantId("")
    setSalesPhoneError(null)
    setSalesOtpError(null)
    setSalesOtpBanner(null)
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-white">
      {signingIn ? (
        <SigningInOverlay message="Signing you in…" subMessage="Opening your merchant portal" />
      ) : null}
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
            <div className="flex justify-center">
              <div className="w-20 h-20 flex items-center justify-center">
                <img 
                  src="/niblogo.png" 
                  alt="Nib Bank Logo" 
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">Merchant Portal</h1>
              <p className="text-[#6B7280] font-medium">Please login to your account</p>
            </div>

            <form onSubmit={loginMode === 'email' ? handleLogin : handleSalesLogin} className="space-y-6">
              {loginMode === 'email' ? (
                <>
                  <div className="space-y-2.5">
                    <Label htmlFor="email" className="text-sm font-semibold text-[#374151]">Email or Phone</Label>
                    <div className="relative group transition-all">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                      <Input 
                        id="email" 
                        type="text"
                        placeholder="enter your email or phone number" 
                        className="h-12 pl-10 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                        required
                        value={credentials.email}
                        onChange={(e) => {
                          lockout.onIdentifierFieldChange(e.target.value)
                          setCredentialError(null)
                          setCredentials({ ...credentials, email: e.target.value })
                        }}
                        aria-invalid={lockout.identSecondsLeftFor(credentials.email) > 0}
                      />
                    </div>
                    {lockout.identSecondsLeftFor(credentials.email) > 0 && lockout.identInline && (
                      <p className="text-sm font-medium text-rose-600" role="alert">
                        {lockout.identInline} (remaining {formatLockoutCountdown(lockout.identSecondsLeftFor(credentials.email))})
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-semibold text-[#374151]">Password</Label>
                    </div>
                    <div className="relative group transition-all">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                      <Input 
                        id="password" 
                        type={showPassword ? "text" : "password"} 
                        className="h-12 pl-10 pr-12 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                        placeholder="Enter your password"
                        required
                        value={credentials.password}
                        onChange={(e) => {
                          setCredentialError(null)
                          setCredentials({ ...credentials, password: e.target.value })
                        }}
                        aria-invalid={Boolean(credentialError)}
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
                    {credentialError && (
                      <p className="text-sm font-medium text-rose-600" role="alert">
                        {credentialError}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="remember" className="w-4 h-4 rounded border-[#E5E7EB] text-[#f8b513] focus:ring-[#f8b513]/20" />
                      <Label htmlFor="remember" className="text-sm text-[#6B7280]">Remember me</Label>
                    </div>
                    <Link href="/forgot-password" className="text-sm font-semibold text-[#f8b513] hover:text-[#754319] transition-colors">
                      Forgot Password?
                    </Link>
                  </div>

                  {lockout.ipSecondsLeft > 0 && lockout.ipBanner && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 flex items-center gap-3 text-rose-600 animate-in fade-in slide-in-from-top-2 duration-300">
                      <Lock className="w-5 h-5 shrink-0" />
                      <p className="text-sm font-semibold leading-tight" role="alert">
                        {lockout.ipBanner} (remaining {formatLockoutCountdown(lockout.ipSecondsLeft)})
                      </p>
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-bold rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 hover:-translate-y-0.5 transition-all duration-300" 
                    disabled={isLoading || lockout.submitBlockedFor(credentials.email)}
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Login"}
                  </Button>

                  <div className="flex flex-col space-y-4 pt-2">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          resetSalesState()
                          setLoginMode('sales')
                        }}
                        className="text-sm font-semibold text-[#f8b513] hover:text-[#754319] transition-colors"
                      >
                        Sales Login
                      </button>
                    </div>
                    <Link 
                      href="/register" 
                      className="w-full flex items-center justify-center h-12 text-base font-bold rounded-2xl bg-[#f8b513]/10 text-[#754319] hover:bg-[#f8b513]/20 transition-all duration-300"
                    >
                      Register as New Merchant
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-semibold text-[#374151]">Sales OTP Login</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMode('email')
                        resetSalesState()
                      }}
                      className="text-xs font-semibold text-[#f8b513] hover:text-[#754319] transition-colors"
                    >
                      Username Login
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    <Label htmlFor="sales-phone" className="text-sm font-semibold">Phone Number</Label>
                    <div className="relative group">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                      <Input
                        id="sales-phone"
                        type="tel"
                        placeholder="0912345678"
                        className="h-12 pl-10 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                        required
                        value={salesPhone}
                        onChange={(e) => {
                          setSalesPhoneError(null)
                          setSalesOtpError(null)
                          setSalesPhone(e.target.value)
                        }}
                        aria-invalid={Boolean(salesPhoneError)}
                      />
                    </div>
                    {salesPhoneError && (
                      <p className="text-sm font-medium text-rose-600" role="alert">
                        {salesPhoneError}
                      </p>
                    )}
                  </div>
                  {otpSent && merchants.length > 1 && (
                    <div className="space-y-2.5 animate-fade-in">
                      <Label htmlFor="merchant-select" className="text-sm font-semibold text-[#374151]">Select Merchant</Label>
                      <div className="relative group">
                        <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors z-10" />
                        <Select
                          value={selectedMerchantId}
                          onValueChange={setSelectedMerchantId}
                        >
                          <SelectTrigger 
                            id="merchant-select"
                            className="h-12 pl-10 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                          >
                            <SelectValue placeholder="Select a merchant" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-[#E5E7EB] bg-white/95 backdrop-blur-md shadow-xl">
                            {merchants.map((merchant) => (
                              <SelectItem 
                                key={merchant.id} 
                                value={merchant.id}
                                className="focus:bg-[#f8b513]/10 focus:text-[#754319] rounded-lg cursor-pointer"
                              >
                                {merchant.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {otpSent && (
                    <div className="space-y-2.5">
                      <Label className="text-sm font-semibold">OTP Code</Label>
                      <div className="flex items-center justify-center gap-2">
                        {Array.from({ length: 6 }).map((_, index) => {
                          const digit = salesOtp[index] ?? ""
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
                                setSalesOtpError(null)
                                handleOtpChange(index, e.target.value)
                              }}
                              onKeyDown={(event) => handleOtpKeyDown(index, event)}
                              onPaste={handleOtpPaste}
                              className="w-12 h-14 rounded-2xl border border-[#E5E7EB] bg-white/80 text-center text-xl font-semibold tracking-[0.35em] focus:border-[#f8b513] focus:ring-2 focus:ring-[#f8b513]/20 outline-none transition shadow-sm"
                            />
                          )
                        })}
                      </div>
                      <p className="text-xs text-[#6B7280] font-medium text-center">Code expires in 5 minutes.</p>
                      {salesOtpBanner && !salesOtpError && (
                        <p className="text-sm font-medium text-emerald-700 text-center" role="status">
                          {salesOtpBanner}
                        </p>
                      )}
                    </div>
                  )}
                  {salesOtpError && (
                    <p className="text-sm font-medium text-rose-600 text-center px-1" role="alert">
                      {salesOtpError}
                    </p>
                  )}
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-bold rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300" 
                    disabled={isSendingOtp || isVerifyingOtp}
                  >
                    {(isSendingOtp || isVerifyingOtp) ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : otpSent ? 'Verify OTP' : 'Send OTP'}
                  </Button>
                  {otpSent && (
                    <button
                      type="button"
                      className="w-full text-sm font-semibold text-[#f8b513] hover:text-[#754319] transition-colors"
                      onClick={handleSendSalesOtp}
                      disabled={isSendingOtp}
                    >
                      Resend verification code
                    </button>
                  )}
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
