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
  name: "Finflow Gateway",
  initials: "FG",
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
      <div className="min-h-screen flex items-center justify-center bg-[#fff7e8] p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen bg-[linear-gradient(155deg,#fff9ee_0%,#fbe5b2_50%,#f7d588_100%)] p-4 flex items-center justify-center">
        <Card className="w-full max-w-md rounded-3xl border border-white/60 bg-white/70 shadow-lg backdrop-blur-sm">
          <CardContent className="p-6 space-y-4 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <XCircle className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-[#5b371f]">Unable to pay</h1>
            <p className="text-sm text-[#754319]/70">{error || "This payment link is invalid or has expired."}</p>
            <Button variant="outline" className="rounded-2xl" onClick={() => router.push("/")}>
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(155deg,#fff9ee_0%,#fbe5b2_50%,#f7d588_100%)] p-4">
      <div className="mx-auto w-full max-w-md space-y-4">
        <Card className="relative overflow-hidden rounded-[30px] border border-white/65 bg-white/80 shadow-[0_24px_65px_-34px_rgba(91,55,31,0.5)] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-[#f6e6bf] via-[#efcb73] to-[#9c6b32] px-6 pb-8 pt-6 text-[#3f210f]">
              <div className="flex flex-col gap-6">
                <div className="rounded-[24px] border border-white/20 bg-white/15 px-4 py-3 shadow-[0_14px_35px_-18px_rgba(91,55,31,0.45)]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/25 ring-1 ring-white/35">
                        {gatewayBrand.logoUrl ? (
                          <Image
                            src={gatewayBrand.logoUrl}
                            alt={gatewayBrand.name}
                            width={32}
                            height={32}
                            className="rounded-lg"
                          />
                        ) : (
                          <span className="text-[11px] font-black tracking-[0.16em] text-[#5b371f]">{gatewayBrand.initials}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#754319]/65">Powered by</p>
                        <p className="truncate text-sm font-semibold text-[#3f210f]">Nib International Bank</p>
                      </div>
                    </div>

                    <div className="h-10 w-px bg-white/30" />

                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/25 ring-1 ring-white/35">
                        {payment.merchantLogoUrl ? (
                          <Image
                            src={payment.merchantLogoUrl}
                            alt={payment.merchantName}
                            width={32}
                            height={32}
                            className="rounded-lg object-cover"
                          />
                        ) : (
                          <span className="text-[11px] font-black tracking-[0.16em] text-[#5b371f]">{getInitials(payment.merchantName)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#3f210f]">{payment.merchantName}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#754319]/80">Payment</p>
                  <p className="mt-3 text-4xl font-black tracking-tight">{payment.amount.toFixed(2)} ETB</p>
                  <p className="mt-2 max-w-[14rem] text-sm text-[#5b371f]/80">{payment.serviceDescription}</p>
                </div>
              </div>
            </div>

            <div className="space-y-5 bg-[#fffdfa] p-6">
              <div className="rounded-[24px] border border-[#754319]/10 bg-white/90 p-4 shadow-sm">
                <div className="space-y-3">
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-[#754319]/10 pb-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#754319]/65">Merchant</p>
                    <p className="text-right text-sm font-semibold text-[#5b371f]">{payment.merchantName}</p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-[#754319]/10 pb-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#754319]/65">Account</p>
                    <p className="break-all text-right font-mono text-sm text-[#5b371f]">{payment.merchantAccountNumber}</p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-[#754319]/10 pb-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#754319]/65">Reference</p>
                    <p className="break-all text-right font-mono text-sm text-[#5b371f]">{payment.transactionReference}</p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3 border-b border-[#754319]/10 pb-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#754319]/65">Status</p>
                    <p className="text-right text-sm font-semibold text-[#5b371f] capitalize">
                      {payment.status === "awaiting_pin"
                        ? "Awaiting PIN"
                        : payment.status === "processing"
                          ? "Processing"
                          : payment.status}
                    </p>
                  </div>
                  <div className="grid grid-cols-[108px_minmax(0,1fr)] items-start gap-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#754319]/65">Paying With</p>
                    <p className="text-right text-sm font-medium text-[#5b371f]">{payment.payerPhone || "Customer"}</p>
                  </div>
                </div>
              </div>

              {view === "checkout" && (
                <div className="space-y-4">
                  {!pushSent ? (
                    <Button
                      className="h-14 w-full rounded-[22px] bg-gradient-to-r from-[#e5ae37] to-[#8f5c2d] text-base text-white shadow-lg shadow-amber-700/25"
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
                      <div className="rounded-[22px] border border-amber-200 bg-amber-50/50 p-6 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                          <Clock className="w-6 h-6 text-amber-600 animate-pulse" />
                        </div>
                        <h3 className="text-base font-bold text-[#5b371f]">USSD Push Sent</h3>
                        <p className="mt-1 text-sm text-[#754319]/80">
                          Please check your phone (<strong>{payment.payerPhone}</strong>) and enter your PIN to authorize the payment.
                         </p>
                       </div>
                       
                       <p className="text-center text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                         Awaiting authorization...
                       </p>
                     </div>
                   )}
                 </div>
               )}

              {view !== "checkout" && (
                <div className="space-y-3 pt-1 text-center">
                  <div
                    className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center ${
                      view === "success" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                    }`}
                  >
                    {view === "success" ? <CheckCircle2 className="w-7 h-7" /> : <XCircle className="w-7 h-7" />}
                  </div>
                  <h2 className="text-xl font-bold text-[#5b371f]">{view === "success" ? "Payment Successful" : "Request Declined"}</h2>
                  <p className="text-sm text-[#754319]/70">
                    {view === "success"
                      ? "Your USSD PIN was verified and the provider confirmed the payment."
                      : "The provider reported a failure (PIN mismatch in demo)."}
                  </p>
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
      <div className="min-h-screen flex items-center justify-center bg-[#fff7e8] p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <PayLinkContent />
    </Suspense>
  )
}

