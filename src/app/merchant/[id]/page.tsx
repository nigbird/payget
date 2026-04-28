"use client"

import { use, useEffect, useState, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import { 
  isSameDay, 
  isSameWeek, 
  isSameMonth, 
  isSameYear, 
  subDays, 
  subWeeks, 
  subMonths, 
  subYears,
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear
} from "date-fns"
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
  FileText,
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

  const [timeRange, setTimeRange] = useState<"today" | "week" | "month" | "year">("today")

  const stats = useMemo(() => {
    const now = new Date()
    const successfulTxs = transactions.filter(tx => tx.status === "success")

    const filterByRange = (date: Date, range: string, referenceDate: Date) => {
      switch (range) {
        case "today": return isSameDay(date, referenceDate)
        case "week": return isSameWeek(date, referenceDate, { weekStartsOn: 0 })
        case "month": return isSameMonth(date, referenceDate)
        case "year": return isSameYear(date, referenceDate)
        default: return false
      }
    }

    const getPreviousReferenceDate = (range: string, referenceDate: Date) => {
      switch (range) {
        case "today": return subDays(referenceDate, 1)
        case "week": return subWeeks(referenceDate, 1)
        case "month": return subMonths(referenceDate, 1)
        case "year": return subYears(referenceDate, 1)
        default: return referenceDate
      }
    }

    const currentTxs = successfulTxs.filter(tx => filterByRange(new Date(tx.timestamp), timeRange, now))
    const currentTotal = currentTxs.reduce((acc, tx) => acc + tx.amount, 0)

    const prevRef = getPreviousReferenceDate(timeRange, now)
    const prevTxs = successfulTxs.filter(tx => filterByRange(new Date(tx.timestamp), timeRange, prevRef))
    const prevTotal = prevTxs.reduce((acc, tx) => acc + tx.amount, 0)

    const trend = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal) * 100 : 0

    return {
      currentTotal,
      prevTotal,
      trend,
      count: currentTxs.length
    }
  }, [transactions, timeRange])

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
    if (isNaN(amountNum) || amountNum < 1) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount (minimum 1 ETB).",
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

    const trimmedPhone = phone.trim()
    const isValidEthiopianPhone = /^(?:\+251|251|09)\d{7,10}$/.test(trimmedPhone)
    if (!isValidEthiopianPhone) {
      toast({
        variant: "destructive",
        title: "Invalid Phone",
        description: "Please enter a valid Ethiopian phone number (e.g., 0912345678, +251..., or 251...).",
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
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-3 space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payment Method</Label>
              <RadioGroup
                defaultValue="BANK"
                value={requestForm.method}
                onValueChange={(val) => setRequestForm({ ...requestForm, method: val as "BANK" | "TELEBIRR" })}
                className="grid grid-cols-2 gap-2"
              >
                <div className="relative">
                  <RadioGroupItem
                    value="BANK"
                    id="bank"
                    className="peer sr-only"
                  />
                  <Label
                      htmlFor="bank"
                      className="flex flex-col items-center justify-center rounded-xl border-2 border-slate-100 bg-white p-2.5 hover:bg-slate-50 peer-data-[state=checked]:border-amber-600 [&:has([data-state=checked])]:border-amber-600 cursor-pointer transition-all min-h-[80px]"
                    >
                      <div className="w-10 h-10 flex items-center justify-center">
                        <img 
                          src="/niblogo.png" 
                          alt="Nib Bank" 
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <span className="mt-1 text-[10px] font-medium text-slate-700">Nib Bank</span>
                    </Label>
                  <div className="absolute top-1.5 right-1.5 peer-data-[state=checked]:opacity-100 opacity-0 transition-opacity">
                    <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" />
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
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-slate-100 bg-white p-2.5 hover:bg-slate-50 peer-data-[state=checked]:border-amber-600 [&:has([data-state=checked])]:border-amber-600 cursor-pointer opacity-70 transition-all min-h-[80px]"
                  >
                    <span className="flex items-center justify-center w-10 h-10 mb-1 rounded-lg bg-white border border-slate-200">
                      <img
                        src="/telebirr.png"
                        alt="Telebirr"
                        width={32}
                        height={32}
                        className="object-contain"
                      />
                    </span>
                    <span className="mt-1 text-[10px] font-medium text-slate-700">Telebirr</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer Phone</Label>
              <div className="relative group transition-all duration-200">
                <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0912345678"
                  className="h-10 rounded-lg border-slate-200 bg-white pl-9 text-sm focus-visible:ring-slate-200 focus-visible:border-slate-300 transition-all shadow-sm"
                  required
                  value={requestForm.payerPhone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d+]/g, '');
                    if (val.length <= 13) {
                      setRequestForm({ ...requestForm, payerPhone: val });
                    }
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount</Label>
              <div className="relative group transition-all duration-200">
                <Wallet className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
                <Input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-10 rounded-lg border-slate-200 bg-white pl-9 font-medium text-sm text-slate-800 focus-visible:ring-slate-200 focus-visible:border-slate-300 transition-all shadow-sm"
                  required
                  value={requestForm.amount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^([1-9]\d{0,5})(\.\d{0,2})?$/.test(val)) {
                      setRequestForm({ ...requestForm, amount: val });
                    }
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="description" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Description</Label>
                <span className="text-[9px] font-medium text-slate-400">{requestForm.description.length}/50</span>
              </div>
              <div className="relative group transition-all duration-200">
                <FileText className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
                <Textarea
                  id="description"
                  placeholder="Order #1022"
                  className="min-h-[60px] max-h-[100px] rounded-lg border-slate-200 bg-white pl-9 py-2 text-sm focus-visible:ring-slate-200 focus-visible:border-slate-300 transition-all resize-none shadow-sm"
                  value={requestForm.description}
                  onChange={(e) => {
                    if (e.target.value.length <= 50) {
                      setRequestForm({ ...requestForm, description: e.target.value });
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="shrink-0 p-5 border-t border-slate-50 bg-white rounded-b-2xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            type="button"
            onClick={() => handleRequestPayment("push")}
            className="h-10 rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] hover:saturate-110 text-xs font-bold text-white shadow-lg shadow-amber-900/20 transition-all"
            disabled={isSubmitting || !isApproved}
          >
            {isSubmitting && lastMode === "push" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Push Payment
          </Button>
          <Button
            type="button"
            onClick={() => handleRequestPayment("link")}
            className="h-10 rounded-xl bg-white border border-amber-200 text-amber-900 hover:bg-amber-50 text-xs font-bold shadow-sm transition-all"
            disabled={isSubmitting || !isApproved}
          >
            {isSubmitting && lastMode === "link" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate Link
          </Button>
        </div>
      </div>
    </div>
  )

  const recentTransactions = transactions.slice(0, 4)

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
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-700/70">Merchant Dashboard</p>
              <div className="mt-2 flex items-center gap-3">
                <h1 className="text-[1.75rem] leading-tight md:text-3xl font-bold text-[#5b371f]">
                  Welcome back, {merchant.name}
                </h1>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100/50">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Verified</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => copyText(merchant.accountNumber, "acc")}>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50/50 border border-amber-100/50 transition-all hover:bg-amber-100/50 hover:border-amber-200/50">
                <Wallet className="w-3.5 h-3.5 text-amber-700" />
                <span className="text-xs font-bold text-amber-900/80 font-mono tracking-wider">{merchant.accountNumber}</span>
                {copied === "acc" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-600 transition-colors" />
                )}
              </div>
              <span className="text-[10px] font-bold text-amber-700/40 uppercase tracking-tight group-hover:text-amber-700/60 transition-colors">Settlement Account</span>
            </div>
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

      <section className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex p-1 bg-amber-50/50 border border-amber-100/50 rounded-xl">
            {(["today", "week", "month", "year"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  timeRange === range
                    ? "bg-white text-amber-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Revenue Card */}
          <Card className="card-honey-glass overflow-hidden rounded-3xl border-amber-200/20 bg-white/80 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:bg-white/90">
            <CardContent className="p-6">
              <div className="flex flex-col">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-800/60 mb-1">Revenue</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-[#5b371f]">
                    {stats.currentTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-sm font-bold text-amber-800/40">ETB</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sales Overview Card */}
          <Card className="card-honey-glass overflow-hidden rounded-3xl border-amber-200/20 bg-white/80 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:bg-white/90">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-800/60 mb-1">Sales Overview</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-[#5b371f]">
                      {stats.currentTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-sm font-bold text-amber-800/40">ETB</span>
                  </div>
                </div>
                {stats.trend !== 0 && (
                  <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    stats.trend > 0 
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                      : "bg-rose-50 text-rose-600 border border-rose-100"
                  }`}>
                    {stats.trend > 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingUp className="w-3 h-3 rotate-180" />
                    )}
                    {Math.abs(stats.trend).toFixed(1)}%
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4">
        <Card className="rounded-3xl border-amber-200/30 bg-white/80 shadow-xl backdrop-blur-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h2 className="font-semibold text-[#5b371f] text-lg">Recent Activity</h2>
                <p className="text-xs text-amber-800/60 leading-5">
                  {stats.count} successful payments {timeRange === 'today' ? 'today' : `this ${timeRange}`}
                </p>
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
            className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-0 bg-white px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
          >
          <div className="mx-auto mb-1 mt-1 h-1 w-10 shrink-0 rounded-full bg-[#754319]/25" />
          <SheetHeader className="text-left mb-3">
            <SheetTitle className="text-xl text-[#5b371f]">Request payment</SheetTitle>
            <SheetDescription className="text-xs">
              {lastMode === "push"
                ? "Push a USSD PIN prompt instantly"
                : lastMode === "link"
                ? "Generate a secure link to share"
                : "Choose payment method and details"}
            </SheetDescription>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>

      <Dialog open={!isMobile && isRequestPanelOpen} onOpenChange={setIsRequestPanelOpen}>
        <DialogContent className="max-w-sm border border-slate-100 bg-white p-0 rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader className="text-center p-5 border-b border-slate-50 shrink-0">
            <div className="mx-auto w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center mb-2">
              <Wallet className="w-5 h-5 text-slate-600" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-800 leading-none">Request payment</DialogTitle>
            <DialogDescription className="text-slate-500 text-[11px] mt-1.5">
              {lastMode === "push"
                ? "USSD PIN prompt will be sent instantly"
                : lastMode === "link"
                ? "Generate a secure link to share"
                : "Choose payment method and details"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            {formContent}
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Modal (Link or Push) */}
      <Dialog open={isSuccessModalOpen} onOpenChange={(open) => {
        setIsSuccessModalOpen(open)
        if (!open) setCurrentTxStatus(null)
      }}>
        <DialogContent className="max-w-sm border border-slate-100 bg-white p-0 rounded-2xl shadow-sm overflow-hidden max-h-[90vh]">
          <div className="p-5 text-center border-b border-slate-50">
            {lastMode === "link" ? (
              <>
                <div className="mx-auto w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight leading-none">Payment Link Ready</h3>
                <p className="text-slate-500 mt-1.5 text-[11px]">Secure checkout link generated</p>
              </>
            ) : currentTxStatus === "success" ? (
              <>
                <div className="mx-auto w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-emerald-800 tracking-tight leading-none">Payment Successful</h3>
                <p className="text-slate-500 mt-1.5 text-[11px]">Transaction completed successfully</p>
              </>
            ) : currentTxStatus === "failed" ? (
              <>
                <div className="mx-auto w-10 h-10 bg-rose-50 rounded-full flex items-center justify-center mb-3">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                </div>
                <h3 className="text-lg font-bold text-rose-800 tracking-tight leading-none">Payment Failed</h3>
                <p className="text-slate-500 mt-1.5 text-[11px]">Transaction could not be completed</p>
              </>
            ) : (
              <>
                <div className="mx-auto w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center mb-3">
                  <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight leading-none">Processing Payment</h3>
                <p className="text-slate-500 mt-1.5 text-[11px]">Sent to customer phone</p>
              </>
            )}
          </div>
          
          <div className="p-5 space-y-4 bg-slate-50/50 overflow-y-auto">
            {lastMode === "link" ? (
              <>
                <div className="space-y-2">
                  <Label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Shareable Payment Link</Label>
                  <div className="relative group">
                    <Input 
                      readOnly
                      value={generatedResult?.paymentUrl || ""}
                      className="h-10 pr-20 rounded-xl bg-white border-slate-200 font-mono text-[10px] text-slate-600 focus-visible:ring-0 shadow-sm"
                    />
                    <Button 
                      onClick={() => generatedResult?.paymentUrl && copyText(generatedResult.paymentUrl, "modalCopy")}
                      className="absolute right-1 top-1 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm transition-all px-2"
                    >
                      {copied === "modalCopy" ? (
                        <span className="flex items-center gap-1 text-emerald-600 font-bold text-[10px]">
                          <CheckCircle2 className="w-3 h-3" /> Copied
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-bold text-[10px]">
                          <Copy className="w-3 h-3" /> Copy
                        </span>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button 
                    onClick={handleShare}
                    className="h-10 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center justify-center gap-2 transition-all text-xs font-bold"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share Link
                  </Button>
                  <Button 
                    variant="outline"
                    asChild
                    className="h-10 rounded-xl border-amber-200 bg-white hover:bg-amber-50 flex items-center justify-center gap-2 shadow-sm transition-all text-amber-900 text-xs font-bold"
                  >
                    <Link href={generatedResult?.paymentUrl || "#"} target="_blank">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Link
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className={`flex flex-col items-center justify-center gap-1.5 p-5 rounded-xl border shadow-sm ${
                  currentTxStatus === 'success' ? 'bg-emerald-50/50 border-emerald-100' : 
                  currentTxStatus === 'failed' ? 'bg-rose-50/50 border-rose-100' : 
                  'bg-white border-slate-200'
                }`}>
                  <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Payment Amount</p>
                  <p className={`text-2xl font-bold ${
                    currentTxStatus === 'success' ? 'text-emerald-700' : 
                    currentTxStatus === 'failed' ? 'text-rose-700' : 
                    'text-slate-800'
                  }`}>{parseFloat(lastRequestDetails?.amount || "0").toFixed(2)} ETB</p>
                  <div className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-100">
                    <Phone className="w-2.5 h-2.5 text-slate-500" />
                    <span className="text-[10px] font-bold text-slate-600">{lastRequestDetails?.phone}</span>
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
                    className="button-honey-solid w-full h-10 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all text-xs font-bold"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Resend Push Notification
                  </Button>
                )}

                {currentTxStatus !== 'success' && currentTxStatus !== 'failed' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-100/50 border border-slate-200">
                      <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <Clock className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                      </div>
                      <div className="text-[10px] text-slate-700">
                        <p className="font-bold text-slate-900 leading-tight">Waiting for confirmation</p>
                        <p className="text-slate-500 mt-0.5 leading-tight">Ask customer to authorize on phone.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-1">
              <p className="text-[9px] text-center text-slate-400 leading-relaxed">
                {lastMode === "link" 
                  ? "Link directs customer to a secure checkout." 
                  : currentTxStatus === 'success' 
                    ? "Funds added to your merchant balance." 
                    : "Status updates in recent activity log."}<br/>
                Processed instantly upon authorization.
              </p>
            </div>
          </div>
          
          <div className="p-3 bg-white border-t border-slate-100 flex justify-center">
            <Button 
              variant="ghost" 
              onClick={() => {
                setIsSuccessModalOpen(false)
                setCurrentTxStatus(null)
              }}
              className="text-slate-500 hover:text-slate-900 hover:bg-slate-50 font-bold text-xs h-8"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
