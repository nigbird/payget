"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Wallet,
  Clock,
  Activity,
  Plus,
  Receipt,
  AlertCircle,
  Phone,
  UserRound,
  Sparkles,
  ChevronRight,
  Loader2,
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
  const [showAllRecent, setShowAllRecent] = useState(false)

  const [requestForm, setRequestForm] = useState({
    amount: "",
    description: "",
    payerPhone: "",
    customerName: "",
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

    setTimeout(() => {
      const newRequest: Transaction = {
        id: `req_${Math.random().toString(36).substr(2, 9)}`,
        merchantId: id,
        amount: amountNum,
        status: 'pending',
        callbackUrl: merchant.callbackUrl,
        description: requestForm.description || `Payment Request for ${requestForm.customerName || "Customer"}`,
        timestamp: new Date().toISOString(),
        payerPhone: requestForm.payerPhone
      }

      db.addTransaction(newRequest)
      setTransactions([newRequest, ...transactions])
      setIsSubmitting(false)
      setIsRequestModalOpen(false)
      setRequestForm({ amount: "", description: "", payerPhone: "", customerName: "" })

      toast({
        title: "Payment Requested",
        description: `Request for $${amountNum} sent to ${requestForm.payerPhone}.`
      })
    }, 800)
  }

  const isPending = merchant.status === 'pending'
  const isRejected = merchant.status === 'rejected'
  const isApproved = merchant.status === 'approved'

  const totalReceived = transactions.reduce((acc, tx) => acc + (tx.status === "success" ? tx.amount : 0), 0)
  const pendingRequests = transactions.filter((tx) => tx.status === "pending")
  const todayActivity = transactions.filter((tx) => {
    const txDate = new Date(tx.timestamp)
    const now = new Date()
    return txDate.toDateString() === now.toDateString()
  })
  const recentTransactions = showAllRecent ? transactions : transactions.slice(0, 3)
  const quickAmounts = [25, 50, 100, 250]

  return (
    <div className="min-h-screen bg-[linear-gradient(145deg,#fff7e5_0%,#fef0cf_40%,#fff7ec_100%)] pb-24">
      <main className="mx-auto w-full max-w-md p-4 space-y-4">
        <section className="rounded-3xl border border-white/40 bg-white/65 p-5 shadow-xl backdrop-blur-md">
          <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Merchant Dashboard</p>
          <h1 className="mt-2 text-2xl font-bold text-[#5b371f]">Welcome back, {merchant.name}</h1>
          <p className="mt-1 text-sm text-[#754319]/70">Track requests and collect payments with smooth flow.</p>
        </section>

        {!isApproved && (
          <Card className={`rounded-3xl border ${isPending ? "border-amber-200 bg-amber-50/90" : "border-rose-200 bg-rose-50/90"}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {isPending ? <Clock className="w-5 h-5 text-amber-600 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5" />}
                <div>
                  <p className="font-semibold text-sm">Account status: {merchant.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {isPending ? "Payment requests unlock once your account is approved." : merchant.rejectionReason || "Application requires updates."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="grid grid-cols-1 gap-3">
          <Card className="overflow-hidden rounded-3xl border-0 shadow-lg">
            <CardContent className="bg-gradient-to-br from-[#f4db9f] via-[#f8b513] to-[#754319] p-4 text-[#3f210f]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider">Total Received</p>
                <Wallet className="h-4 w-4" />
              </div>
              <p className="mt-3 text-3xl font-black">${totalReceived.toFixed(2)}</p>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Card className="rounded-3xl border-white/60 bg-white/60 shadow-md backdrop-blur-sm">
              <CardContent className="p-4">
                <p className="text-xs text-[#754319]/70">Pending Requests</p>
                <p className="mt-2 text-2xl font-bold text-[#5b371f]">{pendingRequests.length}</p>
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-white/60 bg-white/60 shadow-md backdrop-blur-sm">
              <CardContent className="p-4">
                <p className="text-xs text-[#754319]/70">Today Activity</p>
                <p className="mt-2 text-2xl font-bold text-[#5b371f]">{todayActivity.length}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="rounded-3xl border border-white/50 bg-white/65 p-4 shadow-md backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-[#5b371f]">Recent transactions</h2>
            <Button variant="link" className="h-auto p-0 text-[#754319]" onClick={() => setShowAllRecent((prev) => !prev)}>
              {showAllRecent ? "Show Less" : "View All"}
            </Button>
          </div>
          <div className="space-y-2">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/80 p-3">
                <div>
                  <p className="text-sm font-medium text-[#5b371f]">{tx.description}</p>
                  <p className="text-xs text-[#754319]/70">{tx.payerPhone || "Web checkout"}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[#5b371f]">${tx.amount.toFixed(2)}</p>
                  <Badge variant="outline" className="mt-1 text-[10px] capitalize">
                    {tx.status}
                  </Badge>
                </div>
              </div>
            ))}
            {transactions.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
          </div>
          <Link href="/" className="mt-3 inline-flex items-center text-xs font-medium text-[#754319]">
            Go to overview <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </section>
      </main>

      <Sheet open={isRequestModalOpen} onOpenChange={setIsRequestModalOpen}>
        <SheetTrigger asChild>
          <Button
            disabled={!isApproved}
            className="fixed bottom-6 right-6 h-14 rounded-full bg-gradient-to-r from-[#f8b513] to-[#754319] px-6 text-white shadow-2xl shadow-amber-500/40 hover:scale-[1.02] active:scale-95"
          >
            <Plus className="mr-2 h-5 w-5" />
            Request Payment
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[88vh] rounded-t-3xl border-0 bg-[linear-gradient(180deg,#fffaf0_0%,#fff5de_100%)] px-4 pb-8">
          <div className="mx-auto mb-3 mt-1 h-1.5 w-14 rounded-full bg-[#754319]/25" />
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl text-[#5b371f]">Request payment</SheetTitle>
            <SheetDescription>Capture customer info and send a request in seconds.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleRequestPayment} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="customerName"
                  placeholder="Jane Carter"
                  className="h-12 rounded-2xl border-white/50 bg-white/80 pl-9"
                  value={requestForm.customerName}
                  onChange={(e) => setRequestForm({ ...requestForm, customerName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Customer Phone</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  className="h-12 rounded-2xl border-white/50 bg-white/80 pl-9"
                  required
                  value={requestForm.payerPhone}
                  onChange={(e) => setRequestForm({ ...requestForm, payerPhone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                className="h-16 rounded-2xl border-2 border-[#f8b513]/30 bg-white text-center text-3xl font-black text-[#5b371f]"
                required
                value={requestForm.amount}
                onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                {quickAmounts.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="outline"
                    className="rounded-full border-[#f8b513]/40 bg-white/80 text-[#754319]"
                    onClick={() => setRequestForm({ ...requestForm, amount: amount.toString() })}
                  >
                    ${amount}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Order #1022"
                className="min-h-[100px] rounded-2xl border-white/50 bg-white/80"
                value={requestForm.description}
                onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
              />
            </div>
            <Button
              type="submit"
              className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-base text-white shadow-lg shadow-amber-600/30"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Send Payment Request
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <Receipt className="mr-1 inline h-3.5 w-3.5" />
              Request is instantly visible to the customer app.
            </p>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}