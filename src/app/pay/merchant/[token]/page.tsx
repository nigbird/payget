"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Phone,
  CreditCard,
  Clock,
  ArrowRight,
  Wallet,
  Copy,
  Check,
  Building,
  FileText,
  Receipt,
  Lock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { QRCodeSVG } from "qrcode.react"

export default function MerchantQrPaymentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const { toast } = useToast()

  const [merchant, setMerchant] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [view, setView] = useState<"input" | "processing" | "success" | "failed" | "pending">("input")

  const [phone, setPhone] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("BANK")
  const [copied, setCopied] = useState(false)
  const [transaction, setTransaction] = useState<any>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)

  const handleDownloadReceipt = async () => {
    const id = transaction?.id
    if (!id) return
    setDownloadingReceipt(true)
    try {
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ variant: "destructive", title: "Receipt unavailable", description: data.error || "Could not generate receipt." })
        return
      }
      window.open(data.viewUrl, "_blank", "noopener,noreferrer")
    } catch {
      toast({ variant: "destructive", title: "Receipt unavailable", description: "Could not connect to receipt service." })
    } finally {
      setDownloadingReceipt(false)
    }
  }

  useEffect(() => {
    const fetchMerchant = async () => {
      try {
        const response = await fetch(`/api/pay/qr/${token}`)
        if (response.ok) {
          setMerchant(await response.json())
        } else {
          setView("failed")
        }
      } catch (error) {
        console.error("Failed to fetch merchant:", error)
        setView("failed")
      } finally {
        setIsLoading(false)
      }
    }
    fetchMerchant()
  }, [token])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast({ description: "Account number copied to clipboard" })
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval)
    }
  }, [pollingInterval])

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum < 1) {
      toast({ variant: "destructive", title: "Invalid Amount", description: "Please enter a valid amount (minimum 1 ETB)." })
      return
    }
    if (!phone.trim()) {
      toast({ variant: "destructive", title: "Phone Required", description: "Please provide your phone number." })
      return
    }
    const trimmedPhone = phone.trim()
    const isValidEthiopianPhone = /^(?:\+251|251|09)\d{7,10}$/.test(trimmedPhone)
    if (!isValidEthiopianPhone) {
      toast({ variant: "destructive", title: "Invalid Phone", description: "Please enter a valid Ethiopian phone number (e.g., 0912345678)." })
      return
    }
    if (description && description.length > 50) {
      toast({ variant: "destructive", title: "Description Too Long", description: "Payment description cannot exceed 50 characters." })
      return
    }

    setIsProcessing(true)
    setView("processing")

    try {
      const response = await fetch(`/api/pay/qr/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmedPhone, amount: amountNum, description: description })
      })
      if (response.ok) {
        const data = await response.json()
        setTransaction(data)
        startPolling(data.transactionId)
      } else {
        const err = await response.json()
        toast({ variant: "destructive", title: "Payment Failed", description: err.error || "Could not initiate payment." })
        setView("input")
        setIsProcessing(false)
      }
    } catch {
      toast({ variant: "destructive", title: "Connection Error", description: "Please check your internet connection." })
      setView("input")
      setIsProcessing(false)
    }
  }

  const startPolling = (txId: string) => {
    let pollCount = 0
    const maxPolls = 100

    const interval = setInterval(async () => {
      pollCount++
      if (pollCount > maxPolls) {
        clearInterval(interval);
        // Don't show "failed" — the payment may have succeeded but the callback
        // was missed. Show "pending" so the customer knows to check their statement
        // rather than thinking their money wasn't taken.
        setView("pending");
        return;
      }
      try {
        // This endpoint actively queries the provider when status is awaiting_pin,
        // catching missed callbacks in real time during the polling window.
        const response = await fetch(`/api/pay/status/${txId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.status === "success") {
            clearInterval(interval)
            const txRes = await fetch(`/api/transactions/${txId}`)
            if (txRes.ok) setTransaction(await txRes.json())
            setView("success")
          } else if (data.status === "failed") {
            clearInterval(interval)
            const txRes = await fetch(`/api/transactions/${txId}`)
            if (txRes.ok) setTransaction(await txRes.json())
            setView("failed")
          }
        }
      } catch (error) {
        console.error("Polling error:", error)
      }
    }, 3000)
    setPollingInterval(interval)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    )
  }

  if (view === "failed" && !merchant) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 mb-2">
          <XCircle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Invalid Payment Link</h1>
        <p className="text-sm text-slate-500 max-w-xs">This QR code is no longer active or is invalid.</p>
        <Button variant="outline" className="rounded-xl" onClick={() => router.push("/")}>Return Home</Button>
      </div>
    )
  }

  if (view === "success") {
    const transactionAmount = parseFloat(String(transaction?.amount || amount || 0)).toFixed(2)
    const transactionDate = new Date(transaction?.timestamp || new Date()).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    })
    const qrData = `TXN:${transaction?.transactionReference || "N/A"}|AMT:${transactionAmount}|DATE:${transactionDate}|FROM:${phone}|TO:${merchant?.name || "N/A"}`

    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <div className="relative bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 px-6 pt-14 pb-24 flex flex-col items-center text-center overflow-hidden">
          <div className="absolute -top-6 -left-6 w-24 h-24 rounded-full bg-orange-400/40" />
          <div className="absolute top-4 right-0 w-20 h-20 rounded-full bg-amber-300/30" />
          <div className="absolute -bottom-2 right-8 w-14 h-14 rounded-full bg-orange-600/20" />
          <div className="relative z-10 mb-5">
            <div className="w-20 h-20 rounded-full bg-white/25 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-9 h-9 text-emerald-500" />
              </div>
            </div>
          </div>
          <h1 className="relative z-10 text-white font-black text-2xl mb-1">Successful!</h1>
          <p className="relative z-10 text-white font-bold text-sm">Thank You for Banking with NIB!</p>
        </div>

        <div className="flex-1 flex flex-col pb-4">
          <div className="-mt-12 mx-4 bg-white rounded-3xl shadow-lg overflow-hidden">
            <div className="px-5 pt-6 space-y-3">
              {[
                { label: "From", value: phone },
                { label: "To", value: merchant?.name || "N/A" },
                { label: "Account", value: merchant?.accountNumber || "N/A" },
                { label: "Date", value: transactionDate },
                { label: "Reference", value: transaction?.transactionReference || "N/A" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">{label}</span>
                  <span className="font-medium text-gray-800 text-right max-w-[60%] break-all">{value}</span>
                </div>
              ))}
              <Separator />
              {[
                { label: "Amount", value: `ETB ${transactionAmount}` },
                { label: "Amount Credited", value: "ETB 0.00" },
                { label: "Service Charge", value: "ETB 0.00" },
                { label: "Tax", value: "ETB 0.00" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-gray-500">{value}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between items-center pb-1">
                <span className="font-bold text-gray-900 text-sm">Total Debited</span>
                <span className="font-bold text-amber-500">ETB {transactionAmount}</span>
              </div>
            </div>

            <div className="flex justify-center py-5 px-5">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <QRCodeSVG value={qrData} size={150} level="H" />
              </div>
            </div>

            <div className="px-5 pb-4">
              <Button
                className="w-full h-12 rounded-2xl bg-amber-400 hover:bg-amber-500 text-white font-bold"
                onClick={handleDownloadReceipt}
                disabled={downloadingReceipt}
              >
                {downloadingReceipt ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
                ) : (
                  <><Receipt className="mr-2 h-4 w-4" />View Receipt</>
                )}
              </Button>
            </div>

            <div className="flex items-center justify-center gap-3 px-5 pb-6">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-amber-900 border-2 border-amber-700 flex items-center justify-center shadow-sm">
                <img src="/niblogo.png" alt="NIB" className="w-7 h-7 object-contain" />
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-900 text-sm">Nib International Bank</p>
                <p className="text-gray-400 text-xs">Committed to Service Excellence</p>
              </div>
            </div>
          </div>

          <div className="px-4 mt-4">
            <Button
              variant="outline"
              className="w-full h-14 rounded-3xl border border-amber-200 text-amber-500 font-bold text-base bg-white hover:bg-amber-50"
              onClick={() => { setView("input"); setAmount(""); setPhone(""); setDescription("") }}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    )
  }

  /* ─────────────────────────────────────────────
     INPUT / PROCESSING / FAILED  (shared layout)
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#F7F5F0] flex flex-col">
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto p-4 pb-10 space-y-4">

          {/* ── Merchant card: NIB branding + merchant info ── */}
          {merchant && (view === "input" || view === "processing") && (
            <div className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm border border-slate-100">
              {/* NIB Bank */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-amber-900 border border-amber-800 flex items-center justify-center shadow-sm">
                  <img src="/niblogo.png" alt="NIB" className="w-6 h-6 object-contain" />
                </div>
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-amber-800/50 leading-none">Powered by</p>
                  <p className="text-xs font-bold text-amber-900 leading-tight mt-0.5">Nib Bank</p>
                </div>
              </div>

              <div className="h-9 w-px bg-slate-100 mx-1 shrink-0" />

              {/* Merchant */}
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center overflow-hidden border border-amber-100 shadow-sm shrink-0">
                  {merchant.logoUrl ? (
                    <img src={merchant.logoUrl} alt={merchant.name} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-amber-700 font-black text-base uppercase">{merchant.name?.charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate">{merchant.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-xs text-amber-600 font-semibold">Verified Merchant</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── INPUT VIEW ── */}
          {view === "input" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* Amount entry — centered, visually balanced */}
              <div className="text-center py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Amount</p>

                {/* Number perfectly centered, no inline prefix to throw off balance */}
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === "" || /^([1-9]\d{0,5})(\.\d{0,2})?$/.test(val)) setAmount(val)
                  }}
                  className="text-6xl font-black text-amber-500 text-center bg-transparent border-none outline-none w-full max-w-[260px] placeholder:text-slate-400/25 caret-amber-500"
                />

                {/* Underline centered directly under the number */}
                <div className="w-28 h-0.5 bg-amber-300/70 rounded-full mx-auto mt-1" />

                {/* Currency label below underline — clean and balanced */}
                <p className="text-sm font-semibold text-slate-400/60 mt-1.5">ETB</p>

                {/* "Tap to enter" hint — fades away when typing */}
                {!amount && (
                  <p className="text-[10px] text-slate-400/40 mt-1">Tap to enter amount</p>
                )}

                {/* Merchant context — text only, no redundant logo fetch */}
                <p className="text-xs text-slate-400 mt-3">
                  Paying <span className="font-bold text-slate-700">{merchant?.name}</span>
                </p>
              </div>

              <form onSubmit={handlePayment} className="space-y-3">

                {/* Phone Number */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Phone Number</p>
                  <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                    <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                    <input
                      type="tel"
                      placeholder="0912345678"
                      value={phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^\d+]/g, "")
                        if (val.length <= 13) setPhone(val)
                      }}
                      required
                      className="flex-1 bg-transparent border-none outline-none font-medium text-slate-800 text-sm placeholder:text-slate-400/30"
                    />
                    {phone && (
                      <button
                        type="button"
                        onClick={() => setPhone("")}
                        className="text-slate-300 hover:text-slate-500 transition-colors"
                        aria-label="Clear phone"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Payment Method */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Payment Method</p>
                  <div className="flex items-center px-3 pb-3 pt-2">
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="border-none shadow-none h-auto p-0 font-medium text-slate-800 text-sm focus:ring-0 focus:ring-offset-0 flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-100">
                        <SelectItem value="BANK" className="rounded-lg py-2.5">
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4 text-amber-500" />
                            <span className="font-medium">Nib Bank</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="TELEBIRR" disabled className="rounded-lg py-2.5 opacity-50">
                          <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-slate-400" />
                            <span>Telebirr</span>
                            <Badge variant="secondary" className="h-4 px-1 text-[9px] uppercase tracking-wider">Soon</Badge>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Merchant Account Number */}
                {merchant?.accountNumber && (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Merchant Account Number</p>
                    <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                      <CreditCard className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="flex-1 font-mono font-medium text-slate-800 text-sm">{merchant.accountNumber}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(merchant.accountNumber)}
                        className="text-slate-300 hover:text-amber-500 transition-colors"
                        aria-label="Copy account number"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Payment Description */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 pt-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment Description (Optional)</p>
                    <span className="text-[10px] font-medium text-slate-400">{description.length}/50</span>
                  </div>
                  <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                    <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                    <input
                      type="text"
                      placeholder="Add a note"
                      value={description}
                      onChange={(e) => { if (e.target.value.length <= 50) setDescription(e.target.value) }}
                      className="flex-1 bg-transparent border-none outline-none font-medium text-slate-800 text-sm placeholder:text-slate-400/30"
                    />
                  </div>
                </div>

                {/* Pay Button */}
                <button
                  type="submit"
                  disabled={isProcessing || !phone || !amount}
                  className="w-full h-14 mt-1 rounded-2xl bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white font-bold text-base shadow-xl shadow-amber-950/20 hover:shadow-2xl hover:shadow-amber-950/30 transition-all duration-300 flex items-center justify-between px-5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    <>
                      <Lock className="w-5 h-5 opacity-80" />
                      <span>{amount ? `Pay ETB ${parseFloat(amount).toFixed(2)}` : "Pay Now"}</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 pt-1">
                  <Lock className="w-3 h-3" />
                  Secured by Nib Bank
                </p>
              </form>
            </div>
          )}

          {/* ── PROCESSING VIEW ── */}
          {view === "processing" && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center space-y-6">

                {/* Animated spinner */}
                <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 rounded-full bg-amber-200/60 animate-ping" style={{ animationDuration: "1.6s" }} />
                  <div className="absolute inset-2 rounded-full bg-amber-100/80 animate-ping" style={{ animationDuration: "1.6s", animationDelay: "0.3s" }} />
                  <div className="relative w-full h-full rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shadow-sm">
                    <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-xl font-black text-slate-800">Pushing USSD Request</h2>
                  <p className="text-sm text-slate-500 leading-relaxed max-w-[270px] mx-auto">
                    Please check your phone{" "}
                    <span className="font-bold text-slate-700">({phone})</span>
                    {" "}and enter your PIN to authorize the payment.
                  </p>
                </div>

                {/* Amount summary */}
                <div className="bg-amber-50 rounded-2xl px-4 py-3.5 border border-amber-100/70 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>You are paying</span>
                    <span className="font-bold text-slate-800">{merchant?.name}</span>
                  </div>
                  <span className="font-bold text-slate-800 text-sm shrink-0 ml-2">
                    ETB {parseFloat(amount || "0").toFixed(2)}
                  </span>
                </div>

                {/* Awaiting badge */}
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-5 py-2.5 rounded-full w-fit mx-auto">
                  <Clock className="w-3.5 h-3.5" />
                  Awaiting PIN entry...
                </div>
              </div>

              <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                <Lock className="w-3 h-3" />
                Secured by Nib Bank
              </p>
            </div>
          )}

          {/* ── FAILED VIEW ── */}
          {view === "failed" && merchant && (
            <div className="text-center space-y-6 py-8 animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
                <XCircle className="w-10 h-10 text-rose-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-rose-900">Payment Failed</h2>
                <p className="text-sm text-rose-700/60 font-medium">We couldn&apos;t process your payment at this time.</p>
                {transaction?.userCredentials?.providerDetails && (
                  <p className="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-100 mt-2 text-left">
                    Reason: {transaction.userCredentials.providerDetails}
                  </p>
                )}
              </div>
              <button
                className="w-full h-14 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-colors"
                onClick={() => setView("input")}
              >
                Try Again
              </button>
            </div>
          )}

          {/* ── PENDING VIEW — shown when polling times out without a confirmed result ── */}
          {view === "pending" && merchant && (
            <div className="text-center space-y-6 py-8 animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
                <Clock className="w-10 h-10 text-amber-600" />
              </div>
              <div className="space-y-2 px-2">
                <h2 className="text-2xl font-black text-amber-900">Payment Pending</h2>
                <p className="text-sm text-amber-800/70 font-medium">
                  We haven&apos;t received a confirmation yet. If your PIN was accepted,
                  the payment will be reflected shortly.
                </p>
                <p className="text-xs text-slate-500 bg-amber-50 p-3 rounded-xl border border-amber-100 mt-2">
                  Please check your bank statement or contact Nib Bank if the amount
                  was debited but not confirmed here.
                </p>
              </div>
              <button
                className="w-full h-14 rounded-2xl border border-amber-200 text-amber-700 font-bold text-sm hover:bg-amber-50 transition-colors"
                onClick={() => {
                  setView("input")
                  setAmount("")
                  setPhone("")
                  setDescription("")
                }}
              >
                Back to Payment
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
