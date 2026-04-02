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

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Customer Phone</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    className="h-12 rounded-2xl border-white/50 bg-white/85 pl-9 shadow-sm focus-visible:ring-amber-500"
                    required
                    value={requestForm.payerPhone}
                    onChange={(e) => setRequestForm({ ...requestForm, payerPhone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="h-16 rounded-2xl border-2 border-[#f8b513]/30 bg-white text-center text-3xl font-black text-[#5b371f] shadow-sm focus-visible:ring-amber-500"
                  required
                  value={requestForm.amount}
                  onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Order #1022"
                  className="min-h-[100px] rounded-2xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500"
                  value={requestForm.description}
                  onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={() => handleRequestPayment("push")}
                  className="h-12 rounded-2xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-sm font-bold text-white shadow-lg shadow-amber-600/30"
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
                  className="h-12 rounded-2xl bg-white border border-[#f8b513]/30 text-[#754319] text-sm font-bold shadow-sm hover:bg-amber-50/50"
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
                <div className="rounded-2xl border border-white/70 bg-white/80 p-3 space-y-2 shadow-sm">
                  <p className="text-xs uppercase tracking-wider text-[#754319]/70">
                    {lastMode === "push" ? "Customer PIN Prompt (Demo)" : "Secure Payment Link"}
                  </p>

                  {generatedResult.paymentUrl ? (
                    <div className="space-y-1">
                      <p className="text-xs text-[#754319]/70">Shareable URL</p>
                      <code className="block break-all rounded-xl bg-white/70 border border-white/60 p-2 text-sm font-mono text-[#5b371f]">
                        {generatedResult.paymentUrl}
                      </code>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-[#754319]/70">Customer token (demo)</p>
                      <code className="block break-all rounded-xl bg-white/70 border border-white/60 p-2 text-sm font-mono text-[#5b371f]">
                        {generatedResult.customerPinToken}
                      </code>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {generatedResult.paymentUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 px-3 rounded-2xl bg-white/70 hover:bg-white/90 text-[#754319] border border-white/60"
                        onClick={() => generatedResult.paymentUrl && copyText(generatedResult.paymentUrl, "paymentUrl")}
                      >
                        {copied === "paymentUrl" ? <CheckCircle2 className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                        {copied === "paymentUrl" ? "Copied" : "Copy URL"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 px-3 rounded-2xl bg-white/70 hover:bg-white/90 text-[#754319] border border-white/60"
                        onClick={() =>
                          generatedResult.customerPinToken && copyText(generatedResult.customerPinToken, "customerPinToken")
                        }
                      >
                        {copied === "customerPinToken" ? <CheckCircle2 className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                        {copied === "customerPinToken" ? "Copied" : "Copy Token"}
                      </Button>
                    )}

                    {generatedResult.transactionReference && (
                      <Badge className="rounded-full bg-amber-100 text-amber-700 border-0">
                        Ref: {generatedResult.transactionReference}
                      </Badge>
                    )}
                  </div>
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
                ? "Push a USSD PIN prompt to the customer instantly (mock)."
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
              ? "Push a USSD PIN prompt to the customer instantly (mock)."
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

