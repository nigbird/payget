"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  CheckCircle2,
  Copy,
  Loader2,
  Phone,
  Sparkles,
  AlertCircle,
  Wallet,
  FileText,
} from "lucide-react"

export function RequestPaymentModal({
  merchantId,
  open,
  onOpenChange,
  isMerchantApproved,
}: {
  merchantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  isMerchantApproved: boolean
}) {
  const { toast } = useToast()
  const isMobile = useIsMobile()

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [copied, setCopied] = React.useState<string | null>(null)
  const [lastMode, setLastMode] = React.useState<"push" | "link" | null>(null)
  const [generatedResult, setGeneratedResult] = React.useState<{
    paymentUrl?: string
    customerPinToken?: string
    transactionReference?: string
  } | null>(null)

  const [requestForm, setRequestForm] = React.useState({
    amount: "",
    description: "",
    payerPhone: "",
  })

  const copyText = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1400)
    toast({ title: "Copied", description: "Value copied to clipboard." })
  }

  const handleRequestPayment = async (mode: "push" | "link") => {
    const amountNum = parseFloat(requestForm.amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0.",
      })
      return
    }

    if (!requestForm.payerPhone.trim()) {
      toast({
        variant: "destructive",
        title: "Phone Required",
        description: "Please provide a payer phone number.",
      })
      return
    }

    if (!isMerchantApproved) {
      toast({
        variant: "destructive",
        title: "Merchant not active",
        description: "Request Payment is available once your merchant account is approved.",
      })
      return
    }

    setIsSubmitting(true)
    setLastMode(mode)
    setGeneratedResult(null)

    try {
      const transactionId = `tx_${Math.random().toString(36).slice(2, 10)}`
      const timestamp = new Date().toISOString()
      const serviceDescription = requestForm.description || `Payment Request for Customer`

      const authToken = `demo_auth_${Math.random().toString(36).slice(2, 10)}`

      const payload = {
        merchantId,
        transactionId,
        userCredentials: {
          phone: requestForm.payerPhone,
          authToken,
        },
        amount: amountNum,
        serviceDescription,
        timestamp,
      }

      const endpoint = mode === "push" ? "/api/payments/push" : "/api/payments/link"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Request Failed",
          description: data?.error || "Please check the inputs and try again.",
        })
        return
      }

      if (mode === "push") {
        const customerPinToken = data?.customerPinToken as string | undefined
        const transactionReference = data?.transactionReference as string | undefined

        const paymentUrl =
          customerPinToken && typeof window !== "undefined"
            ? `${window.location.origin}/pay/link?token=${encodeURIComponent(customerPinToken)}`
            : undefined

        setGeneratedResult({ customerPinToken, transactionReference, paymentUrl })
      } else {
        setGeneratedResult({
          paymentUrl: data?.paymentUrl as string | undefined,
          customerPinToken: data?.token as string | undefined,
          transactionReference: data?.transactionReference as string | undefined,
        })
      }

      toast({
        title: mode === "push" ? "USSD Request Initiated" : "Payment Link Generated",
        description:
          mode === "push"
            ? `A customer PIN entry prompt is ready (demo token returned).`
            : `Share the secure payment link with your customer.`,
      })

      // Keep quick repeat convenience; clear amount/description after success.
      setRequestForm((prev) => ({ ...prev, amount: "", description: "" }))
    } catch {
      toast({
        variant: "destructive",
        title: "Unexpected Error",
        description: "Could not create payment request. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open) return null

  const formContent = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-6 pb-6">
            {!isMerchantApproved && (
              <div className="rounded-3xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Account pending approval</p>
                    <p className="text-xs text-muted-foreground">Request Payment unlocks once your account is approved.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 ml-1">Customer Phone</Label>
                <div className="relative group transition-all duration-200">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 group-focus-within:text-amber-600 transition-colors" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    className="h-12 rounded-xl border-border/40 bg-white/60 pl-10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] focus-visible:ring-amber-500/20 focus-visible:border-amber-500/30 transition-all"
                    required
                    value={requestForm.payerPhone}
                    onChange={(e) => setRequestForm({ ...requestForm, payerPhone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 ml-1">Amount</Label>
                <div className="relative group transition-all duration-200">
                  <Wallet className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 group-focus-within:text-amber-600 transition-colors" />
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="h-12 rounded-xl border-border/40 bg-white/60 pl-10 text-lg font-medium text-[#5b371f] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] focus-visible:ring-amber-500/20 focus-visible:border-amber-500/30 transition-all"
                    required
                    value={requestForm.amount}
                    onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 ml-1">Description</Label>
                <div className="relative group transition-all duration-200">
                  <FileText className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted-foreground/60 group-focus-within:text-amber-600 transition-colors" />
                  <Textarea
                    id="description"
                    placeholder="Order #1022"
                    className="min-h-[80px] rounded-xl border-border/40 bg-white/60 pl-10 py-2.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] focus-visible:ring-amber-500/20 focus-visible:border-amber-500/30 transition-all resize-none"
                    value={requestForm.description}
                    onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <Button
                  type="button"
                  onClick={() => handleRequestPayment("push")}
                  className="h-12 rounded-xl bg-[#754319] hover:bg-[#5b371f] text-sm font-bold text-white shadow-md shadow-[#754319]/20 active:scale-[0.98] transition-all"
                  disabled={isSubmitting || !isMerchantApproved}
                >
                  {isSubmitting && lastMode === "push" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Push Payment
                </Button>
                <Button
                  type="button"
                  onClick={() => handleRequestPayment("link")}
                  className="h-12 rounded-xl bg-white border border-border/60 hover:bg-amber-50/30 text-[#754319] text-sm font-bold shadow-sm active:scale-[0.98] transition-all"
                  disabled={isSubmitting || !isMerchantApproved}
                >
                  {isSubmitting && lastMode === "link" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  Generate Link
                </Button>
              </div>

              {generatedResult && (
                <div className="rounded-xl border border-border/40 bg-white/60 p-4 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#754319]/60">
                      {lastMode === "push" ? "USSD Prompt Sent" : "Payment Link Ready"}
                    </p>
                    {generatedResult.transactionReference && (
                      <Badge className="rounded-full bg-amber-100/50 text-amber-800 text-[10px] font-bold border-0 px-2 py-0 h-5">
                        REF: {generatedResult.transactionReference}
                      </Badge>
                    )}
                  </div>

                  {generatedResult.paymentUrl ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground/70 ml-1">Shareable URL</p>
                      <div className="group relative">
                        <code className="block break-all rounded-xl bg-white/80 border border-border/30 p-3 text-xs font-mono text-[#5b371f] pr-10">
                          {generatedResult.paymentUrl}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg hover:bg-amber-100/50 text-[#754319]"
                          onClick={() => generatedResult.paymentUrl && copyText(generatedResult.paymentUrl, "paymentUrl")}
                        >
                          {copied === "paymentUrl" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground/70 ml-1">Customer token (demo)</p>
                      <div className="group relative">
                        <code className="block break-all rounded-xl bg-white/80 border border-border/30 p-3 text-xs font-mono text-[#5b371f] pr-10">
                          {generatedResult.customerPinToken}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg hover:bg-amber-100/50 text-[#754319]"
                          onClick={() =>
                            generatedResult.customerPinToken && copyText(generatedResult.customerPinToken, "customerPinToken")
                          }
                        >
                          {copied === "customerPinToken" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[92vh] rounded-t-[2.5rem] border-0 bg-[linear-gradient(180deg,#fffaf0_0%,#fff5de_100%)] px-4 pb-0 flex flex-col"
        >
          <div className="mx-auto mb-3 mt-1 h-1.5 w-14 shrink-0 rounded-full bg-[#754319]/25" />
          <SheetHeader className="text-left mb-4 shrink-0">
            <SheetTitle className="text-2xl text-[#5b371f]">Request payment</SheetTitle>
            <SheetDescription>
              {lastMode === "push"
                ? "Push a USSD PIN prompt to the customer instantly"
                : lastMode === "link"
                ? "Generate a secure payment link your customer can open on any channel."
                : "Choose how you want to receive payment from your customer."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 pb-8">{formContent}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-0 bg-[linear-gradient(180deg,#fffaf0_0%,#fff5de_100%)] p-6 rounded-3xl shadow-2xl flex flex-col max-h-[85vh]">
        <DialogHeader className="text-left mb-4 shrink-0">
          <DialogTitle className="text-2xl text-[#5b371f]">Request payment</DialogTitle>
          <DialogDescription>
            {lastMode === "push"
              ? "Push a USSD PIN prompt to the customer instantly."
              : lastMode === "link"
              ? "Generate a secure payment link your customer can open on any channel."
              : "Choose how you want to receive payment from your customer."}
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  )
}

