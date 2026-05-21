"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Phone, 
  CreditCard, 
  ShieldCheck, 
  Clock,
  ArrowRight,
  Wallet,
  Copy,
  Check,
  ChevronDown,
  Building
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

export default function MerchantQrPaymentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  
  const [merchant, setMerchant] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [view, setView] = useState<"input" | "processing" | "success" | "failed">("input")
  
  const [phone, setPhone] = useState("")
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("BANK")
  const [copied, setCopied] = useState(false)
  const [transaction, setTransaction] = useState<any>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

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
    toast({
      description: "Account number copied to clipboard",
    })
    setTimeout(() => setCopied(false), 2000)
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval)
    }
  }, [pollingInterval])

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone || !amount) return

    setIsProcessing(true)
    setView("processing")

    try {
      const response = await fetch(`/api/pay/qr/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone,
          amount: parseFloat(amount)
        })
      })

      if (response.ok) {
        const data = await response.json()
        setTransaction(data)
        // Start polling for status
        startPolling(data.transactionId)
      } else {
        const err = await response.json()
        toast({
          variant: "destructive",
          title: "Payment Failed",
          description: err.error || "Could not initiate payment."
        })
        setView("input")
        setIsProcessing(false)
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Please check your internet connection."
      })
      setView("input")
      setIsProcessing(false)
    }
  }

  const startPolling = (txId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/transactions/${txId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.status === "SUCCESS" || data.status === "success") {
            clearInterval(interval)
            setView("success")
          } else if (data.status === "FAILED" || data.status === "failed") {
            clearInterval(interval)
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
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
        <Button variant="outline" className="rounded-xl" onClick={() => router.push('/')}>Return Home</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col">
      {/* Branded Header */}
      <header className="bg-white border-b border-amber-100/50 px-6 py-4 shadow-sm sticky top-0 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center overflow-hidden border border-amber-100 shadow-inner">
              <img src="/niblogo.png" alt="Nib International Bank" className="w-7 h-7 object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-amber-800/60 uppercase tracking-widest leading-none">Powered By</span>
              <span className="text-sm font-bold text-amber-900 leading-tight">Nib International Bank</span>
            </div>
          </div>
          <div className="h-8 w-px bg-amber-100/60 mx-2" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-slate-100 shadow-sm shrink-0">
              {merchant?.logoUrl ? (
                <img src={merchant.logoUrl} alt={merchant.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full bg-amber-50 flex items-center justify-center text-amber-600 font-bold text-xs uppercase">
                  {merchant?.name?.charAt(0)}
                </div>
              )}
            </div>
            <span className="text-xs font-bold text-slate-700 truncate max-w-[80px]">{merchant?.name}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          {view === "input" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-black text-[#5b371f] tracking-tight">Payment to {merchant?.name}</h1>
                <p className="text-sm text-amber-800/60 font-medium italic">Secure merchant checkout</p>
              </div>

              <Card className="rounded-[2.5rem] border-none bg-white shadow-2xl shadow-amber-950/10 overflow-hidden">
                <CardContent className="p-8 space-y-6">
                  {/* Merchant Account Info */}
                  {merchant?.accountNumber && (
                    <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100/50 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800/60">Merchant Account</p>
                        <p className="text-sm font-mono font-bold text-amber-900 tracking-wider">{merchant.accountNumber}</p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-9 w-9 rounded-xl text-amber-600 hover:bg-amber-100/50"
                        onClick={() => copyToClipboard(merchant.accountNumber)}
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}

                  <form onSubmit={handlePayment} className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Payment Method</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger className="h-14 rounded-2xl border-slate-100 bg-slate-50/50 focus:ring-amber-500/20 font-medium">
                            <SelectValue placeholder="Select Method" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-slate-100">
                            <SelectItem value="BANK" className="rounded-xl py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                                  <Building className="w-4 h-4 text-amber-600" />
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className="font-bold text-slate-900 text-sm">Nib Bank</span>
                                  <span className="text-[10px] text-slate-500">USSD Push Payment</span>
                                </div>
                              </div>
                            </SelectItem>
                            <SelectItem value="TELEBIRR" disabled className="rounded-xl py-3 opacity-60">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                                  <Wallet className="w-4 h-4 text-slate-400" />
                                </div>
                                <div className="flex flex-col text-left">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-400 text-sm">Telebirr</span>
                                    <Badge variant="secondary" className="h-4 px-1.5 text-[8px] uppercase tracking-wider bg-slate-100 text-slate-400">Coming Soon</Badge>
                                  </div>
                                  <span className="text-[10px] text-slate-400">Digital Wallet</span>
                                </div>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Your Phone Number</Label>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                          <Input 
                            id="phone"
                            type="tel"
                            placeholder="0912345678"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                            className="h-14 pl-11 rounded-2xl border-slate-100 bg-slate-50/50 focus-visible:ring-amber-500/20 focus-visible:border-amber-500 font-medium"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="amount" className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Payment Amount (ETB)</Label>
                        <div className="relative">
                          <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                          <Input 
                            id="amount"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                            className="h-14 pl-11 rounded-2xl border-slate-100 bg-slate-50/50 focus-visible:ring-amber-500/20 focus-visible:border-amber-500 font-bold text-lg"
                          />
                        </div>
                      </div>
                    </div>

                    <Button 
                      type="submit"
                      disabled={isProcessing || !phone || !amount}
                      className="w-full h-16 rounded-[1.5rem] border-t border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white text-lg font-bold shadow-xl shadow-amber-950/20 hover:shadow-2xl hover:shadow-amber-950/30 transition-all duration-300 group"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <span className="flex items-center gap-2">
                          Pay Now <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </span>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {view === "processing" && (
            <div className="text-center space-y-8 py-12 animate-in zoom-in-95 duration-500">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-amber-100/50 flex items-center justify-center mx-auto">
                  <Loader2 className="w-12 h-12 animate-spin text-amber-600" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                  <Phone className="w-4 h-4 text-amber-600" />
                </div>
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-black text-[#5b371f]">Pushing USSD Request</h2>
                <p className="text-sm text-slate-500 max-w-xs mx-auto">Please check your phone (<b>{phone}</b>) and enter your PIN to authorize the payment.</p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-4 py-2 rounded-full w-fit mx-auto border border-amber-100">
                <Clock className="w-4 h-4" /> Awaiting PIN entry...
              </div>
            </div>
          )}

          {view === "success" && (
            <div className="text-center space-y-8 py-12 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-emerald-950">Payment Success!</h2>
                <p className="text-sm text-emerald-800/60 font-medium">Your transaction of <b>{amount} ETB</b> to <b>{merchant?.name}</b> was successful.</p>
              </div>
              <Card className="bg-white border-emerald-100 rounded-3xl overflow-hidden shadow-xl shadow-emerald-950/5">
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Reference:</span>
                    <span className="font-mono font-bold text-slate-900">{transaction?.transactionReference || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Date:</span>
                    <span className="font-bold text-slate-900">{new Date().toLocaleString()}</span>
                  </div>
                  <Separator className="bg-emerald-50" />
                  <Button variant="outline" className="w-full rounded-xl border-emerald-200 text-emerald-700" onClick={() => window.print()}>
                    <Download className="w-4 h-4 mr-2" /> Download Receipt
                  </Button>
                </CardContent>
              </Card>
              <Button variant="ghost" className="text-slate-500" onClick={() => setView("input")}>Make Another Payment</Button>
            </div>
          )}

          {view === "failed" && merchant && (
            <div className="text-center space-y-8 py-12 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 rounded-full bg-rose-100 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
                <XCircle className="w-12 h-12 text-rose-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-rose-950">Payment Failed</h2>
                <p className="text-sm text-rose-800/60 font-medium">We couldn't process your payment at this time.</p>
              </div>
              <Button 
                className="w-full h-14 rounded-2xl bg-slate-900 text-white font-bold"
                onClick={() => setView("input")}
              >
                Try Again
              </Button>
            </div>
          )}
        </div>
      </main>

      <footer className="p-8 text-center" />
    </div>
  )
}
