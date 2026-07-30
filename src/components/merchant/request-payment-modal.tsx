"use client"

import * as React from "react"
import type { TransactionStatus } from "@/lib/db"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  CheckCircle2,
  Copy,
  Loader2,
  Phone,
  Wallet,
  Sparkles,
  AlertCircle,
  FileText,
  Clock,
  ShieldAlert,
} from "lucide-react"

type PaymentFlowPhase = "idle" | "push_submitting" | "awaiting_pin" | "link_submitting"

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

  const [paymentFlowPhase, setPaymentFlowPhase] = React.useState<PaymentFlowPhase>("idle")
  const [pushTxStatus, setPushTxStatus] = React.useState<TransactionStatus | null>(null)
  const pushPollRef = React.useRef<{
    intervalId?: ReturnType<typeof setInterval>
    timeoutId?: ReturnType<typeof setTimeout>
    transactionReference?: string
  }>({})

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

  const isFormLocked = paymentFlowPhase !== "idle"
  const isPushSubmitting = paymentFlowPhase === "push_submitting"
  const isAwaitingPin = paymentFlowPhase === "awaiting_pin"
  const isLinkSubmitting = paymentFlowPhase === "link_submitting"

  const stopPushPolling = React.useCallback(() => {
    if (pushPollRef.current.intervalId) clearInterval(pushPollRef.current.intervalId)
    if (pushPollRef.current.timeoutId) clearTimeout(pushPollRef.current.timeoutId)
    pushPollRef.current.intervalId = undefined
    pushPollRef.current.timeoutId = undefined
  }, [])

  const startPushStatusPolling = React.useCallback(
    (transactionReference: string) => {
      stopPushPolling()
      pushPollRef.current.transactionReference = transactionReference
      setPushTxStatus("awaiting_pin")

      pushPollRef.current.intervalId = setInterval(async () => {
        try {
          const res = await fetch(`/api/merchants/${merchantId}/transactions/${transactionReference}`)
          if (!res.ok) return
          const tx = await res.json()
          setPushTxStatus(tx.status)
          if (tx.status === "success" || tx.status === "failed") {
            stopPushPolling()
            pushPollRef.current.transactionReference = undefined
            if (tx.status === "success") {
              toast({
                title: "Payment Successful",
                description: "The customer completed authorization on their phone.",
              })
              setRequestForm((prev) => ({ ...prev, amount: "", description: "" }))
            } else {
              toast({
                variant: "destructive",
                title: "Payment Failed",
                description: "The provider reported this payment did not complete.",
              })
            }
            setPaymentFlowPhase("idle")
          }
        } catch (err) {
          console.error("Push status polling error:", err)
        }
      }, 2000)

      pushPollRef.current.timeoutId = setTimeout(() => {
        stopPushPolling()
      }, 120_000)
    },
    [merchantId, stopPushPolling, toast]
  )

  React.useEffect(() => () => stopPushPolling(), [stopPushPolling])

  const handleModalOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true)
      if (
        pushPollRef.current.transactionReference &&
        pushTxStatus &&
        pushTxStatus !== "success" &&
        pushTxStatus !== "failed"
      ) {
        setPaymentFlowPhase("awaiting_pin")
      }
      return
    }
    onOpenChange(false)
  }

  const preventLockedModalDismiss = (e: Event) => {
    if (isFormLocked) e.preventDefault()
  }

  const copyText = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1400)
    toast({ title: "Copied", description: "Value copied to clipboard." })
  }

  const handleRequestPayment = async (mode: "push" | "link") => {
    if (isFormLocked) return

    const amountNum = parseFloat(requestForm.amount)
    if (isNaN(amountNum) || amountNum < 1) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid amount (minimum 1 ETB).",
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

    const phone = requestForm.payerPhone.trim()
    const isValidEthiopianPhone = /^(?:\+251|251|09)\d{7,10}$/.test(phone)
    if (!isValidEthiopianPhone) {
      toast({
        variant: "destructive",
        title: "Invalid Phone",
        description: "Please enter a valid Ethiopian phone number (e.g., 0912345678, +251..., or 251...).",
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

    setLastMode(mode)
    setGeneratedResult(null)
    setPushTxStatus(null)
    setPaymentFlowPhase(mode === "push" ? "push_submitting" : "link_submitting")

    const controller = new AbortController()
    const requestTimeoutId = setTimeout(() => controller.abort(), 90_000)

    try {
      const transactionId = `tx_${Math.random().toString(36).slice(2, 10)}`
      const timestamp = new Date().toISOString()
      const serviceDescription = requestForm.description || `Payment Request for Customer`
      const authToken = `demo_auth_${Math.random().toString(36).slice(2, 10)}`

      const payload = {
        merchantId,
        transactionId,
        userCredentials: { phone: requestForm.payerPhone, authToken },
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
        signal: controller.signal,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Request Failed",
          description: data?.error || "Please check the inputs and try again.",
        })
        setPaymentFlowPhase("idle")
        return
      }

      if (mode === "push") {
        const transactionReference = data?.transactionReference as string | undefined
        setGeneratedResult({ transactionReference })
        if (transactionReference) {
          setPaymentFlowPhase("awaiting_pin")
          startPushStatusPolling(transactionReference)
          toast({
            title: "USSD PIN Prompt Sent",
            description: "Ask the customer to authorize the payment on their phone.",
          })
        } else {
          setPaymentFlowPhase("idle")
        }
        return
      }

      setGeneratedResult({
        paymentUrl: data?.paymentUrl as string | undefined,
        customerPinToken: data?.token as string | undefined,
        transactionReference: data?.transactionReference as string | undefined,
      })
      setPaymentFlowPhase("idle")
      setRequestForm((prev) => ({ ...prev, amount: "", description: "" }))
      toast({
        title: "Payment Link Generated",
        description: "Share the secure payment link with your customer.",
      })
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError"
      toast({
        variant: "destructive",
        title: isAbort ? "Request Timed Out" : "Connection Error",
        description: isAbort
          ? "The provider did not respond in time. You can retry the push payment."
          : "Could not reach the payment provider. Please check your connection and try again.",
      })
      setPaymentFlowPhase("idle")
    } finally {
      clearTimeout(requestTimeoutId)
    }
  }

  if (!open) return null

  const formContent = (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-3 space-y-4">
          {!isMerchantApproved && (
            <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5" />
                <div>
                  <p className="font-medium text-xs text-rose-900">Account pending approval</p>
                  <p className="text-[10px] text-rose-700/80 leading-tight">Request Payment unlocks once your account is approved.</p>
                </div>
              </div>
            </div>
          )}

          <div className={`space-y-4 ${isFormLocked ? "pointer-events-none opacity-60" : ""}`}>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payment Method</Label>
              <RadioGroup
                defaultValue="BANK"
                value={requestForm.method}
                onValueChange={(val) => setRequestForm({ ...requestForm, method: val as "BANK" | "TELEBIRR" })}
                className="grid grid-cols-2 gap-2"
                disabled={isFormLocked}
              >
                <div className="relative">
                  <RadioGroupItem value="BANK" id="bank-modal" className="peer sr-only" />
                  <Label
                    htmlFor="bank-modal"
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-slate-100 bg-white p-2.5 hover:bg-slate-50 peer-data-[state=checked]:border-amber-600 [&:has([data-state=checked])]:border-amber-600 cursor-pointer transition-all min-h-[80px]"
                  >
                    <div className="w-10 h-10 flex items-center justify-center">
                      <img src="/niblogo.png" alt="Nib Bank" className="w-full h-full object-contain" />
                    </div>
                    <span className="mt-1 text-[10px] font-medium text-slate-700">Nib Bank</span>
                  </Label>
                </div>
                <div className="relative">
                  <RadioGroupItem value="TELEBIRR" id="telebirr-modal" className="peer sr-only" disabled />
                  <Label
                    htmlFor="telebirr-modal"
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-slate-100 bg-white p-2.5 opacity-70 transition-all min-h-[80px]"
                  >
                    <span className="flex items-center justify-center w-10 h-10 mb-1 rounded-lg bg-white border border-slate-200">
                      <img src="/telebirr.png" alt="Telebirr" width={32} height={32} className="object-contain" />
                    </span>
                    <span className="mt-1 text-[10px] font-medium text-slate-700">Telebirr</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Customer Phone
              </Label>
              <div className="relative group transition-all duration-200">
                <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0912345678"
                  className="h-10 rounded-lg border-slate-200 bg-white pl-9 text-sm shadow-sm"
                  required
                  disabled={isFormLocked}
                  value={requestForm.payerPhone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d+]/g, "")
                    if (val.length <= 13) setRequestForm({ ...requestForm, payerPhone: val })
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Amount
              </Label>
              <div className="relative group transition-all duration-200">
                <Wallet className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-10 rounded-lg border-slate-200 bg-white pl-9 font-medium text-sm text-slate-800 shadow-sm"
                  required
                  disabled={isFormLocked}
                  value={requestForm.amount}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === "" || /^([1-9]\d{0,5})(\.\d{0,2})?$/.test(val)) {
                      setRequestForm({ ...requestForm, amount: val })
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="description" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Description
                </Label>
                <span className="text-[9px] font-medium text-slate-400">{requestForm.description.length}/50</span>
              </div>
              <div className="relative group transition-all duration-200">
                <FileText className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Textarea
                  id="description"
                  placeholder="Order #1022"
                  className="min-h-[60px] max-h-[100px] rounded-lg border-slate-200 bg-white pl-9 py-2 text-sm resize-none shadow-sm"
                  disabled={isFormLocked}
                  value={requestForm.description}
                  onChange={(e) => {
                    if (e.target.value.length <= 50) {
                      setRequestForm({ ...requestForm, description: e.target.value })
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {generatedResult?.transactionReference && lastMode === "link" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Link Ready</p>
                <Badge className="rounded-md bg-slate-200/50 text-slate-700 text-[9px] font-medium border-0 px-1.5 py-0 h-4">
                  REF: {generatedResult.transactionReference}
                </Badge>
              </div>
              {generatedResult.paymentUrl && (
                <div className="group relative">
                  <Input
                    readOnly
                    value={generatedResult.paymentUrl}
                    className="h-8 rounded-md border-slate-200 bg-white pr-8 text-[10px] text-slate-600 font-mono shadow-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => generatedResult.paymentUrl && copyText(generatedResult.paymentUrl, "paymentUrl")}
                  >
                    {copied === "paymentUrl" ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 p-5 border-t border-slate-50 bg-white rounded-b-2xl">
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            onClick={() => handleRequestPayment("push")}
            className="h-10 rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm text-xs font-bold transition-all"
            disabled={isFormLocked || !isMerchantApproved || isAwaitingPin}
          >
            {isPushSubmitting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isPushSubmitting ? "Sending…" : isAwaitingPin ? "Awaiting PIN…" : "Push Payment"}
          </Button>
          <Button
            type="button"
            onClick={() => handleRequestPayment("link")}
            className="h-10 rounded-xl bg-white border border-amber-200 hover:bg-amber-50 text-amber-900 text-xs font-bold shadow-sm transition-all"
            disabled={isFormLocked || !isMerchantApproved}
          >
            {isLinkSubmitting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate Link
          </Button>
        </div>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleModalOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[85vh] rounded-t-2xl border-0 bg-white px-0 pb-0 flex flex-col"
          onInteractOutside={preventLockedModalDismiss}
          onEscapeKeyDown={preventLockedModalDismiss}
        >
          <div className="mx-auto mb-1 mt-1 h-1 w-10 shrink-0 rounded-full bg-slate-200" />
          <SheetHeader className="text-center px-4 pb-2 border-b border-slate-50 shrink-0">
            <div className="mx-auto w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center mb-1.5">
              <Wallet className="w-4 h-4 text-slate-600" />
            </div>
            <SheetTitle className="text-base font-bold text-slate-800 leading-tight">Request payment</SheetTitle>
            <SheetDescription className="text-slate-500 text-[10px] mt-1 leading-tight">
              USSD PIN prompt will be sent instantly
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0">{formContent}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent
        className="max-w-sm border border-slate-100 bg-white p-0 rounded-2xl shadow-sm flex flex-col max-h-[90vh] overflow-hidden"
        onInteractOutside={preventLockedModalDismiss}
        onEscapeKeyDown={preventLockedModalDismiss}
      >
        <DialogHeader className="text-center p-5 border-b border-slate-50 shrink-0">
          <div className="mx-auto w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center mb-2">
            <Wallet className="w-5 h-5 text-slate-600" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-800 leading-none">Request payment</DialogTitle>
          <DialogDescription className="text-slate-500 text-[11px] mt-1.5">
            USSD PIN prompt will be sent instantly
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  )
}
