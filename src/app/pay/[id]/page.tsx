"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { 
  ShieldCheck, 
  CreditCard, 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2, 
  Building2,
  Lock,
  Calendar,
  Phone
} from "lucide-react"
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
  const [view, setView] = useState<'request' | 'success' | 'failed'>('request')

  useEffect(() => {
    const tx = db.getTransactionById(id)
    if (tx) {
      setTransaction(tx)
      const m = db.getMerchantById(tx.merchantId)
      if (m) setMerchant(m)
      
      if (tx.status === 'success') setView('success')
      if (tx.status === 'failed') setView('failed')
    }
    setLoading(false)
  }, [id])

  const handlePayment = () => {
    setProcessing(true)
    setTimeout(() => {
      db.updateTransactionStatus(id, 'success')
      setView('success')
      setProcessing(false)
      toast({
        title: "Payment Successful",
        description: "Your transaction has been processed securely."
      })
    }, 1500)
  }

  const handleDecline = () => {
    db.updateTransactionStatus(id, 'failed')
    setView('failed')
    toast({
      variant: "destructive",
      title: "Request Declined",
      description: "The payment request has been cancelled."
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!transaction || !merchant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/20 p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <XCircle className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold">Invalid Request</h1>
        <p className="text-muted-foreground max-w-xs">This payment link is invalid or has expired.</p>
        <Button variant="outline" onClick={() => router.push('/')}>Return Home</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/20 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-md w-full relative z-10 animate-in fade-in zoom-in-95 duration-500">
        {view === 'request' && (
          <Card className="border-none shadow-2xl overflow-hidden rounded-3xl">
            <CardHeader className="bg-primary/5 pb-8 pt-10 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-white shadow-lg flex items-center justify-center text-primary mb-2">
                <Building2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Request From</p>
                <h2 className="text-xl font-bold text-foreground">{merchant.name}</h2>
              </div>
            </CardHeader>
            
            <CardContent className="p-8 space-y-8">
              <div className="text-center space-y-2">
                <p className="text-5xl font-black tracking-tight text-primary">
                  ${transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-none px-3 py-1">
                  Payment Request
                </Badge>
              </div>

              <div className="space-y-4 bg-muted/30 p-5 rounded-2xl border border-border/50">
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 rounded-lg bg-white shadow-sm shrink-0">
                    <CreditCard className="w-4 h-4 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Description</p>
                    <p className="text-sm leading-relaxed">{transaction.description}</p>
                  </div>
                </div>
                
                <Separator className="bg-border/50" />
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Date
                    </p>
                    <p className="text-xs font-medium">{new Date(transaction.timestamp).toLocaleDateString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" /> Payer
                    </p>
                    <p className="text-xs font-medium">{transaction.payerPhone}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  onClick={handlePayment}
                  disabled={processing}
                >
                  {processing ? <Loader2 className="w-6 h-6 animate-spin mr-2" /> : "Pay Now"}
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full h-12 rounded-2xl text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                  onClick={handleDecline}
                  disabled={processing}
                >
                  Decline Request
                </Button>
              </div>
            </CardContent>

            <CardFooter className="bg-muted/10 p-6 flex flex-col items-center gap-2 border-t border-border/50">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-green-500" />
                Secure Payment Powered by Finflow
              </div>
              <div className="flex items-center gap-1.5 opacity-40">
                <Lock className="w-3 h-3" />
                <span className="text-[10px] uppercase font-bold tracking-tighter">256-bit Encrypted</span>
              </div>
            </CardFooter>
          </Card>
        )}

        {(view === 'success' || view === 'failed') && (
          <Card className="border-none shadow-2xl rounded-3xl overflow-hidden">
            <CardContent className="p-12 text-center space-y-6">
              <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center animate-in zoom-in duration-500 delay-100 ${view === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {view === 'success' ? <CheckCircle2 className="w-12 h-12" /> : <XCircle className="w-12 h-12" />}
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">
                  {view === 'success' ? 'Payment Successful!' : 'Request Declined'}
                </h2>
                <p className="text-muted-foreground">
                  {view === 'success' 
                    ? `Your payment of $${transaction.amount.toFixed(2)} to ${merchant.name} has been completed.` 
                    : 'The payment request has been rejected and the merchant will be notified.'}
                </p>
              </div>

              <div className="p-4 bg-muted/30 rounded-2xl border border-border/50">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Transaction ID:</span>
                  <span className="font-mono font-medium">{transaction.id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium">{new Date().toLocaleString()}</span>
                </div>
              </div>

              <Button variant="outline" className="w-full h-12 rounded-2xl" onClick={() => router.push('/')}>
                Return to Finflow
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}