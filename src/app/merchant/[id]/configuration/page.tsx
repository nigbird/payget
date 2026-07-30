"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { z } from "zod"
import { Building2, CheckCircle2, ChevronLeft, Loader2, Save, User, Lock, Shield, Edit3, CheckCircle, AlertCircle, Eye, EyeOff, Gift, QrCode, RefreshCw, Download, RotateCw, ListChecks } from "lucide-react"
import { CashbackTab } from "@/components/merchant/cashback-tab"
import { EligibleCustomersTab } from "@/components/merchant/eligible-customers-tab"
import { useAuth } from "@/lib/auth-context"
import { QRCodeCanvas } from "qrcode.react"
import { Switch } from "@/components/ui/switch"
import {
  downloadQrFromCanvasElement,
  downloadQrFromSvgElement,
  triggerBlobDownload,
} from "@/lib/qr-download"
import { resolveAbsoluteImageUrl, useQrLogoImageSettings } from "@/lib/qr-logo"

import type { Merchant } from "@/lib/db"
import { useMerchantPortalRole } from "@/components/merchant/merchant-portal-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { PasswordStrength } from "@/components/auth/password-strength"
import { validatePassword } from "@/lib/password-policy"
import {
  sanitizeAccountNumberInput,
  getAccountNumberValidationError,
} from "@/lib/account-number"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const callbackUrlSchema = z
  .string()
  .min(1, { message: "Callback URL is required." })
  .url({ message: "Enter a valid URL including protocol (https://...)." })

type FormData = {
  companyName: string
  accountNumber: string
  callbackUrl: string
}

type ProfileData = {
  username: string
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

type TabValue = "system" | "profile" | "cashback" | "eligibility"

const QR_DISPLAY_SIZE = 200
const QR_DOWNLOAD_SIZE = 1024

export default function MerchantConfigurationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const role = useMerchantPortalRole()
  const { toast } = useToast()
  const { refresh } = useAuth()

  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [logoInputKey, setLogoInputKey] = useState(0)
  const [formData, setFormData] = useState<FormData>({
    companyName: "",
    accountNumber: "",
    callbackUrl: "",
  })
  const [initialFormData, setInitialFormData] = useState<FormData>({
    companyName: "",
    accountNumber: "",
    callbackUrl: "",
  })
  const [profileData, setProfileData] = useState<ProfileData>({
    username: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [initialProfileData, setInitialProfileData] = useState<ProfileData>({
    username: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [activeTab, setActiveTab] = useState<TabValue>("system")
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData | keyof ProfileData, string>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveConfirmed, setSaveConfirmed] = useState(false)
  const [editingLimits, setEditingLimits] = useState(false)
  const [transactionLimits, setTransactionLimits] = useState({
    daily: 5000,
    maxTransaction: 1000,
  })
  const [qrConfig, setQrConfig] = useState<{
    qrEnabled: boolean
    qrLogoUrl: string | null
    merchantLogoUrl?: string | null
    activeQr: { token: string } | null
  }>({
    qrEnabled: false,
    qrLogoUrl: null,
    activeQr: null
  })
  const [isQrLoading, setIsQrLoading] = useState(false)
  const [isDownloadingQr, setIsDownloadingQr] = useState(false)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)

  const qrUrl = useMemo(() => {
    if (!qrConfig?.activeQr?.token) return ""
    const origin = (
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "")
    )
    return `${origin}/pay/merchant/${qrConfig.activeQr.token}`
  }, [qrConfig?.activeQr?.token])

  const isQrLogoEnabled = !!qrConfig.qrLogoUrl

  const qrLogoSrc = useMemo(() => {
    if (!isQrLogoEnabled) return null
    if (qrConfig.qrLogoUrl === "use-merchant-logo") {
      return merchant?.logoUrl ?? qrConfig.merchantLogoUrl ?? null
    }
    return qrConfig.qrLogoUrl || (merchant?.logoUrl ?? qrConfig.merchantLogoUrl ?? null)
  }, [isQrLogoEnabled, qrConfig.qrLogoUrl, qrConfig.merchantLogoUrl, merchant?.logoUrl])

  const qrDisplayLogoSettings = useQrLogoImageSettings(qrLogoSrc)

  useEffect(() => {
    const fetchQrConfig = async () => {
      try {
        const response = await fetch(`/api/merchants/${id}/qr`)
        if (response.ok) {
          const data = await response.json()
          setQrConfig(data)
        }
      } catch (error) {
        console.error('Failed to fetch QR config:', error)
      }
    }
    fetchQrConfig()
  }, [id])

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
          setFormData(next)
          setInitialFormData(next)
          setTransactionLimits({
            daily: m.dailyLimit || 5000,
            maxTransaction: m.transactionLimit || 1000,
          })
          setProfileData(prev => ({
            ...prev,
            username: m.contactUsername || "",
          }))
          setInitialProfileData(prev => ({
            ...prev,
            username: m.contactUsername || "",
          }))
        }
      } catch (error) {
        console.error('Failed to fetch merchant:', error)
      }
    }
    fetchMerchant()
  }, [id])

  const canEdit = role === "account_admin"

  const hasSystemChanges = useMemo(() => {
    return (
      formData.companyName !== initialFormData.companyName ||
      formData.accountNumber !== initialFormData.accountNumber ||
      formData.callbackUrl !== initialFormData.callbackUrl
    )
  }, [formData, initialFormData])

  const hasProfileChanges = useMemo(() => {
    return (
      profileData.username !== initialProfileData.username ||
      profileData.currentPassword ||
      profileData.newPassword ||
      profileData.confirmPassword
    )
  }, [profileData, initialProfileData])

  const validateSystem = () => {
    const nextErrors: Partial<Record<keyof FormData, string>> = {}

    if (!formData.companyName.trim()) nextErrors.companyName = "Company Name is required."

    const accountNumberError = getAccountNumberValidationError(formData.accountNumber)
    if (accountNumberError) {
      nextErrors.accountNumber = accountNumberError
    }

    // callbackUrl is optional for this page and not currently editable in the UI.
    if (formData.callbackUrl.trim()) {
      const parsed = callbackUrlSchema.safeParse(formData.callbackUrl.trim())
      if (!parsed.success) {
        nextErrors.callbackUrl = parsed.error.issues[0]?.message ?? "Invalid Callback URL."
      }
    }

    return nextErrors
  }

  const validateProfile = () => {
    const nextErrors: Partial<Record<keyof ProfileData, string>> = {}

    const username = profileData.username.trim()
    if (!username) {
      nextErrors.username = "Username is required."
    } else {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)
      const isPhone = /^\+?[\d\s\-\(\)]+$/.test(username)
      if (!isEmail && !isPhone) {
        nextErrors.username = "Use a valid email address or phone number."
      }
    }

    if (profileData.newPassword) {
      if (!profileData.currentPassword) {
        nextErrors.currentPassword = "Current password is required to set a new password."
      }
      
      const policy = validatePassword(profileData.newPassword)
      if (!policy.valid) {
        nextErrors.newPassword = policy.errors[0] ?? "Password does not meet policy requirements."
      }
      
      if (profileData.newPassword !== profileData.confirmPassword) {
        nextErrors.confirmPassword = "Passwords do not match."
      }
    }

    return nextErrors
  }

  const handleSaveSystem = async () => {
    if (!canEdit || !merchant || !hasSystemChanges || isSaving) return

    const nextErrors = validateSystem()
    setErrors(nextErrors)
    setSaveConfirmed(false)
    if (Object.keys(nextErrors).length > 0) return

    try {
      setIsSaving(true)

      const updatePayload: any = {
        name: formData.companyName.trim(),
        accountNumber: formData.accountNumber.trim(),
      }

      if (formData.callbackUrl.trim()) {
        updatePayload.callbackUrl = formData.callbackUrl.trim()
      }

      const response = await fetch(`/api/merchants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      })

      if (response.ok) {
        const refreshed = await response.json()
        setMerchant(refreshed)
        const synced = {
          companyName: refreshed.name ?? "",
          accountNumber: refreshed.accountNumber ?? "",
          callbackUrl: refreshed.callbackUrl ?? "",
        }
        setFormData(synced)
        setInitialFormData(synced)
        setSaveConfirmed(true)
        toast({
          title: "System configuration saved",
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

  const fetchMerchantProfile = async (): Promise<Merchant | null> => {
    try {
      const response = await fetch(`/api/merchants/${id}`)
      if (!response.ok) return null
      const m = (await response.json()) as Merchant
      setMerchant(m)
      return m
    } catch {
      return null
    }
  }

  const handleQrAction = async (action: "generate" | "regenerate" | "toggle-logo") => {
    if (!canEdit || isQrLoading) return
    setIsQrLoading(true)

    try {
      const payload: Record<string, unknown> = {}
      if (action === "generate") {
        payload.qrEnabled = true
      } else if (action === "regenerate") {
        payload.regenerate = true
      } else if (action === "toggle-logo") {
        if (qrConfig.qrLogoUrl) {
          payload.qrLogoUrl = null
        } else {
          const profile = merchant?.logoUrl ? merchant : await fetchMerchantProfile()
          const logoUrl = profile?.logoUrl
          if (!logoUrl) {
            toast({
              variant: "destructive",
              title: "No merchant logo",
              description: "Upload a business logo in your profile before enabling it on the QR code.",
            })
            return
          }
          payload.qrLogoUrl = "use-merchant-logo"
        }
      }

      const response = await fetch(`/api/merchants/${id}/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const data = await response.json()
        if (action === "regenerate") {
          setQrConfig(prev => ({ ...prev, activeQr: data.activeQr }))
        } else {
          // Refetch to get latest state
          const refreshed = await fetch(`/api/merchants/${id}/qr`).then(r => r.json())
          setQrConfig(refreshed)
        }
        toast({
          title: action === "regenerate" ? "QR Code Regenerated" : "QR Configuration Updated",
          description: "Your payment QR code settings have been updated.",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "QR Action Failed",
        description: "Could not process QR request."
      })
    } finally {
      setIsQrLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!canEdit || !merchant || !hasProfileChanges || isSaving) return

    const nextErrors = validateProfile()
    setErrors(nextErrors)
    setSaveConfirmed(false)
    if (Object.keys(nextErrors).length > 0) return

    try {
      setIsSaving(true)

      const updateData: any = {
        contactUsername: profileData.username.trim(),
      }

      if (profileData.newPassword) {
        updateData.currentPassword = profileData.currentPassword
        updateData.newPassword = profileData.newPassword
      }

      const response = await fetch(`/api/merchants/${id}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      if (response.ok) {
        const refreshed = await response.json()
        
        // Update session to reflect new email or name if changed
        await refresh()

        setProfileData(prev => ({
          ...prev,
          username: refreshed.contactUsername || prev.username,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }))
        setInitialProfileData(prev => ({
          ...prev,
          username: refreshed.contactUsername || prev.username,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }))
        setSaveConfirmed(true)
        toast({
          title: "Profile updated",
          description: "Your profile and security settings were updated successfully.",
        })
        window.setTimeout(() => setSaveConfirmed(false), 2800)
      } else {
        throw new Error('Failed to update profile')
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not update your profile at this time."
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogoUpload = async (file: File) => {
    if (!merchant) return
    setIsLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const up = await fetch("/api/uploads/merchant-logo", { method: "POST", body: fd })
      const upData = await up.json().catch(() => ({}))
      if (!up.ok) throw new Error(upData?.error || "Logo upload failed")

      const logoUrl = upData.url as string
      const res = await fetch(`/api/merchants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Could not save logo")

      setMerchant(data)
      if (qrConfig.qrLogoUrl) {
        const refreshed = await fetch(`/api/merchants/${id}/qr`).then((r) => r.json())
        setQrConfig(refreshed)
      }
      toast({ title: "Logo updated", description: "Your merchant logo will appear on hosted payment pages." })
    } catch (e: any) {
      toast({ variant: "destructive", title: "Logo upload failed", description: e?.message || "Try again." })
    } finally {
      setIsLogoUploading(false)
      setLogoInputKey((k) => k + 1)
    }
  }

  const downloadQr = useCallback(async () => {
    if (!merchant) return

    const fileName = `QR-${merchant.name.replace(/[^\w.-]+/g, "_")}.png`
    setIsDownloadingQr(true)

    try {
      const qrElement = document.getElementById("merchant-qr")

      if (qrElement instanceof HTMLCanvasElement) {
        await downloadQrFromCanvasElement(qrElement, {
          fileName,
          outputSize: QR_DOWNLOAD_SIZE,
          waitMs: qrDisplayLogoSettings ? 600 : 100,
        })
        return
      }

      if (qrElement instanceof SVGSVGElement) {
        await downloadQrFromSvgElement(qrElement, {
          fileName,
          outputSize: QR_DOWNLOAD_SIZE,
        })
        return
      }

      const response = await fetch(`/api/merchants/${id}/qr/download`)
      if (!response.ok) {
        throw new Error("Server export failed")
      }
      triggerBlobDownload(await response.blob(), fileName)
    } catch (error) {
      console.error("QR download failed:", error)
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "Could not export a scannable QR image. Please try again.",
      })
    } finally {
      setIsDownloadingQr(false)
    }
  }, [merchant, qrDisplayLogoSettings, id, toast])

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
    <div className="mx-auto max-w-5xl space-y-5 pb-6">
      <section className="rounded-3xl border border-white/40 bg-white/65 p-4 md:p-7 shadow-xl backdrop-blur-md">
        <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Configuration</p>
        <h1 className="mt-2 text-2xl md:text-3xl font-bold text-[#5b371f]">Account Settings</h1>
        <p className="mt-1 text-sm text-[#754319]/70">
          Manage your system configuration and personal profile in one organized view.
        </p>
      </section>

      <Card className="rounded-3xl border-white/60 bg-white/70 shadow-xl backdrop-blur-sm overflow-hidden">
        <CardContent className="p-0">
          {/* Tab Navigation */}
          <div className="border-b border-white/40 bg-gradient-to-r from-white/80 to-white/60 px-4 md:px-6 py-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab("system")}
                className={`relative min-h-11 px-4 md:px-6 py-2.5 text-sm font-semibold rounded-2xl transition-all duration-200 ${
                  activeTab === "system"
                    ? "bg-gradient-to-r from-[#f8b513] to-[#754319] border border-white/20 text-white shadow-sm shadow-amber-950/15 hover:opacity-95"
                    : "text-[#754319]/70 hover:text-[#5b371f] hover:bg-white/50"
                }`}
                title="System Configuration"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span className="hidden sm:inline">System Configuration</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("profile")}
                className={`relative min-h-11 px-4 md:px-6 py-2.5 text-sm font-semibold rounded-2xl transition-all duration-200 ${
                  activeTab === "profile"
                    ? "bg-gradient-to-r from-[#f8b513] to-[#754319] border border-white/20 text-white shadow-sm shadow-amber-950/15 hover:opacity-95"
                    : "text-[#754319]/70 hover:text-[#5b371f] hover:bg-white/50"
                }`}
                title="Profile & Security"
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">Profile & Security</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("cashback")}
                className={`relative min-h-11 px-4 md:px-6 py-2.5 text-sm font-semibold rounded-2xl transition-all duration-200 ${
                  activeTab === "cashback"
                    ? "bg-gradient-to-r from-[#f8b513] to-[#754319] border border-white/20 text-white shadow-sm shadow-amber-950/15 hover:opacity-95"
                    : "text-[#754319]/70 hover:text-[#5b371f] hover:bg-white/50"
                }`}
                title="Cashback"
              >
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  <span className="hidden sm:inline">Cashback</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("eligibility")}
                className={`relative min-h-11 px-4 md:px-6 py-2.5 text-sm font-semibold rounded-2xl transition-all duration-200 ${
                  activeTab === "eligibility"
                    ? "bg-gradient-to-r from-[#f8b513] to-[#754319] border border-white/20 text-white shadow-sm shadow-amber-950/15 hover:opacity-95"
                    : "text-[#754319]/70 hover:text-[#5b371f] hover:bg-white/50"
                }`}
                title="Eligible Customers"
              >
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  <span className="hidden sm:inline">Eligible Customers</span>
                </div>
              </button>
            </div>
          </div>

          <div className="p-6 md:p-8">
            {activeTab === "system" && (
              <div className="space-y-6">
                {/* Transaction Limits Card */}
                <Card className="rounded-2xl border-[#f8b513]/30 bg-gradient-to-br from-[#fff9ef] to-[#fdf1d4] shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg text-[#5b371f]">
                      <Shield className="h-5 w-5 text-[#754319]" />
                      Transaction Limits
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium text-[#5b371f]">Daily Limit</Label>
                          <span className="text-sm font-bold text-[#5b371f]">
                            ETB {transactionLimits.daily.toLocaleString()}
                          </span>
                        </div>
                        <Progress
                          value={(transactionLimits.daily / 10000) * 100}
                          className="h-2 bg-white/60"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium text-[#5b371f]">Daily Max</Label>
                          <span className="text-sm font-bold text-[#5b371f]">
                            ETB {transactionLimits.daily.toLocaleString()}
                          </span>
                        </div>
                        <Progress
                          value={(transactionLimits.daily / 10000) * 100}
                          className="h-2 bg-white/60"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium text-[#5b371f]">Max Transaction</Label>
                          <span className="text-sm font-bold text-[#5b371f]">
                            ETB {transactionLimits.maxTransaction.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-[1fr,2fr] gap-6">
                  {/* QR Code Section */}
                  <Card className="rounded-2xl border-white/60 bg-white/80 shadow-sm flex flex-col items-center justify-center p-6 text-center">
                    <CardHeader className="pb-4 w-full text-left p-0 mb-4">
                      <CardTitle className="flex items-center gap-2 text-lg text-[#5b371f]">
                        <QrCode className="h-5 w-5 text-[#754319]" />
                        Payment QR
                      </CardTitle>
                    </CardHeader>
                    
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4 w-full">
                      {qrConfig.activeQr ? (
                        <>
                          <div className="relative p-4 bg-white rounded-3xl shadow-md border border-[#f8b513]/20 group">
                            <QRCodeCanvas
                              key={`${qrConfig.activeQr?.token ?? "qr"}-${qrDisplayLogoSettings?.src ?? "plain"}`}
                              id="merchant-qr"
                              value={qrUrl}
                              size={QR_DISPLAY_SIZE}
                              level="H"
                              includeMargin
                              marginSize={4}
                              bgColor="#FFFFFF"
                              fgColor="#000000"
                              imageSettings={qrDisplayLogoSettings}
                            />
                            <button
                              type="button"
                              onClick={downloadQr}
                              disabled={isDownloadingQr}
                              title="Download QR"
                              className="absolute -top-3 -right-3 h-10 w-10 rounded-full bg-white border border-[#f8b513] text-[#f8b513] shadow-lg flex items-center justify-center hover:bg-amber-50 transition-colors disabled:opacity-60"
                            >
                              {isDownloadingQr ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <Download className="h-5 w-5" />
                              )}
                            </button>
                          </div>

                          <div className="flex items-center justify-between w-full px-2 pt-4 border-t border-white/40">
                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={isQrLogoEnabled} 
                                onCheckedChange={() => handleQrAction("toggle-logo")}
                                disabled={isQrLoading}
                              />
                              <span className="text-xs font-medium text-[#754319]">Enable Logo</span>
                            </div>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowRegenConfirm(true)}
                              disabled={isQrLoading}
                              className="h-8 text-[11px] font-bold text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-1.5"
                            >
                              <RefreshCw className={`h-3 w-3 ${isQrLoading ? 'animate-spin' : ''}`} />
                              Regenerate
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 space-y-4">
                          <div className="h-20 w-20 rounded-full bg-amber-50 flex items-center justify-center">
                            <QrCode className="h-10 w-10 text-amber-200" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-slate-400">No QR Code generated</p>
                            <p className="text-[11px] text-slate-300">Generate a unique QR for instant payments</p>
                          </div>
                          <Button
                            onClick={() => handleQrAction("generate")}
                            disabled={isQrLoading}
                            className="rounded-2xl border border-white/20 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 hover:opacity-95"
                          >
                            {isQrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                            Generate QR Code
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Business Information Card */}
                  <Card className="rounded-2xl border-white/60 bg-white/80 shadow-sm">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-lg text-[#5b371f]">
                        <Building2 className="h-5 w-5 text-[#754319]" />
                        Business Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="companyName">Company Name</Label>
                          <Input
                            id="companyName"
                            value={formData.companyName}
                            maxLength={50}
                            onChange={(e) => setFormData((p) => ({ ...p, companyName: e.target.value }))}
                            placeholder="Acme Payments Ltd."
                            className="h-11 rounded-2xl border-white/60 bg-white/85"
                          />
                          <p className="text-xs text-muted-foreground">Public business identity shown on payment records and receipts.</p>
                          {errors.companyName && <p className="text-xs text-rose-600">{errors.companyName}</p>}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="accountNumber">Account Number</Label>
                          <Input
                            id="accountNumber"
                            inputMode="numeric"
                            maxLength={13}
                            value={formData.accountNumber}
                            onChange={(e) =>
                              setFormData((p) => ({
                                ...p,
                                accountNumber: sanitizeAccountNumberInput(e.target.value),
                              }))
                            }
                            placeholder="7000123456789"
                            className="h-11 rounded-2xl border-white/60 bg-white/85"
                          />
                          <p className="text-xs text-muted-foreground">Must start with 7000, digits only, exactly 13 characters.</p>
                          {errors.accountNumber && <p className="text-xs text-rose-600">{errors.accountNumber}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

              </div>
            )}

            {activeTab === "profile" && (
              <div className="space-y-6">
                {/* Profile Information Card */}
                <Card className="rounded-2xl border-white/60 bg-white/80 shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg text-[#5b371f]">
                      <User className="h-5 w-5 text-[#754319]" />
                      Profile Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="username">Email or Phone</Label>
                        <Input
                          id="username"
                          value={profileData.username}
                          maxLength={50}
                          onChange={(e) => setProfileData((p) => ({ ...p, username: e.target.value }))}
                          placeholder="email@example.com or 0912345678"
                          className="h-11 rounded-2xl border-white/60 bg-white/85"
                        />
                        <p className="text-xs text-muted-foreground">This is your login username and can be either email or phone.</p>
                        {errors.username && <p className="text-xs text-rose-600">{errors.username}</p>}
                      </div>
                      </div>

                      <div className="rounded-2xl border border-[#754319]/10 bg-white/70 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#754319]/70">Merchant logo</p>
                        <p className="mt-1 text-xs text-muted-foreground">Displayed on hosted payment pages and receipts.</p>

                        <div className="mt-4 flex items-center gap-4">
                          <div className="h-14 w-14 rounded-2xl bg-white ring-1 ring-[#754319]/10 overflow-hidden flex items-center justify-center">
                            {merchant?.logoUrl ? (
                              <Image
                                src={merchant.logoUrl}
                                alt={merchant.name ?? "Merchant logo"}
                                width={56}
                                height={56}
                                className="h-14 w-14 object-cover"
                              />
                            ) : (
                              <span className="text-sm font-black tracking-wide text-[#5b371f]">—</span>
                            )}
                          </div>

                          <div className="flex-1 space-y-2">
                            <Input
                              key={logoInputKey}
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/webp"
                              disabled={!canEdit || isLogoUploading}
                              className="h-11 rounded-2xl border-white/60 bg-white/85"
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) void handleLogoUpload(f)
                              }}
                            />
                            <p className="text-[11px] text-muted-foreground">
                              {canEdit ? "PNG / JPG / WEBP, up to 2MB." : "Only account admins can update the logo."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Security Settings Card */}
                <Card className="rounded-2xl border-white/60 bg-white/80 shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg text-[#5b371f]">
                      <Lock className="h-5 w-5 text-[#754319]" />
                      Security Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <div className="relative">
                          <Input
                            id="currentPassword"
                            type={showPasswords.current ? "text" : "password"}
                            value={profileData.currentPassword}
                            onChange={(e) => setProfileData((p) => ({ ...p, currentPassword: e.target.value }))}
                            placeholder="Enter current password"
                            className="h-11 rounded-2xl border-white/60 bg-white/85 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#754319]/60 hover:text-[#5b371f]"
                          >
                            {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {errors.currentPassword && <p className="text-xs text-rose-600">{errors.currentPassword}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <div className="relative">
                          <Input
                            id="newPassword"
                            type={showPasswords.new ? "text" : "password"}
                            value={profileData.newPassword}
                            onChange={(e) => setProfileData((p) => ({ ...p, newPassword: e.target.value }))}
                            placeholder="Enter new password"
                            className="h-11 rounded-2xl border-white/60 bg-white/85 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#754319]/60 hover:text-[#5b371f]"
                          >
                            {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {profileData.newPassword && <PasswordStrength password={profileData.newPassword} />}
                        {errors.newPassword && <p className="text-xs text-rose-600">{errors.newPassword}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <div className="relative">
                          <Input
                            id="confirmPassword"
                            type={showPasswords.confirm ? "text" : "password"}
                            value={profileData.confirmPassword}
                            onChange={(e) => setProfileData((p) => ({ ...p, confirmPassword: e.target.value }))}
                            placeholder="Confirm new password"
                            className="h-11 rounded-2xl border-white/60 bg-white/85 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#754319]/60 hover:text-[#5b371f]"
                          >
                            {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {errors.confirmPassword && <p className="text-xs text-rose-600">{errors.confirmPassword}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "cashback" && (
              <CashbackTab merchantId={id} />
            )}

            {activeTab === "eligibility" && (
              <EligibleCustomersTab merchantId={id} />
            )}

            {/* Action Buttons */}
            {activeTab !== "cashback" && activeTab !== "eligibility" && (
            <div className="mt-6 flex flex-col gap-3 border-t border-white/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                onClick={activeTab === "system" ? handleSaveSystem : handleSaveProfile}
                disabled={(activeTab === "system" ? !hasSystemChanges : !hasProfileChanges) || isSaving}
                className="rounded-2xl border border-white/20 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 hover:opacity-95 disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>

              {saveConfirmed && (
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">
                    {activeTab === "system" ? "System configuration saved" : "Profile updated"} successfully
                  </span>
                </div>
              )}

              <Link href={`/merchant/${id}`} className="inline-flex items-center text-xs font-medium text-[#754319]">
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Back to dashboard
              </Link>
            </div>
            )}
          </div>
        </CardContent>
      </Card>
      <AlertDialog open={showRegenConfirm} onOpenChange={setShowRegenConfirm}>
        <AlertDialogContent className="rounded-2xl border-none bg-white shadow-2xl">
          <AlertDialogHeader className="items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center">
              <RotateCw className="w-7 h-7 text-rose-600" />
            </div>
            <AlertDialogTitle className="text-xl font-bold text-slate-900">Regenerate QR Code?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              This will permanently invalidate the existing QR code. All printed copies will stop working immediately and cannot be reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-row gap-3 pt-2">
            <AlertDialogCancel className="flex-1 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleQrAction("regenerate")}
              className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
            >
              Yes, Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

