"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
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
  Plus,
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
    method: "BANK" as "BANK" | "TELEBIRR",
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
        method: requestForm.method,
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
        <ScrollArea className="h-full px-6">
          <div className="space-y-6 pb-6 pt-2">
            {!isMerchantApproved && (
              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-rose-900">Account pending approval</p>
                    <p className="text-xs text-rose-700/80">Request Payment unlocks once your account is approved.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-5">
              <div className="space-y-3 pt-1">
                <Label className="text-xs font-medium text-slate-500">Payment Method</Label>
                <RadioGroup
                  defaultValue="BANK"
                  value={requestForm.method}
                  onValueChange={(val) => setRequestForm({ ...requestForm, method: val as "BANK" | "TELEBIRR" })}
                  className="grid grid-cols-2 gap-3"
                >
                  <div className="relative">
                    <RadioGroupItem
                      value="BANK"
                      id="bank-modal"
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor="bank-modal"
                      className="flex flex-col items-center justify-between rounded-xl border-2 border-slate-100 bg-white p-4 hover:bg-slate-50 peer-data-[state=checked]:border-amber-600 [&:has([data-state=checked])]:border-amber-600 cursor-pointer transition-all"
                    >
                      <Wallet className="mb-2 h-5 w-5 text-slate-600" />
                      <span className="text-[10px] font-medium uppercase tracking-wider">Nib Bank</span>
                    </Label>
                    <div className="absolute top-2 right-2 peer-data-[state=checked]:opacity-100 opacity-0 transition-opacity">
                      <CheckCircle2 className="h-3 w-3 text-amber-600" />
                    </div>
                  </div>
                  <div className="relative">
                    <RadioGroupItem
                      value="TELEBIRR"
                      id="telebirr-modal"
                      className="peer sr-only"
                      disabled
                    />
                    <Label
                      htmlFor="telebirr-modal"
                      className="flex flex-col items-center justify-between rounded-xl border-2 border-slate-100 bg-white p-4 hover:bg-slate-50 peer-data-[state=checked]:border-amber-600 [&:has([data-state=checked])]:border-amber-600 cursor-pointer opacity-60 transition-all"
                    >
                      <Plus className="mb-2 h-5 w-5 text-slate-400" />
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Telebirr</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-medium text-slate-500">Customer Phone</Label>
                <div className="relative group transition-all duration-200">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    className="h-11 rounded-xl border-slate-200 bg-white pl-10 focus-visible:ring-slate-200 focus-visible:border-slate-300 transition-all shadow-sm"
                    required
                    value={requestForm.payerPhone}
                    onChange={(e) => setRequestForm({ ...requestForm, payerPhone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-xs font-medium text-slate-500">Amount</Label>
                <div className="relative group transition-all duration-200">
                  <Wallet className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="h-11 rounded-xl border-slate-200 bg-white pl-10 font-medium text-slate-800 focus-visible:ring-slate-200 focus-visible:border-slate-300 transition-all shadow-sm"
                    required
                    value={requestForm.amount}
                    onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-medium text-slate-500">Description</Label>
                <div className="relative group transition-all duration-200">
                  <FileText className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
                  <Textarea
                    id="description"
                    placeholder="Order #1022"
                    className="min-h-[80px] rounded-xl border-slate-200 bg-white pl-10 py-2.5 focus-visible:ring-slate-200 focus-visible:border-slate-300 transition-all resize-none shadow-sm"
                    value={requestForm.description}
                    onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  type="button"
                  onClick={() => handleRequestPayment("push")}
                  className="h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-sm font-medium text-white shadow-sm transition-all"
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
                  className="h-11 rounded-xl bg-white border border-amber-200 hover:bg-amber-50 text-amber-900 text-sm font-medium shadow-sm transition-all"
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
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
                      {lastMode === "push" ? "USSD Prompt Sent" : "Payment Link Ready"}
                    </p>
                    {generatedResult.transactionReference && (
                      <Badge className="rounded-md bg-slate-200/50 text-slate-700 text-[10px] font-medium border-0 px-2 py-0 h-5">
                        REF: {generatedResult.transactionReference}
                      </Badge>
                    )}
                  </div>

                  {generatedResult.paymentUrl ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500 ml-1">Shareable URL</p>
                      <div className="group relative">
                        <Input 
                          readOnly
                          value={generatedResult.paymentUrl}
                          className="h-10 rounded-lg border-slate-200 bg-white pr-10 text-xs text-slate-600 font-mono focus-visible:ring-0 shadow-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md hover:bg-slate-100 text-slate-500"
                          onClick={() => generatedResult.paymentUrl && copyText(generatedResult.paymentUrl, "paymentUrl")}
                        >
                          {copied === "paymentUrl" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500 ml-1">Customer token (demo)</p>
                      <div className="group relative">
                        <Input 
                          readOnly
                          value={generatedResult.customerPinToken}
                          className="h-10 rounded-lg border-slate-200 bg-white pr-10 text-xs text-slate-600 font-mono focus-visible:ring-0 shadow-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md hover:bg-slate-100 text-slate-500"
                          onClick={() =>
                            generatedResult.customerPinToken && copyText(generatedResult.customerPinToken, "customerPinToken")
                          }
                        >
                          {copied === "customerPinToken" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
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
          className="h-[92vh] rounded-t-2xl border-0 bg-white px-0 pb-0 flex flex-col"
        >
          <div className="mx-auto mb-2 mt-2 h-1 w-12 shrink-0 rounded-full bg-slate-200" />
          <SheetHeader className="text-center px-6 pb-4 border-b border-slate-50 shrink-0">
            <div className="mx-auto w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
              <Wallet className="w-6 h-6 text-slate-600" />
            </div>
            <SheetTitle className="text-xl font-medium text-slate-800">Request payment</SheetTitle>
            <SheetDescription className="text-slate-500">
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
      <DialogContent className="max-w-md border border-slate-100 bg-white p-0 rounded-2xl shadow-sm flex flex-col max-h-[85vh] overflow-hidden">
        <DialogHeader className="text-center p-6 border-b border-slate-50 shrink-0">
          <div className="mx-auto w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
            <Wallet className="w-6 h-6 text-slate-600" />
          </div>
          <DialogTitle className="text-xl font-medium text-slate-800">Request payment</DialogTitle>
          <DialogDescription className="text-slate-500">
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

