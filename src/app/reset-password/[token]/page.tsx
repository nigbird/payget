"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, Loader2, Lock, Eye, EyeOff } from "lucide-react"
import { SigningInOverlay } from "@/components/auth/signing-in-overlay"

export default function ResetPassword({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [entityId, setEntityId] = useState<string | null>(null)
  const [entityType, setEntityType] = useState<'MERCHANT' | 'USER' | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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
          setEntityId(data.entityId)
          setEntityType(data.entityType)
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
    setFormError(null)

    if (passwords.new !== passwords.confirm) {
      setFormError("Passwords do not match.")
      return
    }

    if (passwords.new.length < 8) {
      setFormError("Password must be at least 8 characters.")
      return
    }

    setIsLoading(true)
    let ok = false

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
        ok = true
        const data = await response.json()
        setRedirecting(true)
        if (data.entityType === 'USER') {
          router.push("/login")
        } else {
          router.push("/")
        }
      } else {
        const error = await response.json()
        setFormError(error.error || "Could not reset your password.")
      }
    } catch {
      setFormError("Something went wrong. Try again in a moment.")
    } finally {
      if (!ok) setIsLoading(false)
    }
  }

  if (isValid === null) return null

  if (!isValid) {
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
                <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-2">
                  <AlertCircle className="text-rose-600 w-6 h-6" />
                </div>
                <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">Invalid or Expired Link</h1>
                <p className="text-[#6B7280] font-medium">
                  Security links expire quickly for your protection. Please request a new one.
                </p>
              </div>

              <Button 
                className="w-full h-12 text-base font-bold rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300" 
                asChild
              >
                <Link href="/forgot-password">Request New Link</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-white">
      {redirecting ? (
        <SigningInOverlay message="Password saved" subMessage="Taking you to sign in…" />
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
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">
                Reset Password
              </h1>
              <p className="text-[#6B7280] font-medium">
                Set up your new password to regain access to your account.
              </p>
            </div>

            <form onSubmit={handleReset} className="space-y-6">
              <div className="space-y-2.5">
                <Label htmlFor="new" className="text-sm font-semibold text-[#374151]">New Password</Label>
                <div className="relative group transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                  <Input 
                    id="new" 
                    type={showPassword ? "text" : "password"} 
                    className="h-12 pl-10 pr-12 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                    required
                    value={passwords.new}
                    onChange={(e) => {
                      setFormError(null)
                      setPasswords({ ...passwords, new: e.target.value })
                    }}
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
                <Label htmlFor="confirm" className="text-sm font-semibold text-[#374151]">Confirm Password</Label>
                <div className="relative group transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                  <Input 
                    id="confirm" 
                    type={showConfirmPassword ? "text" : "password"} 
                    className="h-12 pl-10 pr-12 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                    required
                    value={passwords.confirm}
                    onChange={(e) => {
                      setFormError(null)
                      setPasswords({ ...passwords, confirm: e.target.value })
                    }}
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

              {formError ? (
                <p className="text-sm font-medium text-rose-600 text-center" role="alert">
                  {formError}
                </p>
              ) : null}
              
              <Button 
                type="submit" 
                className="w-full h-12 text-base font-bold rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 hover:-translate-y-0.5 transition-all duration-300" 
                disabled={isLoading}
              >
                {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Resetting...
                    </>
                  ) : 'Reset Password'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
