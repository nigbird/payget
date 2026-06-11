"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Lock, CheckCircle2, Loader2, XCircle, Clock, Receipt,
  ArrowRight, Phone, CreditCard, Copy, Check, Building, FileText
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { QRCodeSVG } from "qrcode.react"
import { Separator } from "@/components/ui/separator"

type ResolvedPayment = {
  merchantId: string
  merchantName: string
  merchantLogoUrl?: string | null
  merchantAccountNumber: string
  transactionId: string
  transactionReference: string
  amount: number
  serviceDescription: string
  status: string
  transactionTimestamp: string
  payerPhone: string
}

function PayLinkContent() {
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const token = useMemo(() => searchParams.get("token") || "", [searchParams])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payment, setPayment] = useState<ResolvedPayment | null>(null)
  const [merchantSessionToken, setMerchantSessionToken] = useState<string | null>(null)

  const [processing, setProcessing] = useState(false)
  const [pushSent, setPushSent] = useState(false)
  const [view, setView] = useState<"checkout" | "success" | "failed" | "pending">("checkout")
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast({ description: "Account number copied to clipboard" })
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadReceipt = async (transactionId: string) => {
    setDownloadingReceipt(true)
    try {
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
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
    const run = async () => {
      if (!token) { setError("Missing token"); setLoading(false); return }
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/payments/resolve?token=${encodeURIComponent(token)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError(data?.error || "Invalid or expired link"); setLoading(false); return }
        setPayment(data)
        setMerchantSessionToken(data.merchantSessionToken)
        if (data?.status === "success") setView("success")
        else if (data?.status === "failed") setView("failed")
      } catch {
        setError("Could not resolve payment link")
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [token])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (pushSent && view === "checkout" && payment?.transactionId) {
      let pollCount = 0
      const maxPolls = 100

      interval = setInterval(async () => {
        pollCount++
        if (pollCount > maxPolls) {
          clearInterval(interval)
          setView("pending")
          return
        }
        try {
          const res = await fetch(`/api/pay/status/${payment.transactionId}`)
          const data = await res.json().catch(() => ({}))
          if (res.ok) {
            if (data?.status === "success") {
              clearInterval(interval)
              const txRes = await fetch(`/api/payments/resolve?token=${encodeURIComponent(token)}`)
              if (txRes.ok) setPayment(await txRes.json().catch(() => payment))
              setView("success")
            } else if (data?.status === "failed") {
              clearInterval(interval)
              const txRes = await fetch(`/api/payments/resolve?token=${encodeURIComponent(token)}`)
              if (txRes.ok) setPayment(await txRes.json().catch(() => payment))
              setView("failed")
            }
          }
        } catch (err) {
          console.error("Polling error:", err)
        }
      }, 3000)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [pushSent, view, token, payment?.transactionId])

  const handleExecute = async () => {
    if (!payment) return
    setProcessing(true)
    try {
      const res = await fetch("/api/provider/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, merchantSessionToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ variant: "destructive", title: "Payment failed", description: data?.error || "Try again." })
        setProcessing(false)
        return
      }
      setPushSent(true)
      setPayment(prev => prev ? { ...prev, status: "awaiting_pin" } : null)
    } catch {
      toast({ variant: "destructive", title: "Payment error", description: "Could not initiate USSD push." })
    } finally {
      setProcessing(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    )
  }

  // ── Invalid link — no "Return Home" per design requirement ─────────────────
  if (error || !payment) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-2 border border-rose-100">
          <XCircle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Unable to Process Payment</h1>
        <p className="text-sm text-slate-500 max-w-xs">{error || "This payment link is invalid or has expired."}</p>
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (view === "success") {
    const transactionAmount = payment.amount.toFixed(2)
    const transactionDate = new Date(payment.transactionTimestamp).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    })
    const qrData = `TXN:${payment.transactionReference}|AMT:${transactionAmount}|DATE:${transactionDate}|FROM:${payment.payerPhone}|TO:${payment.merchantName}`

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
                { label: "From", value: payment.payerPhone },
                { label: "To", value: payment.merchantName },
                { label: "Account", value: payment.merchantAccountNumber },
                { label: "Date", value: transactionDate },
                { label: "Reference", value: payment.transactionReference },
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
                onClick={() => handleDownloadReceipt(payment.transactionId)}
                disabled={downloadingReceipt}
              >
                {downloadingReceipt
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
                  : <><Receipt className="mr-2 h-4 w-4" />View Receipt</>}
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
        </div>
      </div>
    )
  }

  // ── Failed ─────────────────────────────────────────────────────────────────
  if (view === "failed") {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col">
        <header className="bg-white border-b border-amber-100/50 px-4 py-3 shadow-sm sticky top-0 z-50">
          <div className="max-w-md mx-auto flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center overflow-hidden border border-amber-100 shadow-inner">
              <img src="/niblogo.png" alt="NIB" className="w-5 h-5 object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-amber-800/60 uppercase tracking-widest leading-none">Powered By</span>
              <span className="text-xs font-bold text-amber-900 leading-tight">Nib Bank</span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[440px] text-center space-y-6 py-8 animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
              <XCircle className="w-10 h-10 text-rose-500" />
            </div>
            <div className="space-y-2 px-2">
              <h2 className="text-2xl font-black text-rose-900">Payment Failed</h2>
              <p className="text-sm text-rose-700/60 font-medium">We couldn&apos;t process your payment at this time.</p>
              <p className="text-xs text-slate-500">Your account has not been charged.</p>
            </div>
            <button
              className="w-full h-14 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-colors"
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ── Pending ────────────────────────────────────────────────────────────────
  if (view === "pending") {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col">
        <header className="bg-white border-b border-amber-100/50 px-4 py-3 shadow-sm sticky top-0 z-50">
          <div className="max-w-md mx-auto flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center overflow-hidden border border-amber-100 shadow-inner">
              <img src="/niblogo.png" alt="NIB" className="w-5 h-5 object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-amber-800/60 uppercase tracking-widest leading-none">Powered By</span>
              <span className="text-xs font-bold text-amber-900 leading-tight">Nib Bank</span>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[440px] text-center space-y-6 py-8 animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
              <Clock className="w-10 h-10 text-amber-600" />
            </div>
            <div className="space-y-2 px-2">
              <h2 className="text-2xl font-black text-amber-900">Payment Pending</h2>
              <p className="text-sm text-amber-800/70 font-medium">
                We haven&apos;t received confirmation yet. If your PIN was accepted, the payment will reflect shortly.
              </p>
              <p className="text-xs text-slate-500 bg-amber-50 p-3 rounded-xl border border-amber-100 mt-2">
                Please check your bank statement or contact Nib Bank if the amount was debited but not confirmed here.
              </p>
            </div>
            <p className="text-xs font-mono text-slate-400">Ref: {payment.transactionReference}</p>
          </div>
        </main>
      </div>
    )
  }

  // ── Checkout ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F5F0] flex flex-col">
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto p-4 pb-10 space-y-4">

          {/* ── Merchant card ── */}
          <div className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm border border-slate-100">
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
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center overflow-hidden border border-amber-100 shadow-sm shrink-0">
                {payment.merchantLogoUrl ? (
                  <img src={payment.merchantLogoUrl} alt={payment.merchantName} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-amber-700 font-black text-base uppercase">{payment.merchantName?.charAt(0)}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-sm truncate">{payment.merchantName}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-600 font-semibold">Verified Merchant</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Awaiting PIN state ── */}
          {pushSent ? (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center space-y-6">
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
                    <span className="font-bold text-slate-700">({payment.payerPhone})</span>
                    {" "}and enter your PIN to authorize the payment.
                  </p>
                </div>
                <div className="bg-amber-50 rounded-2xl px-4 py-3.5 border border-amber-100/70 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>You are paying</span>
                    <span className="font-bold text-slate-800">{payment.merchantName}</span>
                  </div>
                  <span className="font-bold text-slate-800 text-sm shrink-0 ml-2">
                    ETB {payment.amount.toFixed(2)}
                  </span>
                </div>
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
          ) : (
            /* ── Payment details + Pay Now ── */
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* Amount display */}
              <div className="text-center py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Amount</p>
                <p className="text-6xl font-black text-amber-500">{payment.amount.toFixed(2)}</p>
                <div className="w-28 h-0.5 bg-amber-300/70 rounded-full mx-auto mt-1" />
                <p className="text-sm font-semibold text-slate-400/60 mt-1.5">ETB</p>
                <p className="text-xs text-slate-400 mt-3">
                  Paying <span className="font-bold text-slate-700">{payment.merchantName}</span>
                </p>
              </div>

              {/* Phone Number */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Phone Number</p>
                <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                  <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="flex-1 font-medium text-slate-800 text-sm">{payment.payerPhone}</span>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Payment Method</p>
                <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                  <Building className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="flex-1 font-medium text-slate-800 text-sm">Nib Bank</span>
                </div>
              </div>

              {/* Merchant Account Number */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Merchant Account Number</p>
                <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                  <CreditCard className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="flex-1 font-mono font-medium text-slate-800 text-sm">{payment.merchantAccountNumber}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(payment.merchantAccountNumber)}
                    className="text-slate-300 hover:text-amber-500 transition-colors"
                    aria-label="Copy account number"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Description */}
              {payment.serviceDescription && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-4 pt-3.5 pb-0">Payment Description</p>
                  <div className="flex items-center px-3 pb-3 pt-2 gap-2.5">
                    <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="flex-1 font-medium text-slate-800 text-sm">{payment.serviceDescription}</span>
                  </div>
                </div>
              )}

              {/* Pay Button */}
              <button
                type="button"
                disabled={processing}
                onClick={handleExecute}
                className="w-full h-14 mt-1 rounded-2xl bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white font-bold text-base shadow-xl shadow-amber-950/20 hover:shadow-2xl hover:shadow-amber-950/30 transition-all duration-300 flex items-center justify-between px-5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  <>
                    <Lock className="w-5 h-5 opacity-80" />
                    <span>Pay ETB {payment.amount.toFixed(2)}</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 pt-1">
                <Lock className="w-3 h-3" />
                Secured by Nib Bank
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default function PayLinkPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    }>
      <PayLinkContent />
    </Suspense>
  )
}
