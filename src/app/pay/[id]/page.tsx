"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Wallet, CheckCircle2, XCircle, Loader2, Clock, Send, QrCode, ChevronRight } from "lucide-react"
import { db, type Transaction, type Merchant } from "@/app/lib/db"
import { useToast } from "@/hooks/use-toast"

export default function PayerRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [view, setView] = useState<"request" | "success" | "failed">("request")
  const [pendingRequests, setPendingRequests] = useState<Transaction[]>([])
  const [showTransactions, setShowTransactions] = useState(false)

  useEffect(() => {
    const tx = db.getTransactionById(id)
    if (tx) {
      setTransaction(tx)
      const m = db.getMerchantById(tx.merchantId)
      if (m) setMerchant(m)

      const pending = db
        .getTransactions()
        .filter((item) => item.payerPhone === tx.payerPhone && item.status === "pending")
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setPendingRequests(pending)

      if (tx.status === "success") setView("success")
      if (tx.status === "failed") setView("failed")
    }
    setLoading(false)
  }, [id])

  const handlePayment = (txId: string) => {
    setProcessing(true)
    setTimeout(() => {
      db.updateTransactionStatus(txId, "success")
      setPendingRequests((prev) => prev.filter((item) => item.id !== txId))
      if (txId === id) setView("success")
      setProcessing(false)
      toast({
        title: "Payment Successful",
        description: "Your transaction has been processed securely."
      })
    }, 1500)
  }

  const handleDecline = (txId: string) => {
    db.updateTransactionStatus(txId, "failed")
    setPendingRequests((prev) => prev.filter((item) => item.id !== txId))
    if (txId === id) setView("failed")
    toast({
      variant: "destructive",
      title: "Request Declined",
      description: "The payment request has been cancelled."
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fff7e8]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!transaction || !merchant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fff7e8] p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <XCircle className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold">Invalid Request</h1>
        <p className="text-muted-foreground max-w-xs">This payment link is invalid or has expired.</p>
        <Button variant="outline" onClick={() => router.push('/')}>Return Home</Button>
      </div>
    )
  }

  const completedForPayer = db
    .getTransactions()
    .filter((item) => item.payerPhone === transaction.payerPhone && item.status !== "pending")
    .slice(0, 4)

  return (
    <div className="min-h-screen bg-[linear-gradient(155deg,#fff9ee_0%,#fbe5b2_50%,#f7d588_100%)] p-4">
      <div className="mx-auto w-full max-w-md space-y-4">
        <section className="rounded-3xl border border-white/50 bg-white/70 p-4 shadow-lg backdrop-blur-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-[#754319]/70">Customer Home</p>
          <h1 className="mt-2 text-xl font-bold text-[#5b371f]">Pending requests</h1>
          <p className="text-sm text-[#754319]/70">Review and complete payments quickly.</p>
        </section>

        <Card className="rounded-3xl border-0 shadow-lg overflow-hidden">
          <CardContent className="bg-gradient-to-br from-[#f4db9f] via-[#f8b513] to-[#754319] p-4 text-[#3f210f]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider">Wallet Balance</p>
              <Wallet className="h-4 w-4" />
            </div>
            <p className="mt-2 text-3xl font-black">$2,840.50</p>
            <p className="text-xs opacity-80">Available for instant checkout</p>
          </CardContent>
        </Card>

        {view === "request" && pendingRequests.length > 0 && (
          <section className="space-y-3">
            {pendingRequests.slice(0, 4).map((request, index) => (
              <Card
                key={request.id}
                className={`rounded-3xl border-white/60 bg-white/80 shadow-md backdrop-blur-sm transition-transform hover:-translate-y-0.5 ${
                  index > 0 ? "ml-1" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#5b371f]">{merchant.name}</p>
                      <p className="text-xs text-[#754319]/70">{request.description}</p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700 border-0">
                      <Clock className="mr-1 h-3 w-3" /> Pending
                    </Badge>
                  </div>
                  <p className="mt-3 text-3xl font-black tracking-tight text-[#5b371f]">${request.amount.toFixed(2)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button
                      className="rounded-2xl bg-[#754319] text-white"
                      disabled={processing}
                      onClick={() => handlePayment(request.id)}
                    >
                      {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Pay"}
                    </Button>
                    <Button variant="outline" className="rounded-2xl" disabled={processing} onClick={() => handleDecline(request.id)}>
                      Decline
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {(view === "success" || view === "failed") && (
          <Card className="rounded-3xl border-white/50 bg-white/80 shadow-md">
            <CardContent className="p-5 text-center">
              <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${view === "success" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
                {view === "success" ? <CheckCircle2 className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
              </div>
              <p className="font-semibold text-[#5b371f]">{view === "success" ? "Payment completed" : "Request declined"}</p>
            </CardContent>
          </Card>
        )}

        <section className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-14 rounded-2xl border-white/60 bg-white/70">
            <Send className="mr-2 h-4 w-4" /> Send Money
          </Button>
          <Button variant="outline" className="h-14 rounded-2xl border-white/60 bg-white/70">
            <QrCode className="mr-2 h-4 w-4" /> Scan to Pay
          </Button>
        </section>

        <section className="rounded-3xl border border-white/50 bg-white/70 p-4 shadow-sm">
          <button className="flex w-full items-center justify-between text-sm font-medium text-[#754319]" onClick={() => setShowTransactions((prev) => !prev)}>
            Transactions
            <span className="inline-flex items-center">{showTransactions ? "Hide" : "View All"} <ChevronRight className="ml-1 h-4 w-4" /></span>
          </button>
          {showTransactions && (
            <div className="mt-3 space-y-2">
              {completedForPayer.length === 0 && <p className="text-xs text-muted-foreground">No completed transactions yet.</p>}
              {completedForPayer.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white/85 p-3">
                  <div>
                    <p className="text-sm text-[#5b371f]">{item.description}</p>
                    <p className="text-xs text-muted-foreground">{new Date(item.timestamp).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={item.status === "success" ? "default" : "destructive"}>{item.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <Link href="/" className="inline-flex items-center text-xs text-[#754319]">
          Back to login <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}