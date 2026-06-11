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
  Building,
  FileText
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
import { QRCodeSVG } from "qrcode.react"

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
  const [description, setDescription] = useState("")
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
    
    // Amount Validation
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum < 1) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount (minimum 1 ETB).",
      })
      return
    }

    // Phone Validation
    if (!phone.trim()) {
      toast({
        variant: "destructive",
        title: "Phone Required",
        description: "Please provide your phone number.",
      })
      return
    }

    const trimmedPhone = phone.trim()
    const isValidEthiopianPhone = /^(?:\+251|251|09)\d{7,10}$/.test(trimmedPhone)
    if (!isValidEthiopianPhone) {
      toast({
        variant: "destructive",
        title: "Invalid Phone",
        description: "Please enter a valid Ethiopian phone number (e.g., 0912345678).",
      })
      return
    }

    // Description Validation
    if (description && description.length > 50) {
      toast({
        variant: "destructive",
        title: "Description Too Long",
        description: "Payment description cannot exceed 50 characters.",
      })
      return
    }

    setIsProcessing(true)
    setView("processing")

    try {
      const response = await fetch(`/api/pay/qr/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: trimmedPhone,
          amount: amountNum,
          description: description
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
    let pollCount = 0;
    const maxPolls = 100; // ~5 minutes

    const interval = setInterval(async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(interval);
        toast({
          variant: "destructive",
          title: "Payment Timeout",
          description: "Confirmation is taking longer than expected. Please check your bank statement."
        });
        setView("failed");
        return;
      }

      try {
        const response = await fetch(`/api/transactions/${txId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.status === "SUCCESS" || data.status === "success") {
            clearInterval(interval)
            setTransaction(data)
            setView("success")
          } else if (data.status === "FAILED" || data.status === "failed") {
            clearInterval(interval)
            setTransaction(data)
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

  if (view === "success") {
    const transactionAmount = parseFloat(String(transaction?.amount || amount || 0)).toFixed(2)
    const transactionDate = new Date(transaction?.timestamp || new Date()).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    })
    const qrData = `TXN:${transaction?.transactionReference || "N/A"}|AMT:${transactionAmount}|DATE:${transactionDate}|FROM:${phone}|TO:${merchant?.name || "N/A"}`

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

            {/* QR Code */}
            <div className="flex justify-center py-5 px-5">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <QRCodeSVG value={qrData} size={150} level="H" />
              </div>
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
              onClick={() => {
                setView("input")
                setAmount("")
                setPhone("")
                setDescription("")
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col">
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          header, footer, button, .no-print, [role="status"] {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .receipt-container {
            border: 1px solid #e2e8f0 !important;
            box-shadow: none !important;
            margin: 2rem auto !important;
            width: 100% !important;
            max-width: 500px !important;
            border-radius: 0 !important;
          }
          .receipt-header {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            margin-bottom: 2rem !important;
          }
          .receipt-logo {
            width: 60px !important;
            height: 60px !important;
            margin-bottom: 1rem !important;
          }
        }
        .print-only {
          display: none;
        }
      `}</style>
      {/* Branded Header */}
      <header className="bg-white border-b border-amber-100/50 px-4 sm:px-6 py-3 sm:py-4 shadow-sm sticky top-0 z-50 no-print">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-amber-50 flex items-center justify-center overflow-hidden border border-amber-100 shadow-inner">
              <img src="/niblogo.png" alt="Nib International Bank" className="w-5 h-5 sm:w-7 sm:h-7 object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] sm:text-[9px] font-bold text-amber-800/60 uppercase tracking-widest leading-none">Powered By</span>
              <span className="text-xs sm:text-sm font-bold text-amber-900 leading-tight">Nib Bank</span>
            </div>
          </div>
          <div className="h-6 sm:h-8 w-px bg-amber-100/60 mx-1 sm:mx-2 shrink-0" />
          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-slate-100 shadow-sm shrink-0">
              {merchant?.logoUrl ? (
                <img src={merchant.logoUrl} alt={merchant.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full bg-amber-50 flex items-center justify-center text-amber-600 font-bold text-[10px] sm:text-xs uppercase">
                  {merchant?.name?.charAt(0)}
                </div>
              )}
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-700 truncate max-w-[100px]">{merchant?.name}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-[440px] space-y-4 sm:space-y-6">
          {view === "input" && (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center space-y-1 sm:space-y-2">
                <h1 className="text-xl sm:text-2xl font-black text-[#5b371f] tracking-tight px-2">Payment to {merchant?.name}</h1>
                <p className="text-xs sm:text-sm text-amber-800/60 font-medium italic">Secure merchant checkout</p>
              </div>

              <Card className="rounded-[1.5rem] sm:rounded-[2.5rem] border-none bg-white shadow-xl sm:shadow-2xl shadow-amber-950/10 overflow-hidden mx-auto">
                <CardContent className="p-5 sm:p-8 space-y-5 sm:space-y-6">
                  {/* Merchant Account Info */}
                  {merchant?.accountNumber && (
                    <div className="bg-amber-50/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-amber-100/50 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-amber-800/60">Merchant Account</p>
                        <p className="text-xs sm:text-sm font-mono font-bold text-amber-900 tracking-wider">{merchant.accountNumber}</p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl text-amber-600 hover:bg-amber-100/50"
                        onClick={() => copyToClipboard(merchant.accountNumber)}
                      >
                        {copied ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : <Copy className="h-3 w-3 sm:h-4 sm:w-4" />}
                      </Button>
                    </div>
                  )}

                  <form onSubmit={handlePayment} className="space-y-5 sm:space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Payment Method</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger className="h-12 sm:h-14 rounded-xl sm:rounded-2xl border-slate-100 bg-slate-50/50 focus:ring-amber-500/20 font-medium">
                            <SelectValue placeholder="Select Method" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl sm:rounded-2xl border-slate-100">
                            <SelectItem value="BANK" className="rounded-lg sm:rounded-xl py-2 sm:py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                  <Building className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className="font-bold text-slate-900 text-xs sm:text-sm">Nib Bank</span>
                                  <span className="text-[9px] sm:text-[10px] text-slate-500">USSD Push Payment</span>
                                </div>
                              </div>
                            </SelectItem>
                            <SelectItem value="TELEBIRR" disabled className="rounded-lg sm:rounded-xl py-2 sm:py-3 opacity-60">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                  <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                                </div>
                                <div className="flex flex-col text-left">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-400 text-xs sm:text-sm">Telebirr</span>
                                    <Badge variant="secondary" className="h-3.5 px-1 text-[7px] sm:text-[8px] uppercase tracking-wider bg-slate-100 text-slate-400">Soon</Badge>
                                  </div>
                                  <span className="text-[9px] sm:text-[10px] text-slate-400">Digital Wallet</span>
                                </div>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="phone" className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Your Phone Number</Label>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                          <Input 
                            id="phone"
                            type="tel"
                            placeholder="0912345678"
                            value={phone}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^\d+]/g, "")
                              if (val.length <= 13) setPhone(val)
                            }}
                            required
                            className="h-12 sm:h-14 pl-10 sm:pl-11 rounded-xl sm:rounded-2xl border-slate-100 bg-slate-50/50 focus-visible:ring-amber-500/20 focus-visible:border-amber-500 font-medium text-sm sm:text-base"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="amount" className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Payment Amount (ETB)</Label>
                        <div className="relative">
                          <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                          <Input 
                            id="amount"
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => {
                              const val = e.target.value
                              if (val === "" || /^([1-9]\d{0,5})(\.\d{0,2})?$/.test(val)) {
                                setAmount(val)
                              }
                            }}
                            required
                            className="h-12 sm:h-14 pl-10 sm:pl-11 rounded-xl sm:rounded-2xl border-slate-100 bg-slate-50/50 focus-visible:ring-amber-500/20 focus-visible:border-amber-500 font-bold text-base sm:text-lg"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <div className="flex items-center justify-between ml-1">
                          <Label htmlFor="description" className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">Payment Description (Optional)</Label>
                          <span className="text-[9px] sm:text-[10px] font-medium text-slate-400">{description.length}/50</span>
                        </div>
                        <div className="relative">
                          <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                          <Input 
                            id="description"
                            type="text"
                            placeholder="e.g. Order #1234, Invoice, etc."
                            value={description}
                            onChange={(e) => {
                              if (e.target.value.length <= 50) {
                                setDescription(e.target.value)
                              }
                            }}
                            className="h-12 sm:h-14 pl-10 sm:pl-11 rounded-xl sm:rounded-2xl border-slate-100 bg-slate-50/50 focus-visible:ring-amber-500/20 focus-visible:border-amber-500 font-medium text-sm sm:text-base"
                          />
                        </div>
                      </div>
                    </div>

                    <Button 
                      type="submit"
                      disabled={isProcessing || !phone || !amount}
                      className="w-full h-14 sm:h-16 rounded-xl sm:rounded-[1.5rem] border-t border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white text-base sm:text-lg font-bold shadow-lg sm:shadow-xl shadow-amber-950/20 hover:shadow-2xl hover:shadow-amber-950/30 transition-all duration-300 group"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                      ) : (
                        <span className="flex items-center gap-2">
                          Pay Now <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                        </span>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {view === "processing" && (
            <div className="text-center space-y-6 sm:space-y-8 py-8 sm:py-12 animate-in zoom-in-95 duration-500">
              <div className="relative">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-amber-100/50 flex items-center justify-center mx-auto">
                  <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 animate-spin text-amber-600" />
                </div>
              </div>
              <div className="space-y-3 px-4">
                <h2 className="text-xl sm:text-2xl font-black text-[#5b371f]">Pushing USSD Request</h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto">Please check your phone (<b>{phone}</b>) and enter your PIN to authorize the payment.</p>
              </div>
              <div className="flex items-center justify-center gap-2 text-[10px] sm:text-xs font-bold text-amber-600 bg-amber-50 px-4 py-2 rounded-full w-fit mx-auto border border-amber-100">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Awaiting PIN entry...
              </div>
            </div>
          )}


          {view === "failed" && merchant && (
            <div className="text-center space-y-6 sm:space-y-8 py-8 sm:py-12 animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-rose-100 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
                <XCircle className="w-10 h-10 sm:w-12 sm:h-12 text-rose-600" />
              </div>
              <div className="space-y-2 px-4">
                <h2 className="text-2xl sm:text-3xl font-black text-rose-950">Payment Failed</h2>
                <p className="text-xs sm:text-sm text-rose-800/60 font-medium">We couldn't process your payment at this time.</p>
                {transaction?.userCredentials?.providerDetails && (
                  <p className="text-[10px] sm:text-xs text-rose-600 bg-rose-50 p-3 rounded-xl border border-rose-100 mt-4">
                    Reason: {transaction.userCredentials.providerDetails}
                  </p>
                )}
              </div>
              <Button 
                className="w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-slate-900 text-white font-bold text-sm sm:text-base"
                onClick={() => setView("input")}
              >
                Try Again
              </Button>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-auto py-8 px-6 text-center border-t border-amber-100/30 no-print" />
    </div>
  )
}
