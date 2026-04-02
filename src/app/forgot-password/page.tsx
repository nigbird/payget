"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { ArrowLeft, Clock, Loader2, Mail, Phone, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/app/lib/db"

export default function ForgotPassword() {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [identifier, setIdentifier] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)

  const handleRequestReset = (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    setTimeout(() => {
      const merchant = db.findMerchantByIdentifier(identifier)
      const config = db.getSystemConfig()

      if (merchant) {
        const token = Math.random().toString(36).substr(2, 12)
        const expiry = new Date(Date.now() + config.resetTimeoutSeconds * 1000).toISOString()
        
        db.updateMerchant(merchant.id, {
          passwordResetToken: token,
          passwordResetExpires: expiry
        })

        setSentTo(identifier)
        toast({
          title: "Reset Link Generated",
          description: `A reset link has been simulated for your account.`
        })
      } else {
        toast({
          variant: "destructive",
          title: "Account Not Found",
          description: "No merchant found with that email or phone number."
        })
      }
      setIsLoading(false)
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Login
        </Link>
        
        <Card className="shadow-xl border-none">
          <CardHeader>
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>
              We'll send a secure link to your registered email or phone number.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sentTo ? (
              <form onSubmit={handleRequestReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="identifier">Email or Phone</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="identifier" 
                      placeholder="Enter registered identifier" 
                      className="pl-9"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Request Reset Link"}
                </Button>
              </form>
            ) : (
              <div className="space-y-6 text-center py-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="text-primary w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold">Reset Link Sent!</h3>
                  <p className="text-sm text-muted-foreground">
                    A simulation link has been created for <span className="text-foreground font-medium">{sentTo}</span>.
                  </p>
                </div>
                
                <div className="p-4 bg-muted rounded-lg border text-left space-y-3">
                  <p className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                    <Clock className="w-3 h-3" /> Simulation Notice
                  </p>
                  <p className="text-xs leading-relaxed">
                    In a production environment, this link would be sent via SMS/Email. For this demo, use the link below:
                  </p>
                  <Button variant="outline" className="w-full text-xs font-mono" asChild>
                    {/* Look up token from DB for the demo link */}
                    <Link href={`/reset-password/${db.findMerchantByIdentifier(sentTo)?.passwordResetToken}`}>
                      Proceed to Reset Form
                    </Link>
                  </Button>
                  <p className="text-[10px] text-orange-600 font-medium">
                    Link expires in {db.getSystemConfig().resetTimeoutSeconds} seconds.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}