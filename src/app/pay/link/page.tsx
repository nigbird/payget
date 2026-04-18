"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Lock, CheckCircle2, Loader2, XCircle, Clock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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

  const [pin, setPin] = useState("")
  const [showPinEntry, setShowPinEntry] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [pushSent, setPushSent] = useState(false)
  const [view, setView] = useState<"checkout" | "success" | "failed">("checkout")

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
        body: JSON.stringify({ token }),
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

  return (
    <div className="min-h-screen bg-white p-4 flex items-center justify-center">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Card className="relative overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm shadow-amber-950/5">
          <CardContent className="p-0">
            <div className="bg-white px-6 pb-8 pt-6 border-b border-black/5">
              <div className="flex flex-col gap-6">
                <div className="rounded-xl border border-amber-100 bg-white px-4 py-3 shadow-sm">
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

                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-amber-100">
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
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#5b371f]">{payment.merchantName}</p>
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
                      className="h-12 w-full rounded-xl bg-amber-600 text-white hover:bg-amber-700 font-medium shadow-sm transition-all"
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
                      <Button variant="outline" className="w-full rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50" onClick={() => window.location.reload()}>
                        I didn't get the prompt
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {view === "success" && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-6 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-medium text-emerald-900">Payment Successful</h3>
                  <p className="mt-2 text-sm text-emerald-700/80">
                    Your payment of {payment.amount.toFixed(2)} ETB has been confirmed.
                  </p>
                </div>
              )}

              {view === "failed" && (
                <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-6 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
                    <XCircle className="w-6 h-6 text-rose-600" />
                  </div>
                  <h3 className="text-lg font-medium text-rose-900">Payment Failed</h3>
                  <p className="mt-2 text-sm text-rose-700/80">
                    Your payment could not be processed. Please try again.
                  </p>
                  <Button variant="outline" className="mt-6 w-full rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => window.location.reload()}>
                    Try Again
                  </Button>
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

