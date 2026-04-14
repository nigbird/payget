"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { CreditCard, ShieldCheck, ArrowRight, Loader2, Lock, Mail, Phone, Eye, EyeOff, Sparkles } from "lucide-react"
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
        router.push("/admin") // Middleware will handle correct portal routing
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
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FFFEFA]">
      {/* Left Panel - Marketing & Branding */}
      <div className="relative hidden md:flex md:w-1/2 lg:w-[55%] flex-col justify-between p-12 overflow-hidden">
        {/* Multi-layered Vertical Honey Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#F4DB9F] via-[#f8b513] to-[#754319] z-0" />
        
        {/* Dynamic Light Rays / Shimmer Overlay */}
        <div className="absolute inset-0 opacity-30 z-0 bg-[radial-gradient(circle_at_50%_-20%,#ffffff,transparent_70%)]" />

        {/* Branding */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-lg shadow-black/5">
            <CreditCard className="text-white w-6 h-6" />
          </div>
          <span className="text-2xl font-bold font-headline tracking-tight text-white">NibTera Merchants</span>
        </div>

        {/* Floating Frosted Cards with Golden Shimmer */}
        <div className="relative z-10 flex-1 flex items-center justify-center py-20">
          <div className="relative w-full max-w-lg aspect-[1.4/1]">
            {/* Card 1 */}
            <div className="absolute top-[10%] left-[5%] w-[65%] aspect-[1.58/1] rounded-[2rem] bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl rotate-[-12deg] flex flex-col justify-between p-8 transform hover:scale-105 transition-transform duration-700 group">
              <div className="flex justify-between items-start">
                <div className="w-12 h-10 bg-white/20 rounded-lg backdrop-blur-md border border-white/10" />
                <div className="text-white/40"><Sparkles className="w-6 h-6 animate-pulse" /></div>
              </div>
              <div className="space-y-4">
                <div className="h-4 w-3/4 bg-white/20 rounded-full" />
                <div className="flex gap-4">
                  <div className="h-3 w-1/4 bg-white/10 rounded-full" />
                  <div className="h-3 w-1/4 bg-white/10 rounded-full" />
                </div>
              </div>
            </div>
            
            {/* Card 2 */}
            <div className="absolute bottom-[15%] right-[5%] w-[65%] aspect-[1.58/1] rounded-[2rem] bg-white/15 backdrop-blur-3xl border border-white/30 shadow-2xl rotate-[8deg] flex flex-col justify-between p-8 transform translate-z-10 hover:scale-105 transition-transform duration-700 delay-150">
              <div className="flex justify-between items-start">
                <div className="w-12 h-10 bg-white/30 rounded-lg backdrop-blur-md border border-white/20 shadow-inner" />
                <div className="text-white/60"><ShieldCheck className="w-6 h-6" /></div>
              </div>
              <div className="space-y-4">
                <div className="h-4 w-2/3 bg-white/25 rounded-full shadow-sm" />
                <div className="flex gap-4">
                  <div className="h-3 w-1/3 bg-white/15 rounded-full" />
                  <div className="h-3 w-1/5 bg-white/15 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Marketing Content */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl lg:text-5xl font-bold font-headline text-white leading-tight tracking-tight">
              Fast and Easy <br />
              Payment Gateway.
            </h1>
            <p className="text-lg text-white/80 max-w-md font-medium">
              Start processing payments instantly with NibTera Merchants, the quickest and simplest way to make your transactions seamless.
            </p>
          </div>

          {/* Pagination / Status Dots */}
          <div className="flex gap-2.5 items-center">
            <div className="w-8 h-2 rounded-full bg-white shadow-sm" />
            <div className="w-2 h-2 rounded-full bg-white/40" />
            <div className="w-2 h-2 rounded-full bg-white/40" />
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col bg-[#FFFEFA] relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center gap-2 p-6 border-b">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <CreditCard size={20} />
          </div>
          <span className="text-xl font-bold font-headline tracking-tight text-primary">NibTera Merchants</span>
        </div>

        <main className="flex-1 flex items-center justify-center p-8 lg:p-16">
          <div className="w-full max-w-md space-y-10">
            <div className="space-y-3">
              <h2 className="text-4xl font-bold text-[#1F2937] tracking-tight">Log In</h2>
              <p className="text-muted-foreground font-medium">Welcome back! Please enter your details.</p>
            </div>

            <form onSubmit={loginMode === 'email' ? handleLogin : handleSalesLogin} className="space-y-6">
              {loginMode === 'email' ? (
                <>
                  <div className="space-y-2.5">
                    <Label htmlFor="email" className="text-sm font-semibold text-[#374151]">Username (Email or Phone)</Label>
                    <div className="relative group transition-all">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input 
                        id="email" 
                        type="text"
                        placeholder="Random@gmail.com" 
                        className="h-12 pl-10 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                        required
                        value={credentials.email}
                        onChange={(e) => setCredentials({...credentials, email: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" title="Password" className="text-sm font-semibold text-[#374151]">Password</Label>
                    </div>
                    <div className="relative group transition-all">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input 
                        id="password" 
                        type={showPassword ? "text" : "password"} 
                        className="h-12 pl-10 pr-12 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                        placeholder="Placeholder"
                        required
                        value={credentials.password}
                        onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Link href="/forgot-password" title="Forgot password?" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
                      Forgot password?
                    </Link>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all" disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Sign In"}
                  </Button>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setLoginMode('sales')}
                      className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                    >
                      Sales Login
                    </button>
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
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Username Login
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    <Label htmlFor="sales-phone" className="text-sm font-semibold">Phone Number</Label>
                    <div className="relative group">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="sales-phone"
                        type="tel"
                        placeholder="+1234567890"
                        className="h-12 pl-10 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all"
                        required
                        value={salesPhone}
                        onChange={(e) => setSalesPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  {otpSent && (
                    <div className="space-y-2.5">
                      <Label htmlFor="sales-otp" className="text-sm font-semibold">OTP Code</Label>
                      <Input
                        id="sales-otp"
                        type="text"
                        placeholder="Enter 6-digit code"
                        className="h-12 rounded-xl text-center text-lg tracking-widest font-bold border-gray-200 focus:ring-primary/20 transition-all"
                        value={salesOtp}
                        onChange={(e) => setSalesOtp(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground font-medium">Code expires in 5 minutes.</p>
                    </div>
                  )}
                  <Button type="submit" className="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all" disabled={isSendingOtp || isVerifyingOtp}>
                    {(isSendingOtp || isVerifyingOtp) ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : otpSent ? 'Verify OTP' : 'Send OTP'}
                  </Button>
                  {otpSent && (
                    <button
                      type="button"
                      className="w-full text-sm font-semibold text-primary hover:underline"
                      onClick={handleSendSalesOtp}
                      disabled={isSendingOtp}
                    >
                      Resend verification code
                    </button>
                  )}
                </>
              )}
            </form>

            <div className="text-center pt-4 space-y-4">
              <Button variant="outline" className="w-full h-12 border-primary text-primary hover:bg-primary/5 rounded-xl font-bold" asChild>
                <Link href="/register">
                  Register as New Merchant <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </main>

        <footer className="p-8 text-center mt-auto">
          <p className="text-xs text-muted-foreground font-medium">
            © 2024 NibTera Merchants Solution. Secure Enterprise Infrastructure.
          </p>
        </footer>
      </div>
    </div>
  )
}
