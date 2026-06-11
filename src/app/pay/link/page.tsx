"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Lock, CheckCircle2, Loader2, XCircle, Clock, Receipt } from "lucide-react"
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

const gatewayBrand = {
  name: "NibTera Merchants",
  initials: "NT",
  logoUrl: "/bank-logo.jpg",
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function PayLinkContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()

  const token = useMemo(() => searchParams.get("token") || "", [searchParams])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payment, setPayment] = useState<ResolvedPayment | null>(null)
  const [merchantSessionToken, setMerchantSessionToken] = useState<string | null>(null)

  const [pin, setPin] = useState("")
  const [showPinEntry, setShowPinEntry] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [pushSent, setPushSent] = useState(false)
  const [view, setView] = useState<"checkout" | "success" | "failed">("checkout")
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)

  const handleDownloadReceipt = async (transactionReference: string) => {
    setDownloadingReceipt(true)
    try {
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionReference }),
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
      if (!token) {
        setError("Missing token")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/payments/resolve?token=${encodeURIComponent(token)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data?.error || "Invalid or expired link")
          setLoading(false)
          return
        }

        setPayment(data)
        setMerchantSessionToken(data.merchantSessionToken)
        
        // If it's already success or failed, update view
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
    if (pushSent && view === "checkout") {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/payments/resolve?token=${encodeURIComponent(token)}`)
          const data = await res.json().catch(() => ({}))
          if (res.ok) {
            if (data?.status === "success") {
              setPayment(data)
              setView("success")
              clearInterval(interval)
            } else if (data?.status === "failed") {
              setPayment(data)
              setView("failed")
              clearInterval(interval)
            }
          }
        } catch (err) {
          console.error("Polling error:", err)
        }
      }, 3000) // Poll every 3 seconds
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [pushSent, view, token])

  const handleExecute = async () => {
    if (!payment) return
    // USSD Push flow: No PIN entry needed in web UI, customer enters PIN on their phone.
    setProcessing(true)
    try {
      const res = await fetch("/api/provider/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token,
          merchantSessionToken,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ variant: "destructive", title: "Payment failed", description: data?.error || "Try again." })
        setProcessing(false)
        return
      }

      // If successful, the provider has initiated the push.
      setPushSent(true)
      
      toast({ 
        title: "USSD Push Sent", 
        description: "Please check your phone and enter your PIN to authorize the payment." 
      })
      
      // Update local status to reflect it's awaiting PIN
      setPayment(prev => prev ? { ...prev, status: "awaiting_pin" } : null)

    } catch {
      toast({ variant: "destructive", title: "Payment error", description: "Could not initiate USSD push." })
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    )
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen bg-white p-4 flex items-center justify-center">
        <Card className="w-full max-w-md rounded-2xl border border-amber-100 bg-white shadow-sm">
          <CardContent className="p-8 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-2 border border-rose-100">
              <XCircle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-medium text-amber-900 tracking-tight">Unable to process payment</h1>
            <p className="text-sm text-amber-800/70">{error || "This payment link is invalid or has expired."}</p>
            <div className="pt-4">
              <Button variant="outline" className="w-full rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50" onClick={() => router.push("/")}>
                Return Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (view === "failed") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Card className="rounded-2xl border border-black/5 bg-white shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="bg-gradient-to-b from-rose-50 to-white px-6 pt-10 pb-6 flex flex-col items-center text-center border-b border-rose-100">
                <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mb-4 shadow-sm">
                  <XCircle className="w-8 h-8 text-rose-600" />
                </div>
                <h1 className="text-2xl font-semibold text-rose-900 tracking-tight">Payment Failed</h1>
                <p className="mt-1 text-sm text-rose-700/70">The payment could not be completed</p>
                <p className="mt-4 text-4xl font-bold tracking-tight text-[#3f210f]">{payment.amount.toFixed(2)} <span className="text-xl font-semibold text-amber-800/60">ETB</span></p>
              </div>
              <div className="px-6 py-5 space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Merchant</p>
                  <p className="text-sm font-medium text-slate-800">{payment.merchantName}</p>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Description</p>
                  <p className="text-sm text-slate-700">{payment.serviceDescription}</p>
                </div>
              </div>
              <div className="px-6 pb-6">
                <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-center mb-4">
                  <p className="text-xs text-rose-700 font-medium">Your payment was not processed. You have not been charged.</p>
                </div>
                <Button
                  className="w-full rounded-xl h-11 bg-gradient-to-r from-[#f8b513] to-[#754319] hover:opacity-90 text-white"
                  onClick={() => window.location.reload()}
                >
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (view === "success") {
    const transactionAmount = payment.amount.toFixed(2)
    const transactionDate = new Date(payment.transactionTimestamp).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    })
    const qrData = `TXN:${payment.transactionReference}|AMT:${transactionAmount}|DATE:${transactionDate}|FROM:${payment.payerPhone}|TO:${payment.merchantName}`

    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        {/* Orange gradient header */}
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
          {/* Receipt card overlapping header */}
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

            {/* QR Code */}
            <div className="flex justify-center py-5 px-5">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <QRCodeSVG value={qrData} size={150} level="H" />
              </div>
            </div>

            {/* View Receipt button */}
            <div className="px-5 pb-4">
              <Button
                className="w-full h-12 rounded-2xl bg-amber-400 hover:bg-amber-500 text-white font-bold"
                onClick={() => handleDownloadReceipt(payment.transactionReference)}
                disabled={downloadingReceipt}
              >
                {downloadingReceipt ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</>
                ) : (
                  <><Receipt className="mr-2 h-4 w-4" />View Receipt</>
                )}
              </Button>
            </div>

            {/* NIB branding */}
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

          {/* Done button */}
          <div className="px-4 mt-4">
            <Button
              variant="outline"
              className="w-full h-14 rounded-3xl border border-amber-200 text-amber-500 font-bold text-base bg-white hover:bg-amber-50"
              onClick={() => router.push("/")}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-4 flex items-center justify-center">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm shadow-amber-950/5">
          <CardContent className="p-0">
            <div className="bg-white px-6 pb-8 pt-6 border-b border-black/5">
              <div className="flex flex-col gap-6">
                <div className="rounded-xl border border-amber-100 bg-gradient-to-r from-white to-amber-50/40 px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-amber-100">
                        {gatewayBrand.logoUrl ? (
                          <Image
                            src={gatewayBrand.logoUrl}
                            alt={gatewayBrand.name}
                            width={32}
                            height={32}
                            className="rounded-md"
                          />
                        ) : (
                          <span className="text-[11px] font-medium tracking-widest text-[#754319]">{gatewayBrand.initials}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-widest text-amber-800/60">Powered by</p>
                        <p className="truncate text-sm font-medium text-[#5b371f]">Nib International Bank</p>
                      </div>
                    </div>

                    <div className="h-8 w-px bg-amber-100" />

                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-amber-100 shadow-[0_1px_6px_rgba(117,67,25,0.08)]">
                        {payment.merchantLogoUrl ? (
                          <Image
                            src={payment.merchantLogoUrl}
                            alt={payment.merchantName}
                            width={32}
                            height={32}
                            className="rounded-md object-cover"
                          />
                        ) : (
                          <span className="text-[11px] font-medium tracking-widest text-[#754319]">{getInitials(payment.merchantName)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-medium uppercase tracking-widest text-amber-800/60">Payment</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-[#3f210f]">{payment.amount.toFixed(2)} ETB</p>
                  <p className="mt-1 max-w-[14rem] text-sm text-[#754319]">{payment.serviceDescription}</p>
                </div>
              </div>
            </div>

            <div className="space-y-5 bg-white p-6">
              <div className="rounded-xl border border-amber-100 bg-white p-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-amber-100 pb-3">
                    <p className="text-[11px] uppercase tracking-widest text-amber-800/60">Merchant</p>
                    <p className="text-right text-sm font-medium text-[#5b371f]">{payment.merchantName}</p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-amber-100 pb-3">
                    <p className="text-[11px] uppercase tracking-widest text-amber-800/60">Account</p>
                    <p className="break-all text-right font-mono text-sm text-[#754319]">{payment.merchantAccountNumber}</p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-amber-100 pb-3">
                    <p className="text-[11px] uppercase tracking-widest text-amber-800/60">Reference</p>
                    <p className="break-all text-right font-mono text-sm text-[#754319]">{payment.transactionReference}</p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-amber-100 pb-3">
                    <p className="text-[11px] uppercase tracking-widest text-amber-800/60">Status</p>
                    <p className="text-right text-sm font-medium text-[#5b371f] capitalize">
                      {payment.status === "awaiting_pin"
                        ? "Awaiting PIN"
                        : payment.status === "processing"
                          ? "Processing"
                          : payment.status}
                    </p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3">
                    <p className="text-[11px] uppercase tracking-widest text-amber-800/60">Paying With</p>
                    <p className="text-right text-sm font-medium text-[#5b371f]">{payment.payerPhone || "Customer"}</p>
                  </div>
                </div>
              </div>

              {view === "checkout" && (
                <div className="space-y-4">
                  {!pushSent ? (
                    <Button
                      className="h-12 w-full rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 font-medium transition-all"
                      onClick={handleExecute}
                      disabled={processing}
                    >
                      {processing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Lock className="mr-2 h-4 w-4" />
                      )}
                      Pay Now
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                          <Clock className="w-6 h-6 text-amber-600 animate-pulse" />
                        </div>
                        <h3 className="text-base font-medium text-amber-900">USSD Push Sent</h3>
                        <p className="mt-2 text-sm text-amber-800/80 leading-relaxed">
                          Please check your phone (<strong>{payment.payerPhone}</strong>) and enter your PIN to authorize the payment.
                         </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function PayLinkPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    }>
      <PayLinkContent />
    </Suspense>
  )
}

