"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { CreditCard, ShieldCheck, ArrowRight, Loader2, Lock, Mail } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function Home() {
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
          title: "Authentication Failed",
          description: "Invalid email or password. Please try again."
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

  return (
    <div className="min-h-screen flex flex-col">
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
          
          <div className="space-y-6 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 text-accent-foreground text-sm font-medium border border-accent/30">
              <ShieldCheck size={16} />
              Enterprise Auth Infrastructure
            </div>
            <h1 className="text-4xl md:text-6xl font-bold font-headline text-foreground tracking-tight leading-tight">
              One Secure Entry. <br />
              <span className="text-primary">Infinite Possibilities.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md mx-auto md:mx-0">
              Sign in to manage your gateway operations with enterprise-grade security.
            </p>
          </div>

          <div className="space-y-6">
            <Card className="shadow-xl border-none">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-headline">Portal Access</CardTitle>
                <CardDescription>
                  Enter your credentials to access your dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="email" 
                        type="email"
                        placeholder="email@example.com" 
                        className="pl-9"
                        required
                        value={credentials.email}
                        onChange={(e) => setCredentials({...credentials, email: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <Button variant="link" className="px-0 h-auto text-xs" type="button" asChild>
                        <Link href="/forgot-password">Forgot password?</Link>
                      </Button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="password" 
                        type="password" 
                        className="pl-9"
                        placeholder="••••••••"
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
                  <p className="text-sm text-muted-foreground">Staff credentials provided by System Admin.</p>
                </div>
                <Button variant="outline" className="w-full h-11 border-primary text-primary hover:bg-primary/5" asChild>
                  <Link href="/register">
                    Register as New Merchant <ArrowRight className="ml-2 w-4 h-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </div>

        </div>
      </main>

      <footer className="border-t py-8 bg-white text-center">
        <p className="text-xs text-muted-foreground">
          © 2024 Finflow Gateway Solution. Authenticated by Auth.js & Prisma.
        </p>
      </footer>
    </div>
  )
}
