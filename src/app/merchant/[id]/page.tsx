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
  CircleDollarSign,
  Plus,
  ShieldCheck,
  AlertCircle,
  Phone,
  UserRound,
  Sparkles,
  Copy,
  CheckCircle2,
  ArrowUpRight,
  ChevronRight,
  Loader2,
  ArrowRightLeft,
  Zap,
  ShieldAlert,
  Info,
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [lastMode, setLastMode] = useState<"push" | "link" | null>(null)
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
      setIsRequestPanelOpen(true)

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

  const isPending = merchant.status === "pending"
  const isApproved = merchant.status === "approved"

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

              {generatedResult && (
                <div className="rounded-2xl border border-white/70 bg-white/80 p-3 space-y-2 shadow-sm">
                  <p className="text-xs uppercase tracking-wider text-[#754319]/70">
                    {lastMode === "push" ? "Customer PIN Prompt (Demo)" : "Secure Payment Link"}
                  </p>

                  {generatedResult.paymentUrl ? (
                    <div className="space-y-1">
                      <p className="text-xs text-[#754319]/70">Shareable URL</p>
                      <code className="block break-all rounded-xl bg-white/70 border border-white/60 p-2 text-sm font-mono text-[#5b371f]">
                        {generatedResult.paymentUrl}
                      </code>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-[#754319]/70">Customer token (demo)</p>
                      <code className="block break-all rounded-xl bg-white/70 border border-white/60 p-2 text-sm font-mono text-[#5b371f]">
                        {generatedResult.customerPinToken}
                      </code>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {generatedResult.paymentUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 px-3 rounded-2xl bg-white/70 hover:bg-white/90 text-[#754319] border border-white/60"
                        onClick={() => generatedResult.paymentUrl && copyText(generatedResult.paymentUrl, "paymentUrl")}
                      >
                        {copied === "paymentUrl" ? (
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                        ) : (
                          <Copy className="mr-1 h-4 w-4" />
                        )}
                        {copied === "paymentUrl" ? "Copied" : "Copy URL"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 px-3 rounded-2xl bg-white/70 hover:bg-white/90 text-[#754319] border border-white/60"
                        onClick={() =>
                          generatedResult.customerPinToken && copyText(generatedResult.customerPinToken, "customerPinToken")
                        }
                      >
                        {copied === "customerPinToken" ? (
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                        ) : (
                          <Copy className="mr-1 h-4 w-4" />
                        )}
                        {copied === "customerPinToken" ? "Copied" : "Copy Token"}
                      </Button>
                    )}

                    {generatedResult.transactionReference && (
                      <Badge className="rounded-full bg-amber-100 text-amber-700 border-0">
                        Ref: {generatedResult.transactionReference}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
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
      value: `$${(totalReceived * 0.98).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      hint: "Net of fees",
      icon: Wallet,
    },
    {
      title: "Volume",
      value: `$${totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      hint: `${transactions.filter((tx) => tx.status === "success").length} successful`,
      icon: TrendingUp,
    },
    {
      title: "Limits",
      value: `$${merchant.dailyLimit.toLocaleString()}`,
      hint: "Daily processing cap",
      icon: CircleDollarSign,
    },
    {
      title: "Account Status",
      value: merchant.status === "approved" ? "Verified" : "Reviewing",
      hint: merchant.businessType || "Merchant",
      icon: ShieldCheck,
    },
  ]

  const copyText = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1400)
    toast({ title: "Copied", description: "Value copied to clipboard." })
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-white/40 bg-white/65 p-5 md:p-7 shadow-xl backdrop-blur-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Merchant Dashboard</p>
            <h1 className="mt-2 text-2xl md:text-3xl font-bold text-[#5b371f]">Welcome back, {merchant.name}</h1>
            <p className="mt-1 text-sm md:text-base text-[#754319]/70">A premium view of your requests, activity, and settlements.</p>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Button
              disabled={!isApproved}
              className="h-11 rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-700/30 hover:-translate-y-0.5 transition-all"
              onClick={() => setIsRequestPanelOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Request Payment
            </Button>
          </div>
        </div>
      </section>

      {!isApproved && (
        <Card className={`mt-4 rounded-3xl border ${isPending ? "border-amber-200 bg-amber-50/90" : "border-rose-200 bg-rose-50/90"}`}>
          <CardContent className="relative p-4">
                    <div className="relative flex items-start justify-between">
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

      <section className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
        {metricCards.filter(m => m.title !== "Limits" && m.title !== "Account Status").map((item) => {
          const Icon = item.icon
          return (
            <Card
                    key={item.title}
                    className="overflow-hidden rounded-3xl border-white/60 shadow-md backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-gradient-to-br from-[#fff9ef] to-[#fdf1d4]"
                  >
              <CardContent className="relative p-5 h-full flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#754319]/70">{item.title}</p>
                  <p className="mt-1 text-2xl font-black text-[#5b371f]">{item.value}</p>
                  <p className="mt-0.5 text-[10px] text-[#754319]/60 font-semibold">{item.hint}</p>
                </div>
                <div className="shrink-0 p-2.5 rounded-2xl bg-white/90 shadow-sm border border-white/40 group-hover:scale-110 transition-transform">
                  <Icon className="h-4 w-4 text-[#754319]" />
                </div>
              </CardContent>
            </Card>
          )
        })}
        
        <Card
          className="xl:col-span-2 overflow-hidden rounded-[2.5rem] border-white/60 bg-[#fdf2d5] shadow-md transition-all duration-500 group relative"
        >
          <CardContent className="relative p-3 h-full flex items-center">
            <div className="flex-1 grid grid-cols-3 gap-2">
              <div className="relative flex flex-col items-center p-2.5 rounded-3xl bg-white/40 border border-white/30 backdrop-blur-sm transition-all hover:bg-white/60">
                <Zap className="h-3.5 w-3.5 text-[#754319]/80 mb-1" />
                <p className="text-[8px] uppercase tracking-wider font-bold text-[#754319]/70">Max Tx</p>
                <p className="text-sm font-black text-[#5b371f]">${merchant.transactionLimit.toLocaleString()}</p>
              </div>

              <div className="relative flex flex-col items-center p-2.5 rounded-3xl bg-white/40 border border-white/30 backdrop-blur-sm transition-all hover:bg-white/60">
                <ArrowRightLeft className="h-3.5 w-3.5 text-[#754319]/80 mb-1" />
                <p className="text-[8px] uppercase tracking-wider font-bold text-[#754319]/70">Daily Cnt</p>
                <p className="text-sm font-black text-[#5b371f]">{merchant.dailyCountLimit.toLocaleString()}</p>
              </div>

              <div className="relative flex flex-col items-center p-2.5 rounded-3xl bg-white/60 border border-white/40 backdrop-blur-md transition-all hover:bg-white/80 shadow-sm">
                <CircleDollarSign className="h-3.5 w-3.5 text-[#754319] mb-1" />
                <p className="text-[8px] uppercase tracking-wider font-bold text-[#754319]/80">Daily Max</p>
                <p className="text-sm font-black text-[#5b371f]">${merchant.dailyLimit.toLocaleString()}</p>
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-center pl-4 border-l border-[#754319]/10 ml-2">
              <div className="flex items-center gap-1 text-[#754319]/70">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest">Verified</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 rounded-3xl border-white/60 bg-white/65 shadow-md backdrop-blur-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#5b371f] text-lg">Recent Activity</h2>
                <p className="text-xs text-[#754319]/70">{pendingRequests.length} pending requests, {todayActivity.length} today</p>
              </div>
              <Link href={`/merchant/${id}/transactions`} className="inline-flex items-center text-sm font-medium text-[#754319]">
                View All Transactions <ArrowUpRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-2">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="group flex items-center justify-between rounded-2xl border border-white/70 bg-white/80 p-3 transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <div>
                    <p className="text-sm font-medium text-[#5b371f]">{tx.description}</p>
                    <p className="text-xs text-[#754319]/70">{tx.payerPhone || "Web checkout"} • {new Date(tx.timestamp).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[#5b371f]">${tx.amount.toFixed(2)}</p>
                    <Badge
                      variant="outline"
                      className={`mt-1 text-[10px] capitalize ${
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
                </div>
              ))}
              {transactions.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-white/60 bg-white/65 shadow-md backdrop-blur-sm">
          <CardContent className="p-5">
            <h2 className="font-semibold text-[#5b371f] text-lg">Integration</h2>
            <p className="mt-1 text-xs text-[#754319]/70">Copy your credentials for webhooks and API setup.</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/70 bg-white/80 p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#754319]/70">Merchant ID</p>
                <p className="truncate font-mono text-sm text-[#5b371f]">{merchant.id}</p>
                <Button type="button" variant="ghost" className="mt-2 h-8 px-2 text-xs text-[#754319]" onClick={() => copyText(merchant.id, "id")}>
                  {copied === "id" ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                  {copied === "id" ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#754319]/70">Callback URL</p>
                <p className="truncate font-mono text-sm text-[#5b371f]">{merchant.callbackUrl}</p>
                <Button type="button" variant="ghost" className="mt-2 h-8 px-2 text-xs text-[#754319]" onClick={() => copyText(merchant.callbackUrl, "callback")}>
                  {copied === "callback" ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                  {copied === "callback" ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <Link href="/" className="mt-4 inline-flex items-center text-xs font-medium text-[#754319]">
              Back to overview <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
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
    </div>
  )
}
