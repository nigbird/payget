"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Lock, CheckCircle2, Loader2, Wallet, XCircle } from "lucide-react"
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

        if (data?.status === "success") setView("success")
        if (data?.status === "failed") setView("failed")
      } catch {
        setError("Could not resolve payment link")
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [token])

  const handleExecute = async () => {
    if (!payment) return
    if (pin.trim().length < 4) {
      toast({ variant: "destructive", title: "Invalid PIN", description: "Enter your USSD PIN." })
      return
    }

    setProcessing(true)
    try {
      const res = await fetch("/api/provider/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ variant: "destructive", title: "Payment failed", description: data?.error || "Try again." })
        setProcessing(false)
        return
      }

      if (data?.status === "success") setView("success")
      else setView("failed")
    } catch {
      toast({ variant: "destructive", title: "Payment error", description: "Could not execute USSD payment." })
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
        <section className="rounded-full border border-white/65 bg-white/60 px-4 py-3 backdrop-blur-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f4e4be] via-[#f2d38a] to-[#bb8748] ring-1 ring-[#754319]/10">
                {gatewayBrand.logoUrl ? (
                  <Image
                    src={gatewayBrand.logoUrl}
                    alt={gatewayBrand.name}
                    width={28}
                    height={28}
                    className="rounded-lg"
                  />
                ) : (
                  <span className="text-xs font-black tracking-[0.16em] text-[#5b371f]">{gatewayBrand.initials}</span>
                )}
              </div>
              <p className="truncate text-sm font-medium text-[#5b371f]">{gatewayBrand.name}</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px w-4 bg-[#754319]/15" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#754319]/55">Powered by</span>
              <div className="h-px w-4 bg-[#754319]/15" />
            </div>

            <div className="flex min-w-0 items-center justify-end gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f6dfc0] via-[#f0c98d] to-[#9f6f39] ring-1 ring-[#754319]/10">
                {payment.merchantLogoUrl ? (
                  <Image
                    src={payment.merchantLogoUrl}
                    alt={payment.merchantName}
                    width={28}
                    height={28}
                    className="rounded-lg object-cover"
                  />
                ) : (
                  <span className="text-xs font-black tracking-[0.16em] text-[#5b371f]">{getInitials(payment.merchantName)}</span>
                )}
              </div>
              <p className="truncate text-right text-sm font-medium text-[#5b371f]">{payment.merchantName}</p>
            </div>
          </div>
        </section>

        <Card className="overflow-hidden rounded-[30px] border border-white/65 bg-white/80 shadow-[0_24px_65px_-34px_rgba(91,55,31,0.5)] backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-[#f6e6bf] via-[#efcb73] to-[#9c6b32] px-6 py-6 text-[#3f210f]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#754319]/80">Payment</p>
                  <p className="mt-3 text-4xl font-black tracking-tight">${payment.amount.toFixed(2)}</p>
                  <p className="mt-2 max-w-[14rem] text-sm text-[#5b371f]/80">{payment.serviceDescription}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/25">
                  <Wallet className="h-5 w-5" />
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
                <>
                  {!showPinEntry ? (
                    <Button
                      className="h-14 w-full rounded-[22px] bg-gradient-to-r from-[#e5ae37] to-[#8f5c2d] text-base text-white shadow-lg shadow-amber-700/25"
                      onClick={() => setShowPinEntry(true)}
                      disabled={processing}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Pay with USSD (Enter PIN)
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-[22px] border border-[#754319]/10 bg-white/90 p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.18em] text-[#754319]/65">USSD prompt simulation</p>
                        <p className="text-sm font-semibold text-[#5b371f]">Enter your PIN to authorize payment</p>
                      </div>
                      <Input
                        type="password"
                        inputMode="numeric"
                        placeholder="••••"
                        className="h-14 rounded-[22px] border-2 border-[#e5ae37]/25 bg-white text-center text-2xl font-black text-[#5b371f]"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        autoFocus
                      />
                      <Button
                        className="h-14 w-full rounded-[22px] bg-gradient-to-r from-[#e5ae37] to-[#8f5c2d] text-white shadow-lg shadow-amber-700/25"
                        onClick={handleExecute}
                        disabled={processing}
                      >
                        {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Confirm Payment
                      </Button>
                      <Button
                        variant="outline"
                        className="h-12 w-full rounded-[22px] border-[#754319]/10 bg-white"
                        onClick={() => setShowPinEntry(false)}
                        disabled={processing}
                      >
                        Cancel
                      </Button>
                      <p className="text-center text-xs text-muted-foreground">
                        Demo PIN: <span className="font-mono">1234</span>
                      </p>
                    </div>
                  )}
                </>
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
    <Suspense fallback={<div>Loading payment link...</div>}>
      <PayLinkContent />
    </Suspense>
  )
}

