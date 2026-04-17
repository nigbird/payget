"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { 
  Loader2, 
  CheckCircle2, 
  ShieldCheck, 
  MessageSquare, 
  ArrowRight, 
  Building2, 
  Mail, 
  Phone, 
  AlertCircle,
  FileText,
  Upload,
  X
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

function ReviewUpdateForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  
  const token = searchParams.get('token')
  
  const [step, setStep] = useState<'validate' | 'otp' | 'review' | 'success'>('validate')
  const [merchant, setMerchant] = useState<any>(null)
  const [otp, setOtp] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Form data for update
  const [formData, setFormData] = useState<any>({})
  
  // Validation on load
  useEffect(() => {
    if (!token) {
      setError("Missing token")
      return
    }
    validateToken()
  }, [token])

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
    setIsSubmitting(true)
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
      setIsSubmitting(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!otp) return
    setIsSubmitting(true)
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
      setIsSubmitting(false)
    }
  }

  const fetchDetails = async () => {
    try {
      const res = await fetch(`/api/merchants/update-details?token=${token}`)
      const data = await res.json()
      if (res.ok) {
        setMerchant(data.merchant)
        setFormData(data.merchant)
        setStep('review')
      } else {
        setError(data.error || "Failed to fetch details")
      }
    } catch (e) {
      setError("Connection error")
    }
  }

  const handleResubmit = async () => {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/merchants/resubmit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...formData })
      })
      if (res.ok) {
        setStep('success')
        toast({ title: "Application Resubmitted", description: "Your updates have been received." })
      } else {
        const data = await res.json()
        toast({ variant: "destructive", title: "Resubmission Failed", description: data.error })
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to connect to server" })
    } finally {
      setIsSubmitting(false)
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
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={() => router.push('/')}>Return Home</Button>
        </CardFooter>
      </Card>
    )
  }

  if (step === 'validate') {
    return <div className="flex items-center gap-2"><Loader2 className="animate-spin" /> Validating link...</div>
  }

  if (step === 'otp') {
    return (
      <Card className="max-w-md w-full shadow-lg border-none">
        <CardHeader className="text-center">
          <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-4" />
          <CardTitle>Verify Your Identity</CardTitle>
          <CardDescription>
            To access your application update, we need to verify it's you.
            A code will be sent to your registered {merchant.contactType}: <span className="font-bold text-slate-900">{merchant.contactUsername}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" className="w-full h-11" onClick={handleSendOtp} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : "Send Verification Code"}
          </Button>
          <div className="space-y-2">
            <Label>Verification Code</Label>
            <Input 
              placeholder="Enter 6-digit code" 
              className="text-center text-lg tracking-[0.5em] h-12"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full h-11" onClick={handleVerifyOtp} disabled={isSubmitting || otp.length < 6}>
            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : "Verify & Continue"}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  if (step === 'review') {
    return (
      <div className="max-w-3xl w-full space-y-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex items-center gap-2 text-amber-800">
              <MessageSquare className="w-5 h-5" />
              <CardTitle className="text-lg">Review Comments</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-900 font-medium leading-relaxed">
              {merchant.updateComments?.general || "No general comments provided. Please review the fields below."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Update Application</CardTitle>
            <CardDescription>Correct the information as requested and resubmit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Business Name</Label>
                <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Business Email</Label>
                <Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Website URL</Label>
                <Input value={formData.websiteUrl} onChange={e => setFormData({...formData, websiteUrl: e.target.value})} />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Business Description</Label>
              <Textarea value={formData.businessDescription} onChange={e => setFormData({...formData, businessDescription: e.target.value})} />
            </div>

            <div className="space-y-2">
              <Label>Compliance Documents</Label>
              <div className="border-2 border-dashed rounded-xl p-8 text-center bg-slate-50/50">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-500 italic">Document re-upload functionality is simplified for this demo. Existing documents are preserved.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                {formData.documents?.map((doc: any) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 bg-white border rounded-xl">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <span className="text-xs font-medium truncate flex-1">{doc.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-6">
            <Button variant="ghost" onClick={() => router.push('/')}>Cancel</Button>
            <Button className="bg-primary h-11 px-8 rounded-xl font-bold" onClick={handleResubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : "Resubmit Application"}
              {!isSubmitting && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <Card className="max-w-md w-full shadow-2xl border-none animate-in zoom-in-95 rounded-3xl overflow-hidden text-center">
        <div className="bg-gradient-to-br from-[#f4db9f] via-[#f8b513] to-[#754319] p-8 text-[#3f210f]">
          <div className="mx-auto w-16 h-16 bg-white/30 rounded-2xl backdrop-blur-md flex items-center justify-center mb-4 border border-white/40">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-black tracking-tight uppercase">Resubmitted!</h3>
          <p className="text-[#3f210f]/80 mt-1 text-xs font-bold uppercase tracking-widest">In review again</p>
        </div>
        <CardContent className="py-8 px-8 space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            Thank you for providing the updates. Your application has been returned to our compliance team for review.
          </p>
          <p className="text-xs text-slate-400">
            You will receive a notification once the review is complete.
          </p>
        </CardContent>
        <CardFooter className="px-8 pb-8">
          <Button className="w-full h-14 rounded-2xl bg-slate-900 text-white font-bold" asChild>
            <Link href="/">Return to Home</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return null
}

export default function ReviewUpdatePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Suspense fallback={<Loader2 className="w-8 h-8 animate-spin text-primary" />}>
        <ReviewUpdateForm />
      </Suspense>
    </div>
  )
}
