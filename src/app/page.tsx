"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { CreditCard, ShieldCheck, ArrowRight, Loader2, Lock, User } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/app/lib/db"

export default function Home() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [credentials, setCredentials] = useState({
    id: "",
    password: ""
  })

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // Simulate a small delay for better UX
    setTimeout(() => {
      const merchant = db.getMerchantById(credentials.id)
      
      if (merchant && merchant.password === credentials.password) {
        toast({
          title: "Login Successful",
          description: `Welcome back, ${merchant.name}!`
        })
        router.push(`/merchant/${merchant.id}`)
      } else {
        toast({
          variant: "destructive",
          title: "Authentication Failed",
          description: "Invalid Merchant ID or Password. Please check your credentials."
        })
        setIsLoading(false)
      }
    }, 800)
  }

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      {/* Simple Header */}
      <header className="h-16 border-b bg-white flex items-center px-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <CreditCard size={20} />
          </div>
          <span className="text-xl font-bold font-headline tracking-tight text-primary">Finflow Gateway</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-[1000px] w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          
          {/* Left Side: Value Prop */}
          <div className="space-y-6 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 text-accent-foreground text-sm font-medium border border-accent/30">
              <ShieldCheck size={16} />
              Enterprise Payment Infrastructure
            </div>
            <h1 className="text-4xl md:text-6xl font-bold font-headline text-foreground tracking-tight leading-tight">
              One Platform. <br />
              <span className="text-primary">Infinite Possibilities.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md mx-auto md:mx-0">
              Securely process payments, manage settlements, and track business growth with our AI-powered gateway.
            </p>
            
            <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-primary/10">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold italic">T+1</div>
                <div className="text-left">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Fast Settlement</p>
                  <p className="text-sm font-medium">Funds in your account next day</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Login & Sign Up Hub */}
          <div className="space-y-6">
            <Card className="shadow-xl border-none">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-headline">Merchant Login</CardTitle>
                <CardDescription>
                  Access your dashboard to view transactions and status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="merchantId">Merchant ID</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="merchantId" 
                        placeholder="m_xxxxxx" 
                        className="pl-9"
                        required
                        value={credentials.id}
                        onChange={(e) => setCredentials({...credentials, id: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <Button variant="link" className="px-0 h-auto text-xs" type="button">Forgot password?</Button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="password" 
                        type="password" 
                        className="pl-9"
                        required
                        value={credentials.password}
                        onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11" disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Sign In"}
                  </Button>
                </form>
              </CardContent>
              <CardFooter className="flex flex-col border-t p-6 gap-4 bg-muted/5">
                <div className="text-center w-full">
                  <p className="text-sm text-muted-foreground">New to Finflow?</p>
                </div>
                <Button variant="outline" className="w-full h-11 border-primary text-primary hover:bg-primary/5" asChild>
                  <Link href="/register">
                    Register as Merchant <ArrowRight className="ml-2 w-4 h-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>

            {/* Staff Entry Points */}
            <div className="grid grid-cols-3 gap-2">
              <Button variant="ghost" className="text-[10px] uppercase font-bold text-muted-foreground hover:text-primary" asChild>
                <Link href="/admin">Admin</Link>
              </Button>
              <Button variant="ghost" className="text-[10px] uppercase font-bold text-muted-foreground hover:text-primary" asChild>
                <Link href="/maker">Maker</Link>
              </Button>
              <Button variant="ghost" className="text-[10px] uppercase font-bold text-muted-foreground hover:text-primary" asChild>
                <Link href="/checker">Checker</Link>
              </Button>
            </div>
          </div>

        </div>
      </main>

      <footer className="border-t py-8 bg-white text-center">
        <p className="text-xs text-muted-foreground">
          © 2024 Finflow Gateway Solution. Securely processed by Maker-Checker Architecture.
        </p>
      </footer>
    </div>
  )
}
