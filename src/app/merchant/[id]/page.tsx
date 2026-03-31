"use client"

import { use, useEffect, useState } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { 
  LayoutDashboard, 
  ArrowUpRight, 
  Wallet, 
  CreditCard,
  History,
  TrendingUp,
  CircleDollarSign,
  AlertCircle,
  Clock,
  PlusCircle,
  Phone,
  MessageSquare,
  DollarSign,
  Loader2,
  CheckCircle2
} from "lucide-react"
import { db, type Merchant, type Transaction } from "@/app/lib/db"
import { useToast } from "@/hooks/use-toast"

export default function MerchantDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [requestForm, setRequestForm] = useState({
    amount: "",
    description: "",
    payerPhone: ""
  })

  useEffect(() => {
    const m = db.getMerchantById(id)
    if (m) {
      setMerchant(m)
      setTransactions([...db.getTransactionsByMerchant(id)].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()))
    }
  }, [id])

  if (!merchant) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-muted/20 gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Merchant Not Found</h2>
        <p className="text-muted-foreground">The requested merchant account does not exist.</p>
      </div>
    )
  }

  const handleRequestPayment = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Simple Validation
    const amountNum = parseFloat(requestForm.amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0."
      })
      return
    }

    if (!requestForm.payerPhone.trim()) {
      toast({
        variant: "destructive",
        title: "Phone Required",
        description: "Please provide a payer phone number."
      })
      return
    }

    setIsSubmitting(true)

    // Simulate creation
    setTimeout(() => {
      const newRequest: Transaction = {
        id: `req_${Math.random().toString(36).substr(2, 9)}`,
        merchantId: id,
        amount: amountNum,
        status: 'pending',
        callbackUrl: merchant.callbackUrl,
        description: requestForm.description || 'Payment Request',
        timestamp: new Date().toISOString(),
        payerPhone: requestForm.payerPhone
      }

      db.addTransaction(newRequest)
      setTransactions([newRequest, ...transactions])
      setIsSubmitting(false)
      setIsRequestModalOpen(false)
      setRequestForm({ amount: "", description: "", payerPhone: "" })

      toast({
        title: "Payment Requested",
        description: `Request for $${amountNum} sent to ${requestForm.payerPhone}.`
      })
    }, 800)
  }

  const isPending = merchant.status === 'pending'
  const isRejected = merchant.status === 'rejected'
  const isApproved = merchant.status === 'approved'

  const totalVolume = transactions.reduce((acc, tx) => acc + (tx.status === 'success' ? tx.amount : 0), 0)

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 sticky top-0 bg-background/95 backdrop-blur z-40">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <LayoutDashboard className="text-primary w-5 h-5" />
            <h1 className="text-lg font-semibold font-headline hidden sm:block">Merchant Insights: {merchant.name}</h1>
          </div>
          
          <Dialog open={isRequestModalOpen} onOpenChange={setIsRequestModalOpen}>
            <DialogTrigger asChild>
              <Button disabled={!isApproved} size="sm" className="gap-2">
                <PlusCircle className="w-4 h-4" />
                Request Payment
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>New Payment Request</DialogTitle>
                <DialogDescription>
                  Send a payment link to your customer's mobile device.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleRequestPayment} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount ($)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="amount" 
                      type="number" 
                      step="0.01"
                      placeholder="0.00" 
                      className="pl-9"
                      required
                      value={requestForm.amount}
                      onChange={e => setRequestForm({...requestForm, amount: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Payer Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="phone" 
                      type="tel" 
                      placeholder="+1 (555) 000-0000" 
                      className="pl-9"
                      required
                      value={requestForm.payerPhone}
                      onChange={e => setRequestForm({...requestForm, payerPhone: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Payment Reason</Label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Textarea 
                      id="description" 
                      placeholder="e.g. Order #12345" 
                      className="pl-9 min-h-[80px]"
                      value={requestForm.description}
                      onChange={e => setRequestForm({...requestForm, description: e.target.value})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Send Payment Request"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-muted/20">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Status Alert for Unapproved Merchants */}
            {!isApproved && (
              <Card className={`border-none ${isPending ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    {isPending ? <Clock className="w-6 h-6 text-orange-500 mt-1" /> : <AlertCircle className="w-6 h-6 text-red-500 mt-1" />}
                    <div>
                      <h3 className={`font-bold text-lg ${isPending ? 'text-orange-800' : 'text-red-800'}`}>
                        Account Status: {merchant.status.toUpperCase()}
                      </h3>
                      <p className={`text-sm ${isPending ? 'text-orange-700' : 'text-red-700'}`}>
                        {isPending 
                          ? "Your application is currently being reviewed by our compliance team. Payment requesting features are disabled until activation."
                          : `Your application was rejected. Reason: ${merchant.rejectionReason || "No specific reason provided."}`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Merchant Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Settled Balance</CardTitle>
                  <Wallet className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${(totalVolume * 0.98).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <p className="text-xs text-muted-foreground">Net of 2% gateway fee</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Volume (Life)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-accent-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <p className="text-xs text-muted-foreground">{transactions.filter(t => t.status === 'success').length} successful transactions</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Daily Limit</CardTitle>
                  <CircleDollarSign className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${merchant.dailyLimit.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">Max daily processing capacity</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Account Status</CardTitle>
                  <Badge className={isApproved ? 'bg-green-500' : isPending ? 'bg-orange-500' : 'bg-destructive'}>
                    {merchant.status}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{isApproved ? 'Verified' : 'Unverified'}</div>
                  <p className="text-xs text-muted-foreground">Business Type: {merchant.businessType}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Real-time log of payments and pending requests.</CardDescription>
                </div>
                <History className="text-muted-foreground w-5 h-5" />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-[10px] text-primary font-medium">{tx.id}</TableCell>
                        <TableCell className="text-xs">{tx.payerPhone || 'Web Checkout'}</TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell className="font-semibold">${tx.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={tx.status === 'success' ? 'default' : tx.status === 'pending' ? 'outline' : 'destructive'} 
                            className={tx.status === 'success' ? 'bg-green-500' : tx.status === 'pending' ? 'text-orange-500 border-orange-200' : ''}
                          >
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(tx.timestamp).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {transactions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">
                          No activity found for this account.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Quick API Docs Preview */}
            <Card className="border-none shadow-sm bg-primary/5 border border-primary/10">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  Integration Guide
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 bg-white rounded-lg border border-primary/10 space-y-2">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Merchant ID</p>
                    <code className="text-sm text-primary block truncate">{merchant.id}</code>
                  </div>
                  <div className="p-4 bg-white rounded-lg border border-primary/10 space-y-2">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Callback Endpoint</p>
                    <code className="text-sm text-primary block truncate">{merchant.callbackUrl}</code>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}