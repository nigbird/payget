"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import nibLogo from "@/app/admin/logo/niblogo.png"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
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
  const [currentTxStatus, setCurrentTxStatus] = useState<TransactionStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
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
    method: "BANK" as "BANK" | "TELEBIRR",
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

  const handleRequestPayment = async (mode: "push" | "link", retryData?: { amount: string; phone: string }) => {
    const amount = retryData?.amount || requestForm.amount
    const phone = retryData?.phone || requestForm.payerPhone
    
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0.",
      })
      return
    }

    if (!phone.trim()) {
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
          phone: phone,
          authToken,
        },
        amount: amountNum,
        serviceDescription,
        timestamp,
        method: requestForm.method,
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
        
        // Start polling for this specific transaction status
        if (transactionReference) {
          setCurrentTxStatus("initiated")
          const pollInterval = setInterval(async () => {
            try {
              const res = await fetch(`/api/merchants/${id}/transactions/${transactionReference}`)
              if (res.ok) {
                const tx = await res.json()
                if (tx.status === "success" || tx.status === "failed") {
                  setCurrentTxStatus(tx.status)
                  clearInterval(pollInterval)
                }
              }
            } catch (err) {
              console.error("Polling current transaction error:", err)
            }
          }, 2000)
          
          // Stop polling if modal is closed
          setTimeout(() => {
            if (!isSuccessModalOpen) clearInterval(pollInterval)
          }, 120000) // 2 minute timeout for polling
        }
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
        amount: amount,
        phone: phone
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



  const isPending = merchant.status === "pending" || merchant.status === "branch_approved"
  const isApproved = merchant.status === "approved" || merchant.status === "active"

  const formContent = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full px-6">
          <div className="space-y-6 pb-6 pt-2">
            <div className="space-y-4">
              <div className="space-y-3">
                <Label className="text-xs font-medium text-slate-500">Payment Method</Label>
                <RadioGroup
                  defaultValue="BANK"
                  value={requestForm.method}
                  onValueChange={(val) => setRequestForm({ ...requestForm, method: val as "BANK" | "TELEBIRR" })}
                  className="grid grid-cols-2 gap-3"
                >
                  <div className="relative">
                    <RadioGroupItem
                      value="BANK"
                      id="bank"
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor="bank"
                      className="flex flex-col items-center justify-center rounded-xl border-2 border-slate-100 bg-white p-4 hover:bg-slate-50 peer-data-[state=checked]:border-amber-600 [&:has([data-state=checked])]:border-amber-600 cursor-pointer transition-all min-h-[104px]"
                    >
                      <span className="flex items-center justify-center w-12 h-12 mb-1 rounded-lg bg-white">
                        <img
                          src={nibLogo.src}
                          alt="Nib Bank"
                          width={40}
                          height={40}
                          className="object-contain"
                        />
                      </span>
                      <span className="mt-1 text-xs font-medium text-slate-700">Nib Bank</span>
                    </Label>
                    <div className="absolute top-2 right-2 peer-data-[state=checked]:opacity-100 opacity-0 transition-opacity">
                      <CheckCircle2 className="h-4 w-4 text-amber-600" />
                    </div>
                  </div>
                  <div className="relative">
                    <RadioGroupItem
                      value="TELEBIRR"
                      id="telebirr"
                      className="peer sr-only"
                      disabled
                    />
                    <Label
                      htmlFor="telebirr"
                      className="flex flex-col items-center justify-center rounded-xl border-2 border-slate-100 bg-white p-4 hover:bg-slate-50 peer-data-[state=checked]:border-amber-600 [&:has([data-state=checked])]:border-amber-600 cursor-pointer opacity-70 transition-all min-h-[104px]"
                    >
                      <span className="flex items-center justify-center w-12 h-12 mb-1 rounded-lg bg-white border border-slate-200">
                        <img
                          src="/telebirr.png"
                          alt="Telebirr"
                          width={40}
                          height={40}
                          className="object-contain"
                        />
                      </span>
                      <span className="mt-1 text-xs font-medium text-slate-700">Telebirr</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-medium text-slate-500">Customer Phone</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="0912345678"
                    className="h-11 rounded-xl border-slate-200 bg-white pl-10 shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300"
                    required
                    value={requestForm.payerPhone}
                    onChange={(e) => setRequestForm({ ...requestForm, payerPhone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-xs font-medium text-slate-500">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="h-14 rounded-xl border border-slate-200 bg-white text-center text-2xl font-medium text-slate-800 shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300"
                  required
                  value={requestForm.amount}
                  onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-medium text-slate-500">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Order #1022"
                  className="min-h-[100px] rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300 resize-none"
                  value={requestForm.description}
                  onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                <Button
                  type="button"
                  onClick={() => handleRequestPayment("push")}
                  className="h-11 rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] hover:saturate-110 text-sm font-bold text-white shadow-lg shadow-amber-900/20 transition-all"
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
                  className="h-11 rounded-xl bg-white border border-amber-200 text-amber-900 hover:bg-amber-50 text-sm font-bold shadow-sm transition-all"
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
  const successfulToday = transactions.filter((tx) => {
    const txDate = new Date(tx.timestamp)
    const now = new Date()
    return tx.status === "success" && txDate.toDateString() === now.toDateString()
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
    <div className="space-y-4 pb-24 md:pb-4">
      <section className="rounded-3xl border border-amber-200/30 bg-white/80 p-4 sm:p-5 md:p-7 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-700/70">Merchant Dashboard</p>
            <h1 className="mt-2 text-[1.75rem] leading-tight md:text-3xl font-bold text-[#5b371f]">Welcome back, {merchant.name}</h1>
            <p className="mt-2 text-sm leading-6 md:text-base text-amber-800/60">A premium view of your requests, activity, and settlements.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              disabled={!isApproved}
              className="h-10 md:h-11 min-h-[40px] md:min-h-11 rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-900/30 hover:-translate-y-0.5 transition-all px-4 md:px-6"
              onClick={() => setIsRequestPanelOpen(true)}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              <span className="text-sm font-bold">Push Payment</span>
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

      <section className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
        {metricCards.map((item) => {
          const Icon = item.icon
          return (
            <Card
              key={item.title}
              className="card-honey-glass overflow-hidden rounded-3xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
            >
              <CardContent className="relative p-4 sm:p-5 h-full flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-800/70">{item.title}</p>
                  <p className="mt-1 break-words text-[1.75rem] leading-tight font-black text-[#5b371f]">{item.value}</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900/60 font-semibold">{item.hint}</p>
                </div>
                <div className="shrink-0 p-3 rounded-2xl bg-gradient-to-br from-amber-100/80 to-amber-200/60 shadow-sm border border-amber-300/30 group-hover:scale-110 transition-transform">
                  <Icon className="h-5 w-5 text-amber-700" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-3 rounded-3xl border-amber-200/30 bg-white/80 shadow-xl backdrop-blur-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-[#5b371f] text-lg">Recent Activity</h2>
                <p className="text-xs text-amber-800/60 leading-5">{successfulToday.length} successful payments today</p>
              </div>
              <Link href={`/merchant/${id}/transactions`} className="inline-flex min-h-11 items-center text-sm font-medium text-amber-700">
                View All Transactions <ArrowUpRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-2">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="group flex flex-col gap-3 rounded-2xl border border-amber-200/30 bg-gradient-to-r from-amber-50/50 to-white/50 p-3 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-200/20 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#5b371f] break-words">{tx.description}</p>
                    <p className="text-xs leading-5 text-amber-800/60 break-words">{tx.payerPhone || "Web checkout"} • {new Date(tx.timestamp).toLocaleDateString()}</p>
                  </div>
                  <div className="text-left sm:text-right flex items-center gap-3">
                    <div>
                      <p className="font-semibold text-[#5b371f]">{tx.amount.toFixed(2)} ETB</p>
                      <Badge
                        variant="outline"
                        className={`mt-1 text-[10px] capitalize ${
                          tx.status === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                        }`}
                      >
                        {tx.status === "success" ? "Success" : "Failed"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
            </div>
          </CardContent>
        </Card>

      </section>

      <Sheet open={isMobile && isRequestPanelOpen} onOpenChange={setIsRequestPanelOpen}>
        <SheetContent
            side="bottom"
            className="max-h-[90vh] overflow-y-auto rounded-t-3xl border-0 bg-white px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
          >
          <div className="mx-auto mb-3 mt-1 h-1.5 w-14 rounded-full bg-[#754319]/25" />
          <SheetHeader className="text-left mb-4">
            <SheetTitle className="text-2xl text-[#5b371f]">Request payment</SheetTitle>
            <SheetDescription>
              {lastMode === "push"
                ? "Push a USSD PIN prompt to the customer instantly"
                : lastMode === "link"
                ? "Generate a secure payment link your customer can open on any channel."
                : "Choose how you want to receive payment from your customer."}
            </SheetDescription>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>

      <Dialog open={!isMobile && isRequestPanelOpen} onOpenChange={setIsRequestPanelOpen}>
        <DialogContent className="max-w-md border border-slate-100 bg-white p-0 rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader className="text-center p-6 border-b border-slate-50 shrink-0">
            <div className="mx-auto w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
              <Wallet className="w-6 h-6 text-slate-600" />
            </div>
            <DialogTitle className="text-xl font-medium text-slate-800">Request payment</DialogTitle>
            <DialogDescription className="text-slate-500">
              {lastMode === "push"
                ? "Push a USSD PIN prompt to the customer instantly."
                : lastMode === "link"
                ? "Generate a secure payment link your customer can open on any channel."
                : "Choose how you want to receive payment from your customer."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            {formContent}
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Modal (Link or Push) */}
      <Dialog open={isSuccessModalOpen} onOpenChange={(open) => {
        setIsSuccessModalOpen(open)
        if (!open) setCurrentTxStatus(null)
      }}>
        <DialogContent className="max-w-md border border-slate-100 bg-white p-0 rounded-2xl shadow-sm overflow-hidden max-h-[90vh]">
          <div className="p-6 text-center border-b border-slate-50">
            {lastMode === "link" ? (
              <>
                <div className="mx-auto w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-xl font-medium text-slate-800 tracking-tight">Payment Link Ready</h3>
                <p className="text-slate-500 mt-1 text-sm">Secure checkout link generated</p>
              </>
            ) : currentTxStatus === "success" ? (
              <>
                <div className="mx-auto w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-xl font-medium text-emerald-800 tracking-tight">Payment Successful</h3>
                <p className="text-slate-500 mt-1 text-sm">Transaction completed successfully</p>
              </>
            ) : currentTxStatus === "failed" ? (
              <>
                <div className="mx-auto w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mb-4">
                  <ShieldAlert className="w-6 h-6 text-rose-600" />
                </div>
                <h3 className="text-xl font-medium text-rose-800 tracking-tight">Payment Failed</h3>
                <p className="text-slate-500 mt-1 text-sm">Transaction could not be completed</p>
              </>
            ) : (
              <>
                <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mb-4">
                  <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                </div>
                <h3 className="text-xl font-medium text-slate-800 tracking-tight">Processing Payment</h3>
                <p className="text-slate-500 mt-1 text-sm">Sent to customer phone</p>
              </>
            )}
          </div>
          
          <div className="p-4 sm:p-6 space-y-6 bg-slate-50/50 overflow-y-auto">
            {lastMode === "link" ? (
              <>
                <div className="space-y-3">
                  <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Shareable Payment Link</Label>
                  <div className="relative group">
                    <Input 
                      readOnly
                      value={generatedResult?.paymentUrl || ""}
                      className="h-12 pr-24 rounded-xl bg-white border-slate-200 font-mono text-xs text-slate-600 focus-visible:ring-0 shadow-sm"
                    />
                    <Button 
                      onClick={() => generatedResult?.paymentUrl && copyText(generatedResult.paymentUrl, "modalCopy")}
                      className="absolute right-1 top-1 h-10 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm transition-all"
                    >
                      {copied === "modalCopy" ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 font-medium text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Copied
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 font-medium text-xs">
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </span>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button 
                    onClick={handleShare}
                    className="h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="font-medium text-sm">Share Link</span>
                  </Button>
                  <Button 
                    variant="outline"
                    asChild
                    className="h-11 rounded-xl border-amber-200 bg-white hover:bg-amber-50 flex items-center justify-center gap-2 shadow-sm transition-all text-amber-900"
                  >
                    <Link href={generatedResult?.paymentUrl || "#"} target="_blank">
                      <ExternalLink className="w-4 h-4" />
                      <span className="font-medium text-sm">Open Link</span>
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <div className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border shadow-sm ${
                  currentTxStatus === 'success' ? 'bg-emerald-50/50 border-emerald-100' : 
                  currentTxStatus === 'failed' ? 'bg-rose-50/50 border-rose-100' : 
                  'bg-white border-slate-200'
                }`}>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Payment Amount</p>
                  <p className={`text-3xl font-medium ${
                    currentTxStatus === 'success' ? 'text-emerald-700' : 
                    currentTxStatus === 'failed' ? 'text-rose-700' : 
                    'text-slate-800'
                  }`}>{parseFloat(lastRequestDetails?.amount || "0").toFixed(2)} ETB</p>
                  <div className="flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
                    <Phone className="w-3 h-3 text-slate-500" />
                    <span className="text-xs font-medium text-slate-600">{lastRequestDetails?.phone}</span>
                  </div>
                </div>
                
                {currentTxStatus === 'failed' && (
                  <Button 
                    onClick={() => {
                      setIsSuccessModalOpen(false)
                      handleRequestPayment("push", {
                        amount: lastRequestDetails?.amount || "",
                        phone: lastRequestDetails?.phone || ""
                      })
                    }}
                    className="button-honey-solid w-full h-12 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="font-medium">Resend Push Notification</span>
                  </Button>
                )}

                {currentTxStatus !== 'success' && currentTxStatus !== 'failed' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-100/50 border border-slate-200">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4 text-blue-600 animate-pulse" />
                      </div>
                      <div className="text-xs text-slate-700">
                        <p className="font-medium text-slate-900">Waiting for confirmation</p>
                        <p className="text-slate-500 mt-0.5">Please ask the customer to authorize the payment on their phone.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2">
              <p className="text-[10px] text-center text-slate-500 leading-relaxed">
                {lastMode === "link" 
                  ? "This link will direct your customer to a secure checkout page." 
                  : currentTxStatus === 'success' 
                    ? "Funds have been added to your merchant balance." 
                    : "Status updates will appear in your recent activity log."}<br/>
                Payments are processed instantly upon successful authorization.
              </p>
            </div>
          </div>
          
          <div className="p-4 bg-white border-t border-slate-100 flex justify-center">
            <Button 
              variant="ghost" 
              onClick={() => {
                setIsSuccessModalOpen(false)
                setCurrentTxStatus(null)
              }}
              className="text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-medium"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
