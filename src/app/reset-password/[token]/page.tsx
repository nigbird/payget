"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle2, Loader2, Lock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/app/lib/db"

export default function ResetPassword({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  
  const [isLoading, setIsLoading] = useState(false)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [merchantId, setMerchantId] = useState<string | null>(null)
  const [passwords, setPasswords] = useState({
    new: "",
    confirm: ""
  })

  useEffect(() => {
    const merchant = db.findMerchantByResetToken(token)
    if (merchant && merchant.passwordResetExpires) {
      const isExpired = new Date() > new Date(merchant.passwordResetExpires)
      if (!isExpired) {
        setIsValid(true)
        setMerchantId(merchant.id)
      } else {
        setIsValid(false)
      }
    } else {
      setIsValid(false)
    }
  }, [token])

  const handleReset = (e: React.FormEvent) => {
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

    setTimeout(() => {
      if (merchantId) {
        db.updateMerchant(merchantId, {
          password: passwords.new,
          passwordResetToken: undefined,
          passwordResetExpires: undefined
        })
        toast({
          title: "Password Updated",
          description: "Your new password has been set successfully."
        })
        router.push("/")
      }
    }, 1000)
  }

  if (isValid === null) return null

  if (!isValid) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
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
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
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
                  type="password" 
                  className="pl-9"
                  required
                  value={passwords.new}
                  onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="confirm" 
                  type="password" 
                  className="pl-9"
                  required
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                />
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