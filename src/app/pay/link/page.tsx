"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Wallet, Lock, CheckCircle2, XCircle, Loader2, ShieldCheck, ArrowLeft } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type ResolvedPayment = {
  merchantId: string
  merchantName: string
  merchantAccountNumber: string
  transactionId: string
  transactionReference: string
  amount: number
  serviceDescription: string
  status: string
  transactionTimestamp: string
  payerPhone: string
}

export default function PayLinkPage() {
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
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="h-10 px-2 rounded-2xl border border-white/60 bg-white/60 text-[#754319]"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Home
          </Button>
          <Badge className="rounded-full bg-white/70 text-[#754319] border border-white/60">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            Encrypted
          </Badge>
        </div>

        <Card className="rounded-3xl border-0 shadow-lg overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-[#f4db9f] via-[#f8b513] to-[#754319] p-5 text-[#3f210f]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#754319]/80">Payment</p>
                <Wallet className="h-4 w-4" />
              </div>
              <p className="mt-2 text-3xl font-black">${payment.amount.toFixed(2)}</p>
              <p className="mt-1 text-sm opacity-80">{payment.serviceDescription}</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-[#754319]/70">Merchant</p>
                <p className="font-semibold text-[#5b371f]">{payment.merchantName}</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="rounded-2xl bg-white/70 border border-white/60 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#754319]/70">Merchant Account Number</p>
                  <p className="font-mono text-sm text-[#5b371f] break-all">{payment.merchantAccountNumber}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/70 border border-white/60 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#754319]/70">Reference</p>
                  <p className="font-mono text-sm text-[#5b371f] break-all">{payment.transactionReference}</p>
                </div>
                <div className="rounded-2xl bg-white/70 border border-white/60 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#754319]/70">Status</p>
                  <p className="font-semibold text-sm text-[#5b371f] capitalize">
                    {payment.status === "awaiting_pin"
                      ? "Awaiting PIN"
                      : payment.status === "processing"
                        ? "Processing"
                        : payment.status}
                  </p>
                </div>
              </div>

              {view === "checkout" && (
                <>
                  {!showPinEntry ? (
                    <Button
                      className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-600/30"
                      onClick={() => setShowPinEntry(true)}
                      disabled={processing}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Pay with USSD (Enter PIN)
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-2xl bg-white/70 border border-white/60 p-3">
                        <p className="text-xs text-[#754319]/70">USSD prompt simulation</p>
                        <p className="text-sm font-semibold text-[#5b371f]">Enter your PIN to authorize payment</p>
                      </div>
                      <Input
                        type="password"
                        inputMode="numeric"
                        placeholder="••••"
                        className="h-14 rounded-2xl border-2 border-[#f8b513]/30 bg-white text-center text-2xl font-black text-[#5b371f]"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        autoFocus
                      />
                      <Button
                        className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-600/30"
                        onClick={handleExecute}
                        disabled={processing}
                      >
                        {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Confirm Payment
                      </Button>
                      <Button variant="outline" className="h-12 w-full rounded-2xl" onClick={() => setShowPinEntry(false)} disabled={processing}>
                        Cancel
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Demo PIN: <span className="font-mono">1234</span>
                      </p>
                    </div>
                  )}
                </>
              )}

              {view !== "checkout" && (
                <div className="space-y-3 pt-2">
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

        <div className="flex items-center justify-between">
          <Link href="/" className="text-xs font-medium text-[#754319] hover:underline">
            Return to Finflow
          </Link>
          <Badge variant="secondary" className="bg-white/70 border border-white/60 text-[#754319]">
            {payment.payerPhone ? `Paying: ${payment.payerPhone}` : "Customer"}
          </Badge>
        </div>
      </div>
    </div>
  )
}

