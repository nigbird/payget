"use client"

import { useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle2, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

function SetupPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  
  const merchantId = searchParams.get('merchantId')
  const token = searchParams.get('token')
  
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

  if (!merchantId || !token) {
    return (
      <Card className="max-w-md w-full shadow-lg border-none">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-headline text-red-600">Invalid Link</CardTitle>
          <CardDescription>
            This setup link is invalid or has expired.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Please contact support if you believe this is an error.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
            Return Home
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

export default function SetupPasswordPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-primary" />}>
        <SetupPasswordForm />
      </Suspense>
    </div>
  )
}
