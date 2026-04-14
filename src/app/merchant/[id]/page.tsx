"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Wallet,
  Clock,
  TrendingUp,
  Plus,
  AlertCircle,
  Phone,
  UserRound,
  Sparkles,
  Copy,
  CheckCircle2,
  ArrowUpRight,
  ChevronRight,
  Loader2,
  ShieldAlert,
  Info,
  Share2,
  ExternalLink,
  SendHorizontal,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"

export default function MerchantDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const [merchant, setMerchant] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isRequestPanelOpen, setIsRequestPanelOpen] = useState(false)
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [lastMode, setLastMode] = useState<"push" | "link" | null>(null)
  const [lastRequestDetails, setLastRequestDetails] = useState<{
    amount: string
    phone: string
  } | null>(null)
  const [generatedResult, setGeneratedResult] = useState<{
    paymentUrl?: string
    customerPinToken?: string
    transactionReference?: string
  } | null>(null)

  const [requestForm, setRequestForm] = useState({
    amount: "",
    description: "",
    payerPhone: "",
  })

  useEffect(() => {
    async function fetchData() {
      try {
        const [mRes, tRes] = await Promise.all([
          fetch(`/api/merchants/${id}`),
          fetch(`/api/merchants/${id}/transactions`)
        ]);
        if (mRes.ok) setMerchant(await mRes.json());
        if (tRes.ok) setTransactions(await tRes.json());
      } catch (err) {
        console.error("Failed to fetch dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    // Polling for updates every 5 seconds
    const interval = setInterval(async () => {
      try {
        const tRes = await fetch(`/api/merchants/${id}/transactions`);
        if (tRes.ok) {
          const newTransactions = await tRes.json();
          // Sort transactions by timestamp descending
          setTransactions(newTransactions.sort((a: any, b: any) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          ));
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [id]);

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-muted/20 gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Syncing dashboard data...</p>
      </div>
    )
  }

  if (!merchant) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-muted/20 gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Merchant Not Found</h2>
        <p className="text-muted-foreground">The requested merchant account does not exist.</p>
      </div>
    )
  }

  if (merchant.status !== 'approved' && merchant.status !== 'active') {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 gap-6 p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="relative inline-block">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-10 h-10 text-orange-600" />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm">
              <Clock className="w-6 h-6 text-orange-500 animate-pulse" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Portal Access Restricted</h2>
            <p className="text-slate-500">
              Your merchant account is currently <span className="font-semibold text-orange-600 uppercase text-sm">{merchant.status.replace('_', ' ')}</span>.
            </p>
          </div>

          <Card className="border-orange-100 bg-orange-50/30 text-left">
            <CardContent className="p-4 flex gap-3">
              <Info className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div className="text-sm text-orange-800">
                <p className="font-medium mb-1">Onboarding in Progress</p>
                <p>Full access to the merchant portal and payment features is only granted once your registration has been fully approved by the compliance team.</p>
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
            Refresh Status
          </Button>
        </div>
      </div>
    )
  }

  const handleRequestPayment = async (mode: "push" | "link") => {
    const amountNum = parseFloat(requestForm.amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0.",
      })
      return
    }

    if (!requestForm.payerPhone.trim()) {
      toast({
        variant: "destructive",
        title: "Phone Required",
        description: "Please provide a payer phone number.",
      })
      return
    }

    setIsSubmitting(true)
    setLastMode(mode)
    setGeneratedResult(null)

    try {
      const transactionId = `tx_${Math.random().toString(36).slice(2, 10)}`
      const timestamp = new Date().toISOString()
      const serviceDescription =
        requestForm.description || `Payment Request for Customer`

      const authToken = `demo_auth_${Math.random().toString(36).slice(2, 10)}`

      const payload = {
        merchantId: id,
        transactionId,
        userCredentials: {
          phone: requestForm.payerPhone,
          authToken,
        },
        amount: amountNum,
        serviceDescription,
        timestamp,
      }

      const endpoint = mode === "push" ? "/api/payments/push" : "/api/payments/link"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Request Failed",
          description: data?.error || "Please check the inputs and try again.",
        })
        return
      }

      const txRefresh = await fetch(`/api/merchants/${id}/transactions`);
      if (txRefresh.ok) setTransactions(await txRefresh.json());

      if (mode === "push") {
        const customerPinToken = data?.customerPinToken as string | undefined
        const transactionReference = data?.transactionReference as string | undefined
        const paymentUrl =
          customerPinToken && typeof window !== "undefined"
            ? `${window.location.origin}/pay/link?token=${encodeURIComponent(customerPinToken)}`
            : undefined

        setGeneratedResult({ customerPinToken, transactionReference, paymentUrl })
      } else {
        setGeneratedResult({
          paymentUrl: data?.paymentUrl as string | undefined,
          customerPinToken: data?.token as string | undefined,
          transactionReference: data?.transactionReference as string | undefined,
        })
      }

      toast({
        title: mode === "push" ? "USSD Request Initiated" : "Payment Link Generated",
        description:
          mode === "push"
            ? `A customer PIN entry prompt is ready (demo token returned).`
            : `Share the secure payment link with your customer.`,
      })
      
      setLastRequestDetails({
        amount: requestForm.amount,
        phone: requestForm.payerPhone
      })

      // Close the request panel
      setIsRequestPanelOpen(false)
      
      // Open the success modal for both modes
      setIsSuccessModalOpen(true)

      setRequestForm((prev) => ({ ...prev, amount: "", description: "" }))
    } catch {
      toast({
        variant: "destructive",
        title: "Unexpected Error",
        description: "Could not create payment request. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResendPush = async (txId: string) => {
    setIsResending(txId)
    try {
      const response = await fetch(`/api/transactions/${txId}/resend-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        toast({
          title: "Push re-sent",
          description: data.message || "The USSD push was successfully re-sent to the customer."
        })
        // Refresh transactions list
        const tRes = await fetch(`/api/merchants/${id}/transactions`)
        if (tRes.ok) setTransactions(await tRes.json())
      } else {
        toast({
          variant: "destructive",
          title: "Failed to re-send",
          description: data.error || "Please check the transaction status and try again."
        })
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Unexpected Error",
        description: "Could not communicate with the payment provider."
      })
    } finally {
      setIsResending(null)
    }
  }

  const isPending = merchant.status === "pending" || merchant.status === "branch_approved"
  const isApproved = merchant.status === "approved" || merchant.status === "active"

  const formContent = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-6 pb-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Customer Phone</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    className="h-12 rounded-2xl border-white/50 bg-white/85 pl-9 shadow-sm focus-visible:ring-amber-500"
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
                  className="h-16 rounded-2xl border-2 border-[#f8b513]/30 bg-white text-center text-3xl font-black text-[#5b371f] shadow-sm focus-visible:ring-amber-500"
                  required
                  value={requestForm.amount}
                  onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Order #1022"
                  className="min-h-[100px] rounded-2xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500"
                  value={requestForm.description}
                  onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={() => handleRequestPayment("push")}
                  className="h-12 rounded-2xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-sm font-bold text-white shadow-lg shadow-amber-600/30"
                  disabled={isSubmitting || !isApproved}
                >
                  {isSubmitting && lastMode === "push" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Push Payment
                </Button>
                <Button
                  type="button"
                  onClick={() => handleRequestPayment("link")}
                  className="h-12 rounded-2xl bg-white border border-[#f8b513]/30 text-[#754319] text-sm font-bold shadow-sm hover:bg-amber-50/50"
                  disabled={isSubmitting || !isApproved}
                >
                  {isSubmitting && lastMode === "link" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  Generate Link
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )

  const totalReceived = transactions.reduce((acc, tx) => acc + (tx.status === "success" ? tx.amount : 0), 0)
  const pendingRequests = transactions.filter((tx) => ["pending", "awaiting_pin", "initiated", "processing"].includes(tx.status))
  const todayActivity = transactions.filter((tx) => {
    const txDate = new Date(tx.timestamp)
    const now = new Date()
    return txDate.toDateString() === now.toDateString()
  })
  const recentTransactions = transactions.slice(0, 4)
  const metricCards = [
    {
      title: "Balance",
      value: `${(totalReceived * 0.98).toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`,
      hint: "Net of fees",
      icon: Wallet,
    },
    {
      title: "Volume",
      value: `${totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`,
      hint: `${transactions.filter((tx) => tx.status === "success").length} successful`,
      icon: TrendingUp,
    },
    {
      title: "Account Status",
      value: (merchant.status === "approved" || merchant.status === "active") ? "Verified" : "Reviewing",
      hint: merchant.businessType || "Merchant",
      icon: ShieldAlert,
    },
  ]

  const copyText = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1400)
    toast({ title: "Copied", description: "Value copied to clipboard." })
  }

  const handleShare = async () => {
    if (!generatedResult?.paymentUrl) return

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Payment for ${merchant.name}`,
          text: `Pay ${merchant.name} - ${requestForm.description || "Payment Request"}`,
          url: generatedResult.paymentUrl,
        })
        toast({ title: "Shared successfully" })
      } catch (error) {
        if ((error as any).name !== "AbortError") {
          toast({ variant: "destructive", title: "Share failed" })
        }
      }
    } else {
      // Fallback: Copy to clipboard and show toast
      copyText(generatedResult.paymentUrl, "shareFallback")
      toast({ title: "Share not supported", description: "Link copied to clipboard instead." })
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero Balance Section */}
      <section className="relative overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-br from-[#f4db9f] via-[#f8b513] to-[#754319] p-8 md:p-12 shadow-2xl">
        {/* Honeycomb pattern overlay */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="honeycomb" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <polygon points="30,0 40,10 40,30 30,40 20,30 20,10" fill="none" stroke="currentColor" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#honeycomb)" />
          </svg>
        </div>
        
        <div className="relative z-10 flex flex-col items-start justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] font-semibold text-[#3f210f]/70">Account Balance</p>
            <h1 className="mt-3 text-5xl md:text-6xl font-black text-[#3f210f] tracking-tight">
              {merchant?.balance?.toFixed(2) || "0.00"} ETB
            </h1>
            <p className="mt-2 text-base md:text-lg text-[#3f210f]/80">Available for withdrawal</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button
              disabled={!isApproved}
              className="h-12 px-6 rounded-2xl bg-white text-[#754319] font-bold shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
              onClick={() => setIsRequestPanelOpen(true)}
            >
              <Plus className="mr-2 h-5 w-5" />
              Push Payment
            </Button>
            <Button
              variant="outline"
              className="h-12 px-6 rounded-2xl border-white/40 text-white hover:bg-white/10 font-bold shadow-lg"
              onClick={() => setIsRequestPanelOpen(true)}
            >
              Generate Link
            </Button>
          </div>
        </div>
      </section>

      {!isApproved && (
        <Card className={`rounded-2xl border ${isPending ? "border-amber-200 bg-amber-50/90" : "border-rose-200 bg-rose-50/90"} shadow-md`}>
          <CardContent className="relative p-5">
            <div className="relative flex items-start justify-between">
              {isPending ? <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />}
              <div className="ml-3 flex-1">
                <p className="font-semibold text-sm">Account status: {merchant.status}</p>
                <p className="text-xs text-muted-foreground">
                  {isPending ? "Payment requests unlock once your account is approved." : merchant.rejectionReason || "Application requires updates."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {metricCards.map((item) => {
          const Icon = item.icon
          return (
            <Card
              key={item.title}
              className="overflow-hidden rounded-2xl border border-white/50 shadow-lg backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-gradient-to-br from-[#fff9ef] to-[#fdf1d4]"
            >
              <CardContent className="relative p-6 h-full flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#754319]/70">{item.title}</p>
                  <p className="text-3xl font-black text-[#5b371f]">{item.value}</p>
                  <p className="text-xs text-[#754319]/60 font-medium">{item.hint}</p>
                </div>
                <div className="shrink-0 p-3 rounded-xl bg-white/80 shadow-sm border border-white/40 transition-transform">
                  <Icon className="h-5 w-5 text-[#754319]" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </section>

      {/* Recent Activity */}
      <section className="rounded-2xl border border-white/50 bg-white/70 shadow-lg backdrop-blur-sm p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-bold text-xl text-[#5b371f]">Recent Activity</h2>
            <p className="text-sm text-[#754319]/70 mt-1">{pendingRequests.length} pending • {todayActivity.length} today</p>
          </div>
          <Link href={`/merchant/${id}/transactions`} className="inline-flex items-center text-sm font-semibold text-[#754319] hover:text-[#5b371f] transition-colors">
            View All <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
        <div className="space-y-3">
          {recentTransactions.map((tx) => (
            <div key={tx.id} className="group flex items-center justify-between rounded-xl border border-white/70 bg-white/80 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#5b371f]">{tx.description}</p>
                <p className="text-xs text-[#754319]/70 mt-1">{tx.payerPhone || "Web checkout"} • {new Date(tx.timestamp).toLocaleDateString()}</p>
              </div>
              <div className="text-right flex items-center gap-4 ml-4">
                <div>
                  <p className="font-semibold text-[#5b371f]">{tx.amount.toFixed(2)} ETB</p>
                  <Badge
                    variant="outline"
                    className={`mt-1.5 text-xs capitalize font-medium ${
                      tx.status === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : ["pending", "awaiting_pin", "initiated", "processing"].includes(tx.status)
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {tx.status}
                  </Badge>
                </div>
                {tx.status !== "success" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 rounded-lg bg-amber-50 hover:bg-amber-100 text-[#754319] flex-shrink-0"
                    onClick={() => handleResendPush(tx.id)}
                    disabled={isResending === tx.id}
                    title="Re-send USSD Push"
                  >
                    {isResending === tx.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <SendHorizontal className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
          {transactions.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No transactions yet.</p>}
        </div>
      </section>

      <Sheet open={isMobile && isRequestPanelOpen} onOpenChange={setIsRequestPanelOpen}>
        <SheetContent
            side="bottom"
            className="max-h-[88vh] overflow-y-auto rounded-t-3xl border-0 bg-[linear-gradient(180deg,#fffaf0_0%,#fff5de_100%)] px-4 pb-8"
          >
          <div className="mx-auto mb-3 mt-1 h-1.5 w-14 rounded-full bg-[#754319]/25" />
          <SheetHeader className="text-left mb-4">
            <SheetTitle className="text-2xl text-[#5b371f]">Request payment</SheetTitle>
            <SheetDescription>
              {lastMode === "push"
                ? "Push a USSD PIN prompt to the customer instantly (mock)."
                : lastMode === "link"
                ? "Generate a secure payment link your customer can open on any channel."
                : "Choose how you want to receive payment from your customer."}
            </SheetDescription>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>

      <Dialog open={!isMobile && isRequestPanelOpen} onOpenChange={setIsRequestPanelOpen}>
        <DialogContent className="max-w-md border-0 bg-[linear-gradient(180deg,#fffaf0_0%,#fff5de_100%)] p-6 rounded-3xl shadow-2xl">
          <DialogHeader className="text-left mb-4">
            <DialogTitle className="text-2xl text-[#5b371f]">Request payment</DialogTitle>
            <DialogDescription>
              {lastMode === "push"
                ? "Push a USSD PIN prompt to the customer instantly (mock)."
                : lastMode === "link"
                ? "Generate a secure payment link your customer can open on any channel."
                : "Choose how you want to receive payment from your customer."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh]">
            {formContent}
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Modal (Link or Push) */}
      <Dialog open={isSuccessModalOpen} onOpenChange={setIsSuccessModalOpen}>
        <DialogContent className="max-w-md border-0 bg-white p-0 rounded-3xl overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-br from-[#f4db9f] via-[#f8b513] to-[#754319] p-8 text-[#3f210f] text-center">
            <div className="mx-auto w-16 h-16 bg-white/30 rounded-2xl backdrop-blur-md flex items-center justify-center mb-4 shadow-sm border border-white/40">
              <CheckCircle2 className="w-10 h-10 text-[#3f210f]" />
            </div>
            <h3 className="text-2xl font-black tracking-tight">
              {lastMode === "link" ? "Payment Link Ready" : "Payment Pushed!"}
            </h3>
            <p className="text-[#3f210f]/80 mt-1 text-sm font-bold uppercase tracking-wider">
              {lastMode === "link" 
                ? "Secure checkout link generated" 
                : `Sent to customer phone`}
            </p>
          </div>
          
          <div className="p-8 space-y-6">
            {lastMode === "link" ? (
              <>
                <div className="space-y-3">
                  <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Shareable Payment Link</Label>
                  <div className="relative group">
                    <Input 
                      readOnly
                      value={generatedResult?.paymentUrl || ""}
                      className="h-14 pr-24 rounded-2xl bg-slate-50 border-slate-200 font-mono text-sm focus-visible:ring-0 focus-visible:border-amber-500 transition-all"
                    />
                    <Button 
                      onClick={() => generatedResult?.paymentUrl && copyText(generatedResult.paymentUrl, "modalCopy")}
                      className="absolute right-1.5 top-1.5 h-11 rounded-xl bg-white border border-slate-200 text-[#754319] hover:bg-slate-50 shadow-sm transition-all"
                    >
                      {copied === "modalCopy" ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                          <CheckCircle2 className="w-4 h-4" /> Copied
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 font-semibold">
                          <Copy className="w-4 h-4" /> Copy
                        </span>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    onClick={handleShare}
                    className="h-14 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200 flex items-center justify-center gap-2 group transition-all"
                  >
                    <Share2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span className="font-bold">Share Link</span>
                  </Button>
                  <Button 
                    variant="outline"
                    asChild
                    className="h-14 rounded-2xl border-slate-200 hover:bg-slate-50 flex items-center justify-center gap-2 transition-all"
                  >
                    <Link href={generatedResult?.paymentUrl || "#"} target="_blank">
                      <ExternalLink className="w-5 h-5" />
                      <span className="font-bold">Open Link</span>
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Payment Amount</p>
                  <p className="text-4xl font-black text-[#5b371f]">{parseFloat(lastRequestDetails?.amount || "0").toFixed(2)} ETB</p>
                  <div className="flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm">
                    <Phone className="w-3 h-3 text-[#754319]" />
                    <span className="text-xs font-bold text-[#754319]">{lastRequestDetails?.phone}</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50/50 border border-amber-100">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                    </div>
                    <div className="text-xs text-amber-800">
                      <p className="font-bold">Awaiting Customer Action</p>
                      <p className="opacity-80">The customer has been prompted to enter their PIN to authorize this transaction.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
                {lastMode === "link" 
                  ? "This link will direct your customer to a secure checkout page." 
                  : "Status updates will appear in your recent activity log."}<br/>
                Payments are processed instantly upon successful authorization.
              </p>
            </div>
          </div>
          
          <div className="p-4 bg-slate-50 border-t flex justify-center">
            <Button 
              variant="ghost" 
              onClick={() => setIsSuccessModalOpen(false)}
              className="text-muted-foreground hover:text-slate-900 font-semibold"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
