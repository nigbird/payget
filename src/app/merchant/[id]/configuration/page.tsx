"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { z } from "zod"
import { Building2, Cable, CheckCircle2, ChevronLeft, Loader2, Save } from "lucide-react"

import type { Merchant } from "@/app/lib/db"
import { useMerchantPortalRole } from "@/components/merchant/merchant-portal-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"

const callbackUrlSchema = z
  .string()
  .min(1, { message: "Callback URL is required." })
  .url({ message: "Enter a valid URL including protocol (https://...)." })

type FormState = {
  companyName: string
  accountNumber: string
  callbackUrl: string
}

export default function MerchantConfigurationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const role = useMerchantPortalRole()
  const { toast } = useToast()

  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [form, setForm] = useState<FormState>({
    companyName: "",
    accountNumber: "",
    callbackUrl: "",
  })
  const [initialForm, setInitialForm] = useState<FormState>({
    companyName: "",
    accountNumber: "",
    callbackUrl: "",
  })
  const [enforceHttps, setEnforceHttps] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveConfirmed, setSaveConfirmed] = useState(false)

  useEffect(() => {
    const fetchMerchant = async () => {
      try {
        const response = await fetch(`/api/merchants/${id}`)
        if (response.ok) {
          const m = await response.json()
          setMerchant(m)
          const next = {
            companyName: m.name ?? "",
            accountNumber: m.accountNumber ?? "",
            callbackUrl: m.callbackUrl ?? "",
          }
          setForm(next)
          setInitialForm(next)
        }
      } catch (error) {
        console.error('Failed to fetch merchant:', error)
      }
    }
    fetchMerchant()
  }, [id])

  const canEdit = role === "account_admin"

  const hasChanges = useMemo(() => {
    return (
      form.companyName !== initialForm.companyName ||
      form.accountNumber !== initialForm.accountNumber ||
      form.callbackUrl !== initialForm.callbackUrl
    )
  }, [form, initialForm])

  const validate = () => {
    const nextErrors: Partial<Record<keyof FormState, string>> = {}

    if (!form.companyName.trim()) nextErrors.companyName = "Company Name is required."

    if (!form.accountNumber.trim()) {
      nextErrors.accountNumber = "Account Number is required."
    } else if (!/^[0-9A-Za-z-]{6,34}$/.test(form.accountNumber.trim())) {
      nextErrors.accountNumber = "Use 6-34 characters (letters, numbers, or hyphen)."
    }

    const parsed = callbackUrlSchema.safeParse(form.callbackUrl.trim())
    if (!parsed.success) {
      nextErrors.callbackUrl = parsed.error.issues[0]?.message ?? "Invalid Callback URL."
    } else if (enforceHttps) {
      const url = new URL(form.callbackUrl.trim())
      if (url.protocol !== "https:") nextErrors.callbackUrl = "HTTPS is required when enforcement is enabled."
    }

    return nextErrors
  }

  const handleSave = async () => {
    if (!canEdit || !merchant || !hasChanges || isSaving) return

    const nextErrors = validate()
    setErrors(nextErrors)
    setSaveConfirmed(false)
    if (Object.keys(nextErrors).length > 0) return

    try {
      setIsSaving(true)

      const response = await fetch(`/api/merchants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.companyName.trim(),
          accountNumber: form.accountNumber.trim(),
          callbackUrl: form.callbackUrl.trim(),
        })
      })

      if (response.ok) {
        const refreshed = await response.json()
        setMerchant(refreshed)
        const synced = {
          companyName: refreshed.name ?? "",
          accountNumber: refreshed.accountNumber ?? "",
          callbackUrl: refreshed.callbackUrl ?? "",
        }
        setForm(synced)
        setInitialForm(synced)
        setSaveConfirmed(true)
        toast({
          title: "Configuration saved",
          description: "Your business and integration settings were updated successfully.",
        })
        window.setTimeout(() => setSaveConfirmed(false), 2800)
      } else {
        throw new Error('Failed to save configuration')
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "Could not update your configuration at this time."
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!canEdit) {
    return (
      <Card className="mx-auto max-w-3xl rounded-3xl border-white/60 bg-white/70 shadow-lg backdrop-blur-sm">
        <CardContent className="p-8">
          <p className="font-semibold text-[#5b371f]">Only Account Admin can access Configuration settings.</p>
          <Link href={`/merchant/${id}`} className="mt-3 inline-flex items-center text-sm text-[#754319]">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-3xl border border-white/40 bg-white/65 p-5 md:p-7 shadow-xl backdrop-blur-md">
        <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Configuration</p>
        <h1 className="mt-2 text-2xl md:text-3xl font-bold text-[#5b371f]">Secure account settings</h1>
        <p className="mt-1 text-sm text-[#754319]/70">
          Manage your core business identity and webhook integration in one focused view.
        </p>
      </section>

      <Card className="rounded-3xl border-white/60 bg-white/70 shadow-xl backdrop-blur-sm">
        <CardContent className="p-6 md:p-8 space-y-7">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#754319]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#754319]">Business Information</h2>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                  placeholder="Acme Payments Ltd."
                  className="rounded-2xl border-white/60 bg-white/85"
                />
                <p className="text-xs text-muted-foreground">Public business identity shown on payment records and receipts.</p>
                {errors.companyName && <p className="text-xs text-rose-600">{errors.companyName}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountNumber">Account Number</Label>
                <Input
                  id="accountNumber"
                  value={form.accountNumber}
                  onChange={(e) => setForm((p) => ({ ...p, accountNumber: e.target.value }))}
                  placeholder="1234567890"
                  className="rounded-2xl border-white/60 bg-white/85"
                />
                <p className="text-xs text-muted-foreground">Settlement account reference used by gateway operations.</p>
                {errors.accountNumber && <p className="text-xs text-rose-600">{errors.accountNumber}</p>}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Cable className="h-4 w-4 text-[#754319]" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#754319]">Integration Settings</h2>
            </div>

            <div className="space-y-2">
              <Label htmlFor="callbackUrl">Callback URL (Webhook Endpoint)</Label>
              <Input
                id="callbackUrl"
                value={form.callbackUrl}
                onChange={(e) => setForm((p) => ({ ...p, callbackUrl: e.target.value }))}
                placeholder="https://merchant.example.com/api/payments/webhook"
                className="rounded-2xl border-white/60 bg-white/85"
              />
              <p className="text-xs text-muted-foreground">
                Payment notifications and status updates are delivered to this endpoint.
              </p>
              {errors.callbackUrl && <p className="text-xs text-rose-600">{errors.callbackUrl}</p>}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/80 p-4">
              <div>
                <p className="text-sm font-medium text-[#5b371f]">Enforce HTTPS (optional)</p>
                <p className="text-xs text-muted-foreground">Require secure HTTPS callback URLs only.</p>
              </div>
              <Switch checked={enforceHttps} onCheckedChange={setEnforceHttps} />
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/60 pt-4">
            <Button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="h-11 rounded-2xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-600/30 disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>

            {saveConfirmed && (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700">Configuration saved successfully</span>
              </div>
            )}

            <Link href={`/merchant/${id}`} className="inline-flex items-center text-xs font-medium text-[#754319]">
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Back to dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

