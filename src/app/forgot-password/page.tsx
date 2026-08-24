"use client"

import { useState, type FormEvent, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Loader2, Mail, CheckCircle2 } from "lucide-react"
function ForgotPasswordContent() {
  const searchParams = useSearchParams()
  const loginHref = searchParams.get("portal") === "merchant" ? "/login/merchant" : "/login"
  const [isLoading, setIsLoading] = useState(false)
  const [identifier, setIdentifier] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)

  const handleRequestReset = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setRequestError(null)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, action: 'request' })
      })

      if (response.ok) {
        setSentTo(identifier)
      } else {
        const error = await response.json()
        setRequestError(
          error.error || "No account found with that email or phone number."
        )
      }
    } catch {
      setRequestError("Could not process your request right now. Try again shortly.")
    } finally {
      setIsLoading(false)
    }
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
        <div className="w-full max-w-md animate-fade-in-up space-y-4">
          <Link href={loginHref} className="inline-flex items-center text-sm text-[#6B7280] hover:text-[#1F2937]">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Login
          </Link>
          
          <div className="backdrop-blur-md bg-white/60 border border-white/40 rounded-2xl shadow-2xl p-8 space-y-8">
            {!sentTo ? (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">Reset Password</h1>
                  <p className="text-[#6B7280] font-medium">
                    We'll send a secure link to your registered email or phone number.
                  </p>
                </div>
                
                <form onSubmit={handleRequestReset} className="space-y-6">
                  <div className="space-y-2.5">
                    <Label htmlFor="identifier" className="text-sm font-semibold text-[#374151]">Email or Phone</Label>
                    <div className="relative group transition-all">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                      <Input 
                        id="identifier" 
                        placeholder="Enter registered identifier" 
                        className="h-12 pl-10 pr-4 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                        required
                        value={identifier}
                        aria-invalid={Boolean(requestError)}
                        onChange={(e) => {
                          setRequestError(null)
                          setIdentifier(e.target.value)
                        }}
                      />
                    </div>
                    {requestError && (
                      <p className="text-sm font-medium text-rose-600" role="alert">
                        {requestError}
                      </p>
                    )}
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-bold rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 hover:-translate-y-0.5 transition-all duration-300" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Requesting link...
                      </>
                    ) : "Request Reset Link"}
                  </Button>
                </form>
              </div>
            ) : (
              <div className="space-y-6 text-center py-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="text-green-600 w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-xl text-[#1F2937]">Reset Link Sent!</h3>
                  <p className="text-sm text-[#6B7280]">
                    We've sent a reset link to <span className="text-[#1F2937] font-medium">{sentTo}</span>.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ForgotPassword() {
  return (
    <Suspense>
      <ForgotPasswordContent />
    </Suspense>
  )
}
