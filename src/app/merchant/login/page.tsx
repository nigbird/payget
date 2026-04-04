"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Store, ArrowRight, Loader2, Lock, Mail } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function MerchantLogin() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [credentials, setCredentials] = useState({
    email: "",
    password: ""
  })

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
          title: "Login Failed",
          description: "Invalid merchant credentials. Please check and try again."
        })
      } else {
        toast({
          title: "Welcome back",
          description: "Merchant portal access granted."
        })
        router.refresh()
        // Redirection will be handled by middleware or manually here
        // We push to /merchant which will trigger middleware redirection to /merchant/[id]
        router.push("/merchant") 
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Login Error",
        description: "Could not connect to the merchant authentication service."
      });
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-app-main">
      <header className="h-16 border-b bg-white/70 backdrop-blur-md flex items-center px-6 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <Store size={20} />
          </div>
          <span className="text-xl font-bold font-headline tracking-tight text-[#5b371f]">Merchant Portal</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-[450px] w-full space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black text-[#5b371f] tracking-tight">Grow your business</h1>
            <p className="text-[#754319]/70">Sign in to manage your payments, settlements, and customers.</p>
          </div>

          <Card className="shadow-2xl border-white/60 bg-white/80 backdrop-blur-xl rounded-[2rem] overflow-hidden">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-bold text-[#5b371f]">Merchant Sign In</CardTitle>
              <CardDescription className="text-[#754319]/60">
                Access your dashboard and tools.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold text-[#5b371f]">Business Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#754319]/40 group-focus-within:text-primary transition-colors" />
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="name@business.com" 
                      className="pl-10 h-12 rounded-2xl border-white/50 bg-white/50 focus:bg-white transition-all shadow-sm focus:ring-amber-500/20"
                      required 
                      value={credentials.email}
                      onChange={e => setCredentials({...credentials, email: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" title="password" className="text-sm font-semibold text-[#5b371f]">Security Password</Label>
                    <Link href="/forgot-password" title="forgot password"  className="text-xs font-medium text-primary hover:underline">
                      Forgot?
                    </Link>
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#754319]/40 group-focus-within:text-primary transition-colors" />
                    <Input 
                      id="password" 
                      type="password" 
                      className="pl-10 h-12 rounded-2xl border-white/50 bg-white/50 focus:bg-white transition-all shadow-sm focus:ring-amber-500/20"
                      required 
                      value={credentials.password}
                      onChange={e => setCredentials({...credentials, password: e.target.value})}
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white font-bold shadow-lg shadow-amber-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>Secure Login</span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  )}
                </Button>
              </form>

              <div className="mt-8 pt-6 border-t border-white/40 text-center">
                <p className="text-sm text-[#754319]/60">
                  New to Finflow?{" "}
                  <Link href="/register" className="font-bold text-[#754319] hover:underline">
                    Create Merchant Account
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
          
          <div className="text-center">
            <Link href="/" className="text-xs font-medium text-[#754319]/50 hover:text-[#754319] transition-colors">
              Go to Admin Gateway Entry
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
