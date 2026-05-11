"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { Eye, EyeOff, KeyRound, Loader2, Shield, UserCircle2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordStrength } from "@/components/auth/password-strength"
import { validatePassword } from "@/lib/password-policy"

type SessionUser = {
  name?: string | null
  email?: string | null
  role?: string
  firstLogin?: boolean
}

export default function AdminProfilePage() {
  const { data: session, update } = useSession()
  const user = session?.user as SessionUser | undefined

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setSuccessMessage(null)

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setFormError("Fill in every password field.")
      return
    }

    const policy = validatePassword(form.newPassword)
    if (!policy.valid) {
      setFormError(policy.errors[0] ?? "Password does not meet the required policy.")
      return
    }

    if (form.newPassword !== form.confirmPassword) {
      setFormError("New password and confirmation must match.")
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to change password" }))
        setFormError(error?.error ?? "Could not update your password.")
        return
      }

      await update({ ...session, user: { ...session?.user, firstLogin: false } })
      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      })
      setSuccessMessage("Password updated successfully. You remain signed in on this device.")
    } catch {
      setFormError("Could not reach the password service. Try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-[#F1E7D0] bg-gradient-to-br from-[#FFFDF7] to-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#754319]/70">Account</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1F2937]">Profile settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#6B7280]">
          Review your admin account details and update your password without leaving the admin console.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.25fr]">
        <Card className="rounded-[24px] border-[#F1E7D0] bg-white">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-[#F1E7D0] bg-[#FFF8E8] p-3 text-[#754319]">
                <UserCircle2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl text-[#1F2937]">Admin account</CardTitle>
                <CardDescription>Signed-in profile details for this workspace.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-[20px] border border-[#F1E7D0] bg-[#FFFDF7] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#754319]/60">Full name</div>
              <div className="mt-2 text-sm font-medium text-slate-900">{user?.name || "Not available"}</div>
            </div>

            <div className="rounded-[20px] border border-[#F1E7D0] bg-[#FFFDF7] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#754319]/60">Email</div>
              <div className="mt-2 text-sm font-medium text-slate-900">{user?.email || "Not available"}</div>
            </div>

            <div className="rounded-[20px] border border-[#F1E7D0] bg-[#FFFDF7] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#754319]/60">Role</div>
              <div className="mt-2 flex items-center gap-2">
                <Badge className="rounded-full bg-[#754319]/10 px-3 py-1 text-[#754319] hover:bg-[#754319]/10">
                  {user?.role || "STAFF"}
                </Badge>
                {user?.firstLogin ? (
                  <Badge variant="secondary" className="rounded-full">
                    Password update pending
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-[#F1E7D0] bg-white">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-[#F1E7D0] bg-[#FFF8E8] p-3 text-[#754319]">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl text-[#1F2937]">Security</CardTitle>
                <CardDescription>Change your password while staying inside the admin area.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    value={form.currentPassword}
                    onChange={(event) => {
                      setFormError(null)
                      setSuccessMessage(null)
                      setForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                    }}
                    placeholder="Enter your current password"
                    className="h-11 rounded-[18px] border-[#F1E7D0] pr-11"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-[#754319]"
                    aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                    disabled={isSubmitting}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={form.newPassword}
                    onChange={(event) => {
                      setFormError(null)
                      setSuccessMessage(null)
                      setForm((prev) => ({ ...prev, newPassword: event.target.value }))
                    }}
                    placeholder="Enter your new password"
                    className="h-11 rounded-[18px] border-[#F1E7D0] pr-11"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-[#754319]"
                    aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                    disabled={isSubmitting}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrength password={form.newPassword} className="pt-1" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(event) => {
                      setFormError(null)
                      setSuccessMessage(null)
                      setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                    }}
                    placeholder="Confirm your new password"
                    className="h-11 rounded-[18px] border-[#F1E7D0] pr-11"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-[#754319]"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    disabled={isSubmitting}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="rounded-[20px] border border-[#F1E7D0] bg-[#FFFDF7] p-4 text-sm text-slate-600">
                Password changes apply immediately to your admin account and keep you signed in to the current session.
              </div>

              {formError ? (
                <p className="text-sm font-medium text-rose-600" role="alert">
                  {formError}
                </p>
              ) : null}
              {successMessage ? (
                <p className="text-sm font-medium text-emerald-700" role="status">
                  {successMessage}
                </p>
              ) : null}

              <Button type="submit" className="h-11 rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating password...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    Update password
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
