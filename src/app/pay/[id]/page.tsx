"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Wallet, CheckCircle2, XCircle, Loader2, Clock, Send, QrCode, ChevronRight } from "lucide-react"
import type { Transaction, Merchant } from "@/app/lib/db"
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

  const [completedForPayer, setCompletedForPayer] = useState<Transaction[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const txResponse = await fetch(`/api/transactions/${id}`)
        if (txResponse.ok) {
          const tx = await txResponse.json()
          setTransaction(tx)
          
          const mResponse = await fetch(`/api/merchants/${tx.merchantId}`)
          if (mResponse.ok) {
            const m = await mResponse.json()
            setMerchant(m)
          }

          const pendingResponse = await fetch(`/api/transactions?phone=${tx.userCredentials.phone}&status=pending`)
          if (pendingResponse.ok) {
            const pending = await pendingResponse.json()
            setPendingRequests(pending.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()))
          }

          const historyResponse = await fetch(`/api/transactions?phone=${tx.userCredentials.phone}`)
          if (historyResponse.ok) {
            const history = await historyResponse.json()
            setCompletedForPayer(history.filter((item: any) => item.status !== "pending").slice(0, 4))
          }

          if (tx.status === "success") setView("success")
          if (tx.status === "failed") setView("failed")
        }
      } catch (error) {
        console.error('Failed to fetch transaction data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  const handlePayment = async (txId: string) => {
    setProcessing(true)
    try {
      const response = await fetch(`/api/transactions/${txId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'success' })
      })

      if (response.ok) {
        setPendingRequests((prev) => prev.filter((item) => item.id !== txId))
        if (txId === id) setView("success")
        toast({
          title: "Payment Successful",
          description: "Your transaction has been processed securely."
        })
      } else {
        throw new Error('Payment failed')
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Payment Failed",
        description: "Could not process your payment at this time."
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleDecline = async (txId: string) => {
    try {
      const response = await fetch(`/api/transactions/${txId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'failed' })
      })

      if (response.ok) {
        setPendingRequests((prev) => prev.filter((item) => item.id !== txId))
        if (txId === id) setView("failed")
        toast({
          variant: "destructive",
          title: "Request Declined",
          description: "The payment request has been cancelled."
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: "Could not decline the request at this time."
      })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!transaction || !merchant) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 mb-2">
          <XCircle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-medium text-slate-800 tracking-tight">Invalid Request</h1>
        <p className="text-sm text-slate-500 max-w-xs">This payment link is invalid or has expired.</p>
        <div className="pt-4">
          <Button variant="outline" className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50" onClick={() => router.push('/')}>Return Home</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 sm:p-12">
      <div className="mx-auto w-full max-w-md space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-slate-400">Customer Home</p>
          <h1 className="mt-2 text-xl font-medium text-slate-800 tracking-tight">Pending requests</h1>
          <p className="text-sm text-slate-500">Review and complete payments quickly.</p>
        </section>

        <Card className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardContent className="p-4 text-slate-800">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Wallet Balance</p>
              <Wallet className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">2,840.50 ETB</p>
            <p className="text-xs text-slate-500 mt-1">Available for instant checkout</p>
          </CardContent>
        </Card>

        {view === "request" && pendingRequests.length > 0 && (
          <section className="space-y-3">
            {pendingRequests.slice(0, 4).map((request, index) => (
              <Card
                key={request.id}
                className={`rounded-2xl border-slate-200 bg-white shadow-sm transition-transform hover:-translate-y-0.5 ${
                  index > 0 ? "ml-1" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{merchant.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{request.description}</p>
                    </div>
                    <Badge className="bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      <Clock className="mr-1 h-3 w-3" /> Pending
                    </Badge>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{request.amount.toFixed(2)} ETB</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button
                      className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-medium shadow-sm"
                      disabled={processing}
                      onClick={() => handlePayment(request.id)}
                    >
                      {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Pay"}
                    </Button>
                    <Button variant="outline" className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50" disabled={processing} onClick={() => handleDecline(request.id)}>
                      Decline
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {(view === "success" || view === "failed") && (
          <div className={`rounded-2xl border p-6 text-center shadow-sm ${view === "success" ? "border-emerald-100 bg-emerald-50/50" : "border-rose-100 bg-rose-50/50"}`}>
            <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${view === "success" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
              {view === "success" ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
            </div>
            <h3 className={`text-lg font-medium ${view === "success" ? "text-emerald-900" : "text-rose-900"}`}>
              {view === "success" ? "Payment Successful" : "Request Declined"}
            </h3>
            <p className={`mt-2 text-sm ${view === "success" ? "text-emerald-700/80" : "text-rose-700/80"}`}>
              {view === "success" ? "Your transaction has been processed securely." : "The payment request has been cancelled."}
            </p>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-14 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm">
            <Send className="mr-2 h-4 w-4" /> Send Money
          </Button>
          <Button variant="outline" className="h-14 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm">
            <QrCode className="mr-2 h-4 w-4" /> Scan to Pay
          </Button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <button className="flex w-full items-center justify-between text-sm font-medium text-slate-800" onClick={() => setShowTransactions((prev) => !prev)}>
            Transactions
            <span className="inline-flex items-center text-slate-500 text-xs uppercase tracking-widest">{showTransactions ? "Hide" : "View All"} <ChevronRight className="ml-1 h-4 w-4" /></span>
          </button>
          {showTransactions && (
            <div className="mt-4 space-y-2">
              {completedForPayer.length === 0 && <p className="text-sm text-slate-500">No completed transactions yet.</p>}
              {completedForPayer.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{item.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{new Date(item.timestamp).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={item.status === "success" ? "default" : "destructive"} className="font-medium">{item.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
          Back to login <ChevronRight className="ml-1 h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}