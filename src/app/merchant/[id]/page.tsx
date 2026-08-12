"use client"

import { use, useEffect, useState, useMemo, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import Image from "next/image"
import type { TransactionStatus } from "@/lib/db"

const nonTerminalStatuses: TransactionStatus[] = ["pending", "initiated", "awaiting_pin", "processing"]

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
  endOfWeek,
  startOfMonth,
  startOfYear,
  format
} from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
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
  Landmark,
  Minus,
  X,
} from "lucide-react"

type CatalogItem = { id: string; name: string; price: number; categoryId: string | null }
type CartLine = { itemId: string; name: string; price: number; qty: number }
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"

export default function MerchantDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const [merchant, setMerchant] = useState<any>(null)
  const [subsidiaryAccountNumber, setSubsidiaryAccountNumber] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isRequestPanelOpen, setIsRequestPanelOpen] = useState(false)
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false)
  const [currentTxStatus, setCurrentTxStatus] = useState<TransactionStatus | null>(null)
  type PaymentFlowPhase = "idle" | "push_submitting" | "awaiting_pin" | "link_submitting"
  const [paymentFlowPhase, setPaymentFlowPhase] = useState<PaymentFlowPhase>("idle")
  const pushPollRef = useRef<{
    intervalId?: ReturnType<typeof setInterval>
    timeoutId?: ReturnType<typeof setTimeout>
    transactionReference?: string
  }>({})
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

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [showItemPicker, setShowItemPicker] = useState(false)
  const [itemSearch, setItemSearch] = useState("")
  const [itemPickerStyle, setItemPickerStyle] = useState<React.CSSProperties | null>(null)
  const itemFieldRef = useRef<HTMLDivElement>(null)
  const itemSearchInputRef = useRef<HTMLInputElement>(null)
  const itemPickerDropdownRef = useRef<HTMLDivElement>(null)

  const updateItemPickerPosition = useCallback(() => {
    const el = itemFieldRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openAbove = spaceBelow < 220 && rect.top > 220
    setItemPickerStyle(
      openAbove
        ? {
            position: "fixed",
            bottom: window.innerHeight - rect.top + 4,
            left: rect.left,
            width: rect.width,
            zIndex: 50,
            pointerEvents: "auto",
          }
        : {
            position: "fixed",
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            zIndex: 50,
            pointerEvents: "auto",
          }
    )
  }, [])

  useEffect(() => {
    if (!showItemPicker) return
    updateItemPickerPosition()
    window.addEventListener("resize", updateItemPickerPosition)
    window.addEventListener("scroll", updateItemPickerPosition, true)
    return () => {
      window.removeEventListener("resize", updateItemPickerPosition)
      window.removeEventListener("scroll", updateItemPickerPosition, true)
    }
  }, [showItemPicker, updateItemPickerPosition])

  useEffect(() => {
    if (!showItemPicker) return
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (itemFieldRef.current?.contains(target)) return
      if (itemPickerDropdownRef.current?.contains(target)) return
      setShowItemPicker(false)
    }
    document.addEventListener("mousedown", onDocMouseDown)
    return () => document.removeEventListener("mousedown", onDocMouseDown)
  }, [showItemPicker])

  useEffect(() => {
    if (!isRequestPanelOpen) return
    let cancelled = false
    fetch(`/api/merchants/${id}/items`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const items: CatalogItem[] = (data.items ?? [])
          .filter((i: any) => i.isActive)
          .map((i: any) => ({ id: i.id, name: i.name, price: i.price, categoryId: i.categoryId }))
        setCatalogItems(items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isRequestPanelOpen, id])

  const filteredCatalogItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return catalogItems
    return catalogItems.filter((i) => i.name.toLowerCase().includes(q))
  }, [catalogItems, itemSearch])

  /**
   * Description sent to the provider is always a plain, capped string composed from the
   * cart plus whatever free text is typed after it — the pill/search UI is presentational
   * only and never changes the shape of this value.
   */
  const composeDescription = (nextCart: CartLine[], note: string) => {
    const itemsText = nextCart.map((line) => `${line.name} x${line.qty}`).join(", ")
    return [itemsText, note.trim()].filter(Boolean).join(", ").slice(0, 50)
  }

  /** Recomputes Amount + Description from the cart (+ any typed note). Amount stays untouched once the cart is emptied so a manually adjusted value isn't wiped. */
  const applyCartToForm = useCallback((nextCart: CartLine[], note: string) => {
    setRequestForm((prev) => {
      const next = { ...prev, description: composeDescription(nextCart, note) }
      if (nextCart.length > 0) {
        const total = nextCart.reduce((sum, line) => sum + line.price * line.qty, 0)
        next.amount = String(Math.round(total * 100) / 100)
      }
      return next
    })
  }, [])

  const updateCartQty = (item: { id: string; name: string; price: number }, qty: number) => {
    setCart((prev) => {
      const exists = prev.some((c) => c.itemId === item.id)
      const next =
        qty <= 0
          ? prev.filter((c) => c.itemId !== item.id)
          : exists
            ? prev.map((c) => (c.itemId === item.id ? { ...c, qty } : c))
            : [...prev, { itemId: item.id, name: item.name, price: item.price, qty }]
      // Newly selecting an item clears the search/note so the full catalog is browsable again for the next pick.
      const isNewSelection = !exists && qty > 0
      applyCartToForm(next, isNewSelection ? "" : itemSearch)
      if (isNewSelection) setItemSearch("")
      return next
    })
  }

  const removeLastCartItem = () => {
    setCart((prev) => {
      if (prev.length === 0) return prev
      const next = prev.slice(0, -1)
      applyCartToForm(next, itemSearch)
      return next
    })
  }

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

    const trend = prevTotal > 0 ? Math.min(((currentTotal - prevTotal) / prevTotal) * 100, 100) : 0
    const trendLabel = prevTotal > 0
      ? Math.abs(trend) >= 100
        ? "100%"
        : `${Math.abs(trend).toFixed(1)}%`
      : ""

    const getFormattedDateRange = (range: "today" | "week" | "month" | "year") => {
      const now = new Date()
      switch (range) {
        case "today":
          return format(now, "M/d/yyyy")
        case "week":
          const start = startOfWeek(now, { weekStartsOn: 1 }) // Starts on Monday
          const end = endOfWeek(now, { weekStartsOn: 1 })
          return `${format(start, "M/d/yyyy")} - ${format(end, "M/d/yyyy")}`
        case "month":
          return format(now, "MMMM yyyy")
        case "year":
          return format(now, "yyyy")
        default:
          return ""
      }
    }

    const formattedDateRange = getFormattedDateRange(timeRange)

    return {
      currentTotal,
      prevTotal,
      trend,
      trendLabel,
      count: currentTxs.length,
      formattedDateRange
    }
  }, [transactions, timeRange])

  useEffect(() => {
    async function fetchData() {
      try {
        const [mRes, tRes, cbRes] = await Promise.all([
          fetch(`/api/merchants/${id}`),
          fetch(`/api/merchants/${id}/transactions`),
          fetch(`/api/merchants/${id}/cashback`)
        ]);
        if (mRes.ok) setMerchant(await mRes.json());
        if (tRes.ok) setTransactions(await tRes.json());
        if (cbRes.ok) {
          const cb = await cbRes.json();
          setSubsidiaryAccountNumber(cb.subsidiaryAccountNumber ?? null);
        }
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

  const stopPushPolling = useCallback(() => {
    if (pushPollRef.current.intervalId) clearInterval(pushPollRef.current.intervalId)
    if (pushPollRef.current.timeoutId) clearTimeout(pushPollRef.current.timeoutId)
    pushPollRef.current.intervalId = undefined
    pushPollRef.current.timeoutId = undefined
  }, [])

  const refreshTransactions = useCallback(async () => {
    try {
      const tRes = await fetch(`/api/merchants/${id}/transactions`)
      if (tRes.ok) {
        const newTransactions = await tRes.json()
        setTransactions(
          newTransactions.sort(
            (a: { timestamp: string }, b: { timestamp: string }) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
        )
      }
    } catch (err) {
      console.error("Failed to refresh transactions", err)
    }
  }, [id])

  const startPushStatusPolling = useCallback(
    (transactionReference: string) => {
      stopPushPolling()
      pushPollRef.current.transactionReference = transactionReference
      setCurrentTxStatus("awaiting_pin")

      pushPollRef.current.intervalId = setInterval(async () => {
        try {
          const res = await fetch(`/api/merchants/${id}/transactions/${transactionReference}`)
          if (!res.ok) return
          const tx = await res.json()
          setCurrentTxStatus(tx.status)
          if (tx.status === "success" || tx.status === "failed") {
            stopPushPolling()
            pushPollRef.current.transactionReference = undefined
            await refreshTransactions()
            if (tx.status === "success") {
              toast({
                title: "Payment Successful",
                description: "The customer completed authorization on their phone.",
              })
              setRequestForm((prev) => ({ ...prev, amount: "", description: "" }))
              setCart([])
              setItemSearch("")
            } else {
              toast({
                variant: "destructive",
                title: "Payment Failed",
                description: "The provider reported this payment did not complete.",
              })
            }
            setPaymentFlowPhase("idle")
          }
        } catch (err) {
          console.error("Push status polling error:", err)
        }
      }, 2000)

      pushPollRef.current.timeoutId = setTimeout(() => {
        stopPushPolling()
        // Polling timeout does not fail the transaction — callback settlement is authoritative.
      }, 120_000)
    },
    [id, stopPushPolling, refreshTransactions, toast]
  )

  useEffect(() => () => stopPushPolling(), [stopPushPolling])

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

  const isFormLocked = paymentFlowPhase !== "idle"
  const isPushSubmitting = paymentFlowPhase === "push_submitting"
  const isLinkSubmitting = paymentFlowPhase === "link_submitting"

  const handleRequestPanelOpenChange = (open: boolean) => {
    if (open) {
      setIsRequestPanelOpen(true)
      return
    }
    // Closing via X only dismisses UI; in-flight push / awaiting_pin continue in background.
    setIsRequestPanelOpen(false)
  }

  const preventLockedModalDismiss = (e: Event) => {
    if (isFormLocked) {
      e.preventDefault()
      return
    }
    const target = e.target as Node | null
    if (target && itemPickerDropdownRef.current?.contains(target)) {
      e.preventDefault()
    }
  }

  const isSuccessPushActive =
    lastMode === "push" &&
    (paymentFlowPhase === "push_submitting" ||
      (!!currentTxStatus && currentTxStatus !== "success" && currentTxStatus !== "failed"))

  const preventSuccessModalDismiss = (e: Event) => {
    if (isSuccessPushActive) e.preventDefault()
  }

  const handleSuccessModalOpenChange = (open: boolean) => {
    if (open) {
      setIsSuccessModalOpen(true)
      return
    }
    setIsSuccessModalOpen(false)
    if (!pushPollRef.current.transactionReference) {
      setCurrentTxStatus(null)
    }
  }

  const handleRequestPayment = async (mode: "push" | "link", retryData?: { amount: string; phone: string }) => {
    if (isFormLocked && !(mode === "push" && isSuccessModalOpen)) return

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

    setLastMode(mode)
    setGeneratedResult(null)
    if (mode === "push") {
      setCurrentTxStatus(null)
    }
    setPaymentFlowPhase(mode === "push" ? "push_submitting" : "link_submitting")

    const controller = new AbortController()
    const requestTimeoutMs = 90_000
    const requestTimeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)

    try {
      const transactionId = `tx_${Math.random().toString(36).slice(2, 10)}`
      const timestamp = new Date().toISOString()
      const serviceDescription = requestForm.description || `Payment Request for Customer`
      const authToken = `demo_auth_${Math.random().toString(36).slice(2, 10)}`

      const payload = {
        merchantId: id,
        transactionId,
        userCredentials: {
          phone,
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
        signal: controller.signal,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Request Failed",
          description: data?.error || "Please check the inputs and try again.",
        })
        setPaymentFlowPhase("idle")
        return
      }

      await refreshTransactions()

      setLastRequestDetails({ amount, phone })

      if (mode === "push") {
        const transactionReference = data?.transactionReference as string | undefined
        setGeneratedResult({ transactionReference })

        if (transactionReference) {
          setPaymentFlowPhase("idle")
          setIsRequestPanelOpen(false)
          setIsSuccessModalOpen(true)
          startPushStatusPolling(transactionReference)
        } else {
          setPaymentFlowPhase("idle")
          toast({
            variant: "destructive",
            title: "Unexpected Response",
            description: "Payment was accepted but no transaction reference was returned.",
          })
        }
        return
      }

      setGeneratedResult({
        paymentUrl: data?.paymentUrl as string | undefined,
        customerPinToken: data?.token as string | undefined,
        transactionReference: data?.transactionReference as string | undefined,
      })
      setPaymentFlowPhase("idle")
      setIsRequestPanelOpen(false)
      setIsSuccessModalOpen(true)
      setRequestForm((prev) => ({ ...prev, amount: "", description: "" }))
      setCart([])
      setItemSearch("")
      toast({
        title: "Payment Link Generated",
        description: "Share the secure payment link with your customer.",
      })
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError"
      toast({
        variant: "destructive",
        title: isAbort ? "Request Timed Out" : "Connection Error",
        description: isAbort
          ? "The provider did not respond in time. You can retry the push payment."
          : "Could not reach the payment provider. Please check your connection and try again.",
      })
      setPaymentFlowPhase("idle")
    } finally {
      clearTimeout(requestTimeoutId)
    }
  }



  const isPending = merchant.status === "pending" || merchant.status === "branch_approved"
  const isApproved = merchant.status === "approved" || merchant.status === "active"

  const formContent = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-3 space-y-4">
          <div className={`space-y-4 ${isFormLocked ? "pointer-events-none opacity-60" : ""}`}>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payment Method</Label>
              <RadioGroup
                defaultValue="BANK"
                value={requestForm.method}
                onValueChange={(val) => setRequestForm({ ...requestForm, method: val as "BANK" | "TELEBIRR" })}
                className="grid grid-cols-2 gap-2"
                disabled={isFormLocked}
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
                  disabled={isFormLocked}
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
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Description</Label>
                <span className="text-[9px] font-medium text-slate-400">{requestForm.description.length}/50</span>
              </div>

              {catalogItems.length > 0 ? (
                <>
                  <div
                    ref={itemFieldRef}
                    className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 transition-all focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-200 shadow-sm"
                  >
                    {cart.map((line) => (
                      <div
                        key={line.itemId}
                        className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 py-0.5 pl-2 pr-1 text-[11px] text-amber-900"
                      >
                        <span className="max-w-[90px] truncate font-medium">{line.name}</span>
                        <button
                          type="button"
                          disabled={isFormLocked}
                          onClick={() => updateCartQty({ id: line.itemId, name: line.name, price: line.price }, line.qty - 1)}
                          className="flex h-4 w-4 items-center justify-center rounded-full text-amber-600 hover:bg-amber-100 disabled:opacity-50"
                          aria-label={`Decrease ${line.name} quantity`}
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <span className="min-w-[10px] text-center font-semibold">{line.qty}</span>
                        <button
                          type="button"
                          disabled={isFormLocked}
                          onClick={() => updateCartQty({ id: line.itemId, name: line.name, price: line.price }, line.qty + 1)}
                          className="flex h-4 w-4 items-center justify-center rounded-full text-amber-600 hover:bg-amber-100 disabled:opacity-50"
                          aria-label={`Increase ${line.name} quantity`}
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isFormLocked}
                          onClick={() => updateCartQty({ id: line.itemId, name: line.name, price: line.price }, 0)}
                          className="flex h-4 w-4 items-center justify-center rounded-full text-amber-600 hover:bg-rose-100 hover:text-rose-600 disabled:opacity-50"
                          aria-label={`Remove ${line.name}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex min-w-[100px] flex-1 items-center gap-1.5">
                      {cart.length === 0 && <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                      <input
                        ref={itemSearchInputRef}
                        type="text"
                        disabled={isFormLocked}
                        placeholder={cart.length === 0 ? "Order #1022, or search your items…" : "Add more…"}
                        className="h-6 min-w-0 flex-1 border-0 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400 disabled:opacity-50"
                        value={itemSearch}
                        onChange={(e) => {
                          const val = e.target.value
                          setItemSearch(val)
                          setShowItemPicker(true)
                          applyCartToForm(cart, val)
                        }}
                        onFocus={() => setShowItemPicker(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && itemSearch === "" && cart.length > 0) {
                            removeLastCartItem()
                          }
                        }}
                      />
                      {itemSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setItemSearch("")
                            applyCartToForm(cart, "")
                            itemSearchInputRef.current?.focus()
                          }}
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-slate-300 hover:text-slate-600"
                          aria-label="Clear search"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {showItemPicker &&
                    !isFormLocked &&
                    itemPickerStyle &&
                    typeof document !== "undefined" &&
                    createPortal(
                      <div
                        ref={itemPickerDropdownRef}
                        style={itemPickerStyle}
                        className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                      >
                        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Select items</span>
                          <button
                            type="button"
                            onClick={() => setShowItemPicker(false)}
                            className="flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            aria-label="Close item list"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {filteredCatalogItems.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-400">No matching items.</p>
                          ) : (
                            filteredCatalogItems.map((item) => {
                              const line = cart.find((c) => c.itemId === item.id)
                              return (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-amber-50/60"
                                >
                                  <label className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer">
                                    <Checkbox
                                      checked={!!line}
                                      onCheckedChange={(checked) => updateCartQty(item, checked ? 1 : 0)}
                                    />
                                    <span className="truncate text-slate-700">
                                      {item.name}{" "}
                                      <span className="font-semibold text-[#754319]">ETB {item.price.toLocaleString()}</span>
                                    </span>
                                  </label>
                                  {line && (
                                    <div className="flex shrink-0 items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => updateCartQty(item, line.qty - 1)}
                                        className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-white"
                                        aria-label={`Decrease ${item.name} quantity`}
                                      >
                                        <Minus className="h-3 w-3" />
                                      </button>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={line.qty}
                                        onChange={(e) => {
                                          const digits = e.target.value.replace(/\D/g, "")
                                          if (digits === "") return
                                          updateCartQty(item, Math.max(1, Math.min(999, Number(digits))))
                                        }}
                                        className="h-5 w-8 rounded border border-slate-200 text-center text-xs"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => updateCartQty(item, line.qty + 1)}
                                        className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-white"
                                        aria-label={`Increase ${item.name} quantity`}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>,
                      document.body
                    )}
                </>
              ) : (
                <div className="relative group transition-all duration-200">
                  <FileText className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
                  <Textarea
                    id="description"
                    placeholder="Order #1022"
                    className="min-h-[60px] max-h-[100px] rounded-lg border-slate-200 bg-white pl-9 py-2 text-sm focus-visible:ring-slate-200 focus-visible:border-slate-300 transition-all resize-none shadow-sm"
                    disabled={isFormLocked}
                    value={requestForm.description}
                    onChange={(e) => {
                      if (e.target.value.length <= 50) {
                        setRequestForm({ ...requestForm, description: e.target.value });
                      }
                    }}
                  />
                </div>
              )}
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
                  disabled={isFormLocked}
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
          </div>
        </div>
      </div>
      <div className="shrink-0 p-5 border-t border-slate-50 bg-white rounded-b-2xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            type="button"
            onClick={() => handleRequestPayment("push")}
            className="h-10 rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all text-xs font-bold"
            disabled={isFormLocked || !isApproved}
          >
            {isPushSubmitting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isPushSubmitting ? "Sending…" : "Push Payment"}
          </Button>
          <Button
            type="button"
            onClick={() => handleRequestPayment("link")}
            className="h-10 rounded-xl bg-white border border-amber-200 text-amber-900 hover:bg-amber-50 text-xs font-bold shadow-sm transition-all"
            disabled={isFormLocked || !isApproved}
          >
            {isLinkSubmitting ? (
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
      <section className="rounded-3xl border border-amber-200/30 bg-white/80 p-4 sm:p-5 md:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <div>
              <p className="text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-amber-700/70">Merchant Dashboard</p>
              <div className="mt-1.5 md:mt-2 flex items-center gap-2 md:gap-3">
                <h1 className="text-xl md:text-3xl leading-tight font-bold text-[#5b371f]">
                  Welcome back, {merchant.name}
                </h1>
                <div className="flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-0.5 md:py-1 rounded-full bg-emerald-50 border border-emerald-100/50">
                  <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-600" />
                  <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-emerald-700">Verified</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <div className="flex items-center gap-1.5 md:gap-2.5 group cursor-pointer" onClick={() => copyText(merchant.accountNumber, "acc")}>
                <div className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1 md:py-1.5 rounded-xl bg-amber-50/50 border border-amber-100/50 transition-all hover:bg-amber-100/50 hover:border-amber-200/50">
                  <Wallet className="w-3 h-3 md:w-3.5 md:h-3.5 text-amber-700" />
                  <span className="text-xs md:text-sm font-bold text-amber-900/80 font-mono tracking-wider">{merchant.accountNumber}</span>
                  {copied === "acc" ? (
                    <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3 md:w-3.5 md:h-3.5 text-amber-400 group-hover:text-amber-600 transition-colors" />
                  )}
                </div>
                <span className="text-[9px] md:text-[10px] font-bold text-amber-700/40 uppercase tracking-tight group-hover:text-amber-700/60 transition-colors">Settlement Account</span>
              </div>

              {subsidiaryAccountNumber && (
                <div className="flex items-center gap-1.5 md:gap-2.5 group cursor-pointer" onClick={() => copyText(subsidiaryAccountNumber, "sub")}>
                  <div className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1 md:py-1.5 rounded-xl bg-amber-50/50 border border-amber-100/50 transition-all hover:bg-amber-100/50 hover:border-amber-200/50">
                    <Landmark className="w-3 h-3 md:w-3.5 md:h-3.5 text-amber-700" />
                    <span className="text-xs md:text-sm font-bold text-amber-900/80 font-mono tracking-wider">{subsidiaryAccountNumber}</span>
                    {copied === "sub" ? (
                      <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3 md:w-3.5 md:h-3.5 text-amber-400 group-hover:text-amber-600 transition-colors" />
                    )}
                  </div>
                  <span className="text-[9px] md:text-[10px] font-bold text-amber-700/40 uppercase tracking-tight group-hover:text-amber-700/60 transition-colors">Subsidiary Account</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              disabled={!isApproved}
              className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all px-3 md:px-6"
              onClick={() => setIsRequestPanelOpen(true)}
            >
              <Sparkles className="mr-1.5 md:mr-2 h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="text-xs md:text-sm font-bold">Push Payment</span>
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
                <p className="font-semibold text-sm">Account status: {merchant.status === 'branch_approved' ? 'Initial Review OK' : merchant.status}</p>
                <p className="text-xs text-muted-foreground">
                  {isPending ? "Payment requests unlock once your account is approved." : merchant.rejectionReason || "Application requires updates."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="mt-6">
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center justify-between">
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
          {stats.formattedDateRange && (
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800/60 ml-1">
              {stats.formattedDateRange}
            </p>
          )}
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
                    {stats.trend > 0 ? "+" : "-"}{stats.trendLabel}
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
                            : nonTerminalStatuses.includes(tx.status)
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                        }`}
                      >
                        {tx.status === "success" ? "Success" : nonTerminalStatuses.includes(tx.status) ? "Initiated" : "Failed"}
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

      <Sheet open={isMobile && isRequestPanelOpen} onOpenChange={handleRequestPanelOpenChange}>
        <SheetContent
            side="bottom"
            className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-0 bg-white px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
            onInteractOutside={preventLockedModalDismiss}
            onEscapeKeyDown={preventLockedModalDismiss}
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

      <Dialog open={!isMobile && isRequestPanelOpen} onOpenChange={handleRequestPanelOpenChange}>
        <DialogContent
          className="max-w-sm border border-slate-100 bg-white p-0 rounded-2xl shadow-sm overflow-hidden flex flex-col max-h-[90vh]"
          onInteractOutside={preventLockedModalDismiss}
          onEscapeKeyDown={preventLockedModalDismiss}
        >
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
      <Dialog open={isSuccessModalOpen} onOpenChange={handleSuccessModalOpenChange}>
        <DialogContent 
          className="max-w-sm border border-slate-100 bg-white p-0 rounded-2xl shadow-sm overflow-hidden max-h-[90vh]"
          onInteractOutside={preventSuccessModalDismiss}
          onEscapeKeyDown={preventSuccessModalDismiss}
        >
          <div className="p-5 text-center border-b border-slate-50">
            {lastMode === "link" ? (
              <>
                <div className="mx-auto w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight leading-none">Payment Link Ready</h3>
                <p className="text-slate-500 mt-1.5 text-[11px]">Secure checkout link generated</p>
              </>
            ) : paymentFlowPhase === "push_submitting" ? (
              <>
                <div className="mx-auto w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center mb-3">
                  <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight leading-none">Sending Push…</h3>
                <p className="text-slate-500 mt-1.5 text-[11px]">Contacting payment provider</p>
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
                    className="h-10 rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all flex items-center justify-center gap-2 text-xs font-bold"
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
                    disabled={paymentFlowPhase === "push_submitting"}
                    onClick={() =>
                      handleRequestPayment("push", {
                        amount: lastRequestDetails?.amount || "",
                        phone: lastRequestDetails?.phone || "",
                      })
                    }
                    className="button-honey-solid w-full h-10 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all text-xs font-bold"
                  >
                    {paymentFlowPhase === "push_submitting" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {paymentFlowPhase === "push_submitting" ? "Sending…" : "Resend Push Notification"}
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
              disabled={paymentFlowPhase === "push_submitting"}
              onClick={() => handleSuccessModalOpenChange(false)}
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
