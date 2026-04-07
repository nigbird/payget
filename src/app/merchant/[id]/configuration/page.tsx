"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { z } from "zod"
import { Building2, CheckCircle2, ChevronLeft, Loader2, Save, User, Lock, Shield, Clock, Edit3, CheckCircle, AlertCircle, Eye, EyeOff, LogOut } from "lucide-react"
import { useSession } from "next-auth/react"

import type { Merchant } from "@/app/lib/db"
import { useMerchantPortalRole } from "@/components/merchant/merchant-portal-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

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
  email: string
  phoneNumber: string
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

type TabValue = "system" | "profile"

export default function MerchantConfigurationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const role = useMerchantPortalRole()
  const { toast } = useToast()
  const { update } = useSession()

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
    email: "",
    phoneNumber: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [initialProfileData, setInitialProfileData] = useState<ProfileData>({
    email: "",
    phoneNumber: "",
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
            email: m.email || "",
            phoneNumber: m.contactPhone || "",
          }))
          setInitialProfileData(prev => ({
            ...prev,
            email: m.email || "",
            phoneNumber: m.contactPhone || "",
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
      profileData.email !== initialProfileData.email ||
      profileData.phoneNumber !== initialProfileData.phoneNumber ||
      profileData.currentPassword ||
      profileData.newPassword ||
      profileData.confirmPassword
    )
  }, [profileData, initialProfileData])

  const validateSystem = () => {
    const nextErrors: Partial<Record<keyof FormData, string>> = {}

    if (!formData.companyName.trim()) nextErrors.companyName = "Company Name is required."

    if (!formData.accountNumber.trim()) {
      nextErrors.accountNumber = "Account Number is required."
    } else if (!/^[0-9A-Za-z-]{6,34}$/.test(formData.accountNumber.trim())) {
      nextErrors.accountNumber = "Use 6-34 characters (letters, numbers, or hyphen)."
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

    if (!profileData.email.trim()) {
      nextErrors.email = "Email is required."
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email.trim())) {
      nextErrors.email = "Enter a valid email address."
    }

    if (!profileData.phoneNumber.trim()) {
      nextErrors.phoneNumber = "Phone number is required."
    } else if (!/^\+?[\d\s\-\(\)]+$/.test(profileData.phoneNumber.trim())) {
      nextErrors.phoneNumber = "Enter a valid phone number."
    }

    if (profileData.newPassword) {
      if (!profileData.currentPassword) {
        nextErrors.currentPassword = "Current password is required to set a new password."
      }
      if (profileData.newPassword.length < 8) {
        nextErrors.newPassword = "Password must be at least 8 characters long."
      }
      if (profileData.newPassword !== profileData.confirmPassword) {
        nextErrors.confirmPassword = "Passwords do not match."
      }
    }

    return nextErrors
  }

  const getPasswordStrength = (password: string) => {
    if (!password) return { strength: 0, label: "", color: "" }
    
    let strength = 0
    if (password.length >= 8) strength++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++
    if (/\d/.test(password)) strength++
    if (/[^a-zA-Z\d]/.test(password)) strength++
    
    const labels = ["Weak", "Fair", "Good", "Strong"]
    const colors = ["rose", "amber", "yellow", "emerald"]
    
    return {
      strength: (strength / 4) * 100,
      label: labels[strength - 1] || "",
      color: colors[strength - 1] || "rose"
    }
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

  const handleSaveProfile = async () => {
    if (!canEdit || !merchant || !hasProfileChanges || isSaving) return

    const nextErrors = validateProfile()
    setErrors(nextErrors)
    setSaveConfirmed(false)
    if (Object.keys(nextErrors).length > 0) return

    try {
      setIsSaving(true)

      const updateData: any = {
        email: profileData.email.trim(),
        contactUsername: profileData.phoneNumber.trim(),
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
        await update({
          user: {
            email: refreshed.email,
          }
        })

        setProfileData(prev => ({
          ...prev,
          email: refreshed.email || prev.email,
          phoneNumber: refreshed.contactUsername || prev.phoneNumber,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }))
        setInitialProfileData(prev => ({
          ...prev,
          email: refreshed.email || prev.email,
          phoneNumber: refreshed.contactUsername || prev.phoneNumber,
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
      toast({ title: "Logo updated", description: "Your merchant logo will appear on hosted payment pages." })
    } catch (e: any) {
      toast({ variant: "destructive", title: "Logo upload failed", description: e?.message || "Try again." })
    } finally {
      setIsLogoUploading(false)
      setLogoInputKey((k) => k + 1)
    }
  }

  const handleLogoutOtherSessions = async () => {
    try {
      const response = await fetch(`/api/merchants/${id}/logout-sessions`, {
        method: 'POST'
      })
      
      if (response.ok) {
        toast({
          title: "Sessions terminated",
          description: "All other sessions have been logged out successfully.",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to logout sessions",
        description: "Could not terminate other sessions at this time."
      })
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
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-3xl border border-white/40 bg-white/65 p-5 md:p-7 shadow-xl backdrop-blur-md">
        <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Configuration</p>
        <h1 className="mt-2 text-2xl md:text-3xl font-bold text-[#5b371f]">Account Settings</h1>
        <p className="mt-1 text-sm text-[#754319]/70">
          Manage your system configuration and personal profile in one organized view.
        </p>
      </section>

      <Card className="rounded-3xl border-white/60 bg-white/70 shadow-xl backdrop-blur-sm overflow-hidden">
        <CardContent className="p-0">
          {/* Tab Navigation */}
          <div className="border-b border-white/40 bg-gradient-to-r from-white/80 to-white/60 px-6 py-4">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab("system")}
                className={`relative px-6 py-2.5 text-sm font-semibold rounded-2xl transition-all duration-200 ${
                  activeTab === "system"
                    ? "bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-600/30"
                    : "text-[#754319]/70 hover:text-[#5b371f] hover:bg-white/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  System Configuration
                </div>
              </button>
              <button
                onClick={() => setActiveTab("profile")}
                className={`relative px-6 py-2.5 text-sm font-semibold rounded-2xl transition-all duration-200 ${
                  activeTab === "profile"
                    ? "bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-600/30"
                    : "text-[#754319]/70 hover:text-[#5b371f] hover:bg-white/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Profile & Security
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
                            ${transactionLimits.daily.toLocaleString()}
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
                            ${transactionLimits.daily.toLocaleString()}
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
                            ${transactionLimits.maxTransaction.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
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
                          onChange={(e) => setFormData((p) => ({ ...p, companyName: e.target.value }))}
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
                          value={formData.accountNumber}
                          onChange={(e) => setFormData((p) => ({ ...p, accountNumber: e.target.value }))}
                          placeholder="1234567890"
                          className="rounded-2xl border-white/60 bg-white/85"
                        />
                        <p className="text-xs text-muted-foreground">Settlement account reference used by gateway operations.</p>
                        {errors.accountNumber && <p className="text-xs text-rose-600">{errors.accountNumber}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>

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
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          value={profileData.email}
                          onChange={(e) => setProfileData((p) => ({ ...p, email: e.target.value }))}
                          placeholder="john@example.com"
                          className="rounded-2xl border-white/60 bg-white/85"
                        />
                        <p className="text-xs text-muted-foreground">Used for notifications and account recovery.</p>
                        {errors.email && <p className="text-xs text-rose-600">{errors.email}</p>}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phoneNumber">Phone Number</Label>
                        <Input
                          id="phoneNumber"
                          type="tel"
                          value={profileData.phoneNumber}
                          onChange={(e) => setProfileData((p) => ({ ...p, phoneNumber: e.target.value }))}
                          placeholder="+1 (555) 000-0000"
                          className="rounded-2xl border-white/60 bg-white/85"
                        />
                        <p className="text-xs text-muted-foreground">Used for account verification and support.</p>
                        {errors.phoneNumber && <p className="text-xs text-rose-600">{errors.phoneNumber}</p>}
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
                              className="rounded-2xl border-white/60 bg-white/85"
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
                            className="rounded-2xl border-white/60 bg-white/85 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                            className="absolute right-3 top-3 text-[#754319]/60 hover:text-[#5b371f]"
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
                            className="rounded-2xl border-white/60 bg-white/85 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                            className="absolute right-3 top-3 text-[#754319]/60 hover:text-[#5b371f]"
                          >
                            {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {profileData.newPassword && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Password Strength</span>
                              <span className={`text-xs font-medium ${
                                getPasswordStrength(profileData.newPassword).color === "rose" ? "text-rose-600" :
                                getPasswordStrength(profileData.newPassword).color === "amber" ? "text-amber-600" :
                                getPasswordStrength(profileData.newPassword).color === "yellow" ? "text-yellow-600" :
                                "text-emerald-600"
                              }`}>
                                {getPasswordStrength(profileData.newPassword).label}
                              </span>
                            </div>
                            <Progress 
                              value={getPasswordStrength(profileData.newPassword).strength} 
                              className="h-1.5"
                            />
                          </div>
                        )}
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
                            className="rounded-2xl border-white/60 bg-white/85 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                            className="absolute right-3 top-3 text-[#754319]/60 hover:text-[#5b371f]"
                          >
                            {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {errors.confirmPassword && <p className="text-xs text-rose-600">{errors.confirmPassword}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Session Management Card */}
                <Card className="rounded-2xl border-white/60 bg-white/80 shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg text-[#5b371f]">
                      <Shield className="h-5 w-5 text-[#754319]" />
                      Session Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/80 p-4">
                      <div>
                        <p className="text-sm font-medium text-[#5b371f]">Active Sessions</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last updated: {new Date().toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLogoutOtherSessions}
                        className="border-[#754319]/30 text-[#754319] hover:bg-[#754319]/10"
                      >
                        <LogOut className="mr-2 h-3 w-3" />
                        Log out others
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/60 pt-6 mt-6">
              <Button
                type="button"
                onClick={activeTab === "system" ? handleSaveSystem : handleSaveProfile}
                disabled={(activeTab === "system" ? !hasSystemChanges : !hasProfileChanges) || isSaving}
                className="h-11 rounded-2xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-600/30 disabled:opacity-60"
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

