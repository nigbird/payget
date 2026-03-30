import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CreditCard, ShieldCheck, UserPlus, Activity, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navbar */}
      <nav className="border-b bg-white/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <CreditCard size={20} />
            </div>
            <span className="text-xl font-bold font-headline tracking-tight text-primary">Finflow Gateway</span>
          </div>
          <div className="flex gap-4">
            <Button variant="ghost" asChild>
              <Link href="/admin">Admin</Link>
            </Button>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link href="/maker">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1">
        <section className="py-20 px-4">
          <div className="max-w-7xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 text-accent-foreground text-sm font-medium border border-accent/30">
              <ShieldCheck size={16} />
              AI-Powered Merchant Onboarding
            </div>
            <h1 className="text-5xl md:text-7xl font-bold font-headline text-foreground tracking-tight max-w-4xl mx-auto">
              Secure, Transparent, <span className="text-primary">Maker-Checker</span> Payments
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              A robust payment gateway solution designed for precision. Onboard merchants with confidence using AI-assisted screening and strict maker-checker protocols.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" className="h-12 px-8 text-lg bg-primary hover:bg-primary/90" asChild>
                <Link href="/maker">Enter Maker Portal <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 text-lg" asChild>
                <Link href="/checker">Checker Review</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Portals Grid */}
        <section className="py-20 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="hover:shadow-lg transition-shadow border-none shadow-sm">
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2">
                    <UserPlus />
                  </div>
                  <CardTitle className="text-xl">Maker Portal</CardTitle>
                  <CardDescription>Submit new merchant registrations with AI-assisted pre-filling.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="link" className="p-0 h-auto text-primary" asChild>
                    <Link href="/maker">Register Merchant →</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow border-none shadow-sm">
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent-foreground mb-2">
                    <ShieldCheck />
                  </div>
                  <CardTitle className="text-xl">Checker Portal</CardTitle>
                  <CardDescription>Strict verification and approval flow for submitted registrations.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="link" className="p-0 h-auto text-accent-foreground" asChild>
                    <Link href="/checker">Verify Requests →</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow border-none shadow-sm">
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2">
                    <LayoutDashboard />
                  </div>
                  <CardTitle className="text-xl">Merchant Dash</CardTitle>
                  <CardDescription>Secure dashboard for merchants to view transaction history.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="link" className="p-0 h-auto text-primary" asChild>
                    <Link href="/merchant/m1">View Demo Dash →</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow border-none shadow-sm">
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent-foreground mb-2">
                    <Activity />
                  </div>
                  <CardTitle className="text-xl">Admin Oversight</CardTitle>
                  <CardDescription>Global view of system transactions and gateway health.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="link" className="p-0 h-auto text-accent-foreground" asChild>
                    <Link href="/admin">View Insights →</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">FF</div>
            <span className="font-bold text-lg tracking-tight">Finflow Gateway</span>
          </div>
          <div className="text-sm text-muted-foreground">
            © 2024 Finflow Gateway Solution. Built for security.
          </div>
          <div className="flex gap-6 text-sm font-medium">
            <Link href="#" className="hover:text-primary">Privacy Policy</Link>
            <Link href="#" className="hover:text-primary">API Docs</Link>
            <Link href="#" className="hover:text-primary">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LayoutDashboard() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
  )
}