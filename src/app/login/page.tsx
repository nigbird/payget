"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { loginWithCredentials } from "@/lib/safe-credentials-signin"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Lock, Mail, Eye, EyeOff } from "lucide-react"
import { useLoginLockoutUi } from "@/app/login/use-login-lockout-ui"
import { formatLockoutCountdown } from "@/lib/login-lockout-ui"
import { SigningInOverlay } from "@/components/auth/signing-in-overlay"

export default function AdminLogin() {
  const router = useRouter()
  const { refresh } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [credentials, setCredentials] = useState({ email: "", password: "" })
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const lockout = useLoginLockoutUi()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lockout.submitBlockedFor(credentials.email)) return
    setIsLoading(true)
    setCredentialError(null)

    let authenticated = false
    try {
      const result = await loginWithCredentials({
        identifier: credentials.email,
        password: credentials.password,
      })

      const lockoutSeen = lockout.applyLockoutFromSignInResult(result, credentials.email)

      if (!result.ok) {
        if (!lockoutSeen) {
          setCredentialError(result.error ?? "Invalid username or password. Please try again.")
        }
        return
      }

      authenticated = true
      setSigningIn(true)
      await refresh()
      router.replace("/admin")
    } catch {
      setCredentialError("Something went wrong while signing in. Check your connection and try again.")
    } finally {
      if (!authenticated) setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-white">
      {signingIn ? <SigningInOverlay message="Signing you in…" subMessage="Preparing your admin workspace" /> : null}
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

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-6 sm:p-8">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="backdrop-blur-md bg-white/70 rounded-2xl shadow-2xl px-5 py-6 sm:p-8 space-y-5 sm:space-y-8">
            <div className="flex justify-center">
              <div className="w-14 h-14 sm:w-20 sm:h-20 flex items-center justify-center">
                <img src="/niblogo.png" alt="Nib Bank Logo" className="max-w-full max-h-full object-contain" />
              </div>
            </div>

            <div className="text-center space-y-1.5 sm:space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1F2937] tracking-tight">Admin Login</h1>
              <p className="text-sm sm:text-base text-[#6B7280] font-medium">Please login to your admin account</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-[#374151]">Email or Phone</Label>
                <div className="relative group transition-all">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                  <Input
                    id="email"
                    type="text"
                    placeholder="enter your email or phone number"
                    className="h-11 sm:h-12 pl-10 rounded-xl border-[#E5E7EB] bg-white/85 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-semibold text-[#374151]">Password</Label>
                </div>
                <div className="relative group transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="h-11 sm:h-12 pl-10 pr-12 rounded-xl border-[#E5E7EB] bg-white/85 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
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
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#6B7280] hover:text-[#f8b513] transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {credentialError && (
                  <p className="text-sm font-medium text-rose-600" role="alert">{credentialError}</p>
                )}
              </div>

              <div className="flex justify-end pt-0.5">
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
                className="w-full h-11 sm:h-12 text-base font-bold rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 hover:-translate-y-0.5 transition-all duration-300"
                disabled={isLoading || lockout.submitBlockedFor(credentials.email)}
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Login"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
