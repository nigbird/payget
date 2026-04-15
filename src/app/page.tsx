"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Lock, Mail, Eye, EyeOff, Phone, ArrowRight } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function Home() {
  const router = useRouter()
  const { toast } = useToast()
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await signIn("credentials", {
        email: credentials.email,
        password: credentials.password,
        redirect: false,
      })

      if (result?.error) {
        toast({
          variant: "destructive",
          title: "Authentication Failed",
          description: "Invalid username or password. Please try again."
        })
      } else {
        toast({
          title: "Welcome back",
          description: "Login successful. Redirecting..."
        })
        router.refresh()
        router.push("/admin")
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Login Error",
        description: "Could not connect to the auth services."
      });
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendSalesOtp = async () => {
    if (!salesPhone.trim()) {
      toast({
        variant: "destructive",
        title: "Phone Required",
        description: "Please provide your sales phone number."
      })
      return
    }

    setIsSendingOtp(true)
    try {
      const response = await fetch('/api/merchant/sales-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: salesPhone })
      })

      const result = await response.json()
      if (!response.ok) {
        toast({
          variant: "destructive",
          title: "OTP Error",
          description: result.error || 'Unable to send OTP. Please try again.'
        })
        return
      }

      setOtpSent(true)
      toast({
        title: "OTP Sent",
        description: result.message || 'A one-time code has been sent to your phone.'
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "OTP Error",
        description: "Unable to send OTP. Please check your connection."
      })
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleSalesLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!otpSent) {
      await handleSendSalesOtp()
      return
    }

    if (!salesOtp.trim()) {
      toast({
        variant: "destructive",
        title: "OTP Required",
        description: "Please enter the one-time code sent to your phone."
      })
      return
    }

    setIsVerifyingOtp(true)
    try {
      const result = await signIn("sales-otp", {
        phone: salesPhone,
        otp: salesOtp,
        redirect: false,
      })

      if (result?.error) {
        toast({
          variant: "destructive",
          title: "Verification Failed",
          description: "The OTP is invalid or expired. Please request a new code."
        })
      } else {
        toast({
          title: "Welcome",
          description: "Sales access granted. Redirecting to your merchant page."
        })
        router.refresh()
        router.push("/merchant")
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Login Error",
        description: "Could not verify your OTP at this time."
      })
    } finally {
      setIsVerifyingOtp(false)
    }
  }

  const resetSalesState = () => {
    setSalesPhone("")
    setSalesOtp("")
    setOtpSent(false)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#faf8f3] via-[#f5f0e8] to-[#f0e8df]">
      {/* Floating Gradient Orbs Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Top-left large orb */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-[#f4db9f]/40 to-[#f8b513]/25 blur-3xl float-slow-animation" />
        
        {/* Top-right orb */}
        <div className="absolute -top-48 -right-24 w-80 h-80 rounded-full bg-gradient-to-br from-[#f8b513]/35 to-[#754319]/20 blur-3xl float-animation" style={{ animationDelay: '2s' }} />
        
        {/* Bottom-left orb */}
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-gradient-to-br from-[#754319]/25 to-[#f4db9f]/20 blur-3xl float-animation" style={{ animationDelay: '4s' }} />
        
        {/* Bottom-right orb */}
        <div className="absolute -bottom-24 -right-32 w-72 h-72 rounded-full bg-gradient-to-br from-[#f8b513]/30 to-[#f4db9f]/30 blur-3xl float-animation" style={{ animationDelay: '3s' }} />
      </div>

      {/* Honeycomb Grid Overlay */}
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='honeycomb' x='0' y='0' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Cpolygon points='30,0 40,10 40,30 30,40 20,30 20,10' fill='none' stroke='%23754319' stroke-width='0.5'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23honeycomb)'/%3E%3C/svg%3E")`,
      }} />

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        {/* Logo Header */}
        <div className="mb-8 fade-in-down-animation">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#f4db9f] via-[#f8b513] to-[#754319] flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        {/* Main Glass Card */}
        <div className="w-full max-w-md scale-in-animation" style={{ animationDelay: '0.1s' }}>
          <div className="glass-card p-8 md:p-10 space-y-6 rounded-3xl overflow-hidden hover:shadow-3xl transition-shadow duration-300">
            {/* Header */}
            <div className="space-y-3">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-[#754319] to-[#f8b513] bg-clip-text text-transparent">
                Welcome Back
              </h2>
              <p className="text-base text-gray-600">
                {loginMode === 'email' 
                  ? 'Sign in to access your dashboard' 
                  : 'Enter your phone number to proceed'}
              </p>
            </div>

            {/* Form Content */}
            <form onSubmit={loginMode === 'email' ? handleLogin : handleSalesLogin} className="space-y-5">
                {loginMode === 'email' ? (
                  <>
                    {/* Email Input */}
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-semibold text-gray-700">Username or Email</Label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#754319]/60 transition-colors group-focus-within:text-[#f8b513]" />
                        <Input 
                          id="email" 
                          type="text"
                          inputMode="text"
                          autoCapitalize="none"
                          autoCorrect="off"
                          placeholder="email@example.com" 
                          className="pl-12 h-12 bg-white/50 border border-white/50 rounded-xl focus:bg-white focus:border-[#f8b513] focus:ring-2 focus:ring-[#f8b513]/30 focus:shadow-lg focus:shadow-[#f8b513]/20 transition-all"
                          required
                          value={credentials.email}
                          onChange={(e) => setCredentials({...credentials, email: e.target.value})}
                        />
                      </div>
                    </div>

                    {/* Password Input */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-sm font-semibold text-gray-700">Password</Label>
                        <Button variant="link" className="px-0 h-auto text-xs text-[#754319] hover:text-[#f8b513] font-medium" type="button" asChild>
                          <Link href="/forgot-password">Forgot?</Link>
                        </Button>
                      </div>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#754319]/60 transition-colors group-focus-within:text-[#f8b513]" />
                        <Input 
                          id="password" 
                          type={showPassword ? "text" : "password"} 
                          className="pl-12 pr-12 h-12 bg-white/50 border border-white/50 rounded-xl focus:bg-white focus:border-[#f8b513] focus:ring-2 focus:ring-[#f8b513]/30 focus:shadow-lg focus:shadow-[#f8b513]/20 transition-all"
                          placeholder="••••••••"
                          required
                          value={credentials.password}
                          onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#754319]/60 hover:text-[#f8b513] transition-colors"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    {/* Sign In Button */}
                    <Button 
                      type="submit" 
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white font-bold hover:shadow-lg hover:shadow-[#f8b513]/30 hover:-translate-y-0.5 transition-all mt-6"
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Sign In"}
                    </Button>

                    {/* Mode Switch */}
                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => setLoginMode('sales')}
                        className="text-sm text-[#754319] hover:text-[#f8b513] font-medium transition-colors underline-offset-2 hover:underline"
                      >
                        Sales Login
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Mode Switch Back */}
                    <div className="text-center pb-2">
                      <button
                        type="button"
                        onClick={() => {
                          setLoginMode('email')
                          resetSalesState()
                        }}
                        className="text-sm text-[#754319] hover:text-[#f8b513] font-medium transition-colors underline-offset-2 hover:underline"
                      >
                        Back to Sign In
                      </button>
                    </div>

                    {/* Phone Input */}
                    <div className="space-y-2">
                      <Label htmlFor="sales-phone" className="text-sm font-semibold text-gray-700">Phone Number</Label>
                      <div className="relative group">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#754319]/60 transition-colors group-focus-within:text-[#f8b513]" />
                        <Input
                          id="sales-phone"
                          type="tel"
                          placeholder="+1234567890"
                          className="pl-12 h-12 bg-white/50 border border-white/50 rounded-xl focus:bg-white focus:border-[#f8b513] focus:ring-2 focus:ring-[#f8b513]/30 focus:shadow-lg focus:shadow-[#f8b513]/20 transition-all"
                          required
                          value={salesPhone}
                          onChange={(e) => setSalesPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* OTP Input */}
                    {otpSent && (
                      <div className="space-y-2 animate-fade-in">
                        <Label htmlFor="sales-otp" className="text-sm font-semibold text-gray-700">OTP Code</Label>
                        <Input
                          id="sales-otp"
                          type="text"
                          placeholder="Enter code"
                          className="h-12 bg-white/50 border border-white/50 rounded-xl focus:bg-white focus:border-[#f8b513] focus:ring-2 focus:ring-[#f8b513]/30 focus:shadow-lg focus:shadow-[#f8b513]/20 transition-all text-center tracking-widest font-mono text-lg"
                          value={salesOtp}
                          onChange={(e) => setSalesOtp(e.target.value)}
                        />
                        <p className="text-xs text-gray-500 text-center">Code expires in 5 minutes</p>
                      </div>
                    )}

                    {/* OTP Button */}
                    <Button 
                      type="submit" 
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white font-bold hover:shadow-lg hover:shadow-[#f8b513]/30 hover:-translate-y-0.5 transition-all mt-6"
                      disabled={isSendingOtp || isVerifyingOtp}
                    >
                      {(isSendingOtp || isVerifyingOtp) ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : otpSent ? 'Verify OTP' : 'Send OTP'}
                    </Button>

                    {/* Resend Button */}
                    {otpSent && (
                      <button
                        type="button"
                        className="w-full text-sm text-[#754319] hover:text-[#f8b513] font-medium py-2 transition-colors"
                        onClick={handleSendSalesOtp}
                        disabled={isSendingOtp}
                      >
                        {isSendingOtp ? 'Sending...' : 'Resend code'}
                      </button>
                    )}
                  </>
                )}
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/30" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white/60 text-gray-600">or</span>
                </div>
              </div>

              {/* Register Link */}
              <Link href="/register">
                <Button 
                  variant="outline" 
                  className="w-full h-12 rounded-xl border-[#f8b513] text-[#754319] hover:bg-[#f8b513]/10 font-bold transition-all"
                >
                  New Merchant Registration
                </Button>
              </Link>
            </div>
          </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-gray-600 text-center max-w-xs fade-in-down-animation">
          © 2024 Finflow Gateway. Enterprise-grade payment processing with premium security.
        </p>
      </div>
    </div>
  )
}
