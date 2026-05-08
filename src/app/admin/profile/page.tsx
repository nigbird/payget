"use client"

import { useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { Eye, EyeOff, KeyRound, Loader2, Shield, UserCircle2 } from "lucide-react"

import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SessionUser = {
  name?: string | null
  email?: string | null
  role?: string
  firstLogin?: boolean
}

export default function AdminProfilePage() {
  const { data: session, update } = useSession()
  const { toast } = useToast()
  const user = session?.user as SessionUser | undefined

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  const passwordStrength = useMemo(() => {
    const password = form.newPassword
    if (!password) return { label: "Not set", width: "0%", color: "bg-slate-200" }

    let score = 0
    if (password.length >= 8) score += 1
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
    if (/\d/.test(password)) score += 1
    if (/[^a-zA-Z\d]/.test(password)) score += 1

    if (score <= 1) return { label: "Weak", width: "25%", color: "bg-rose-500" }
    if (score === 2) return { label: "Fair", width: "50%", color: "bg-amber-500" }
    if (score === 3) return { label: "Good", width: "75%", color: "bg-yellow-500" }
    return { label: "Strong", width: "100%", color: "bg-emerald-500" }
  }, [form.newPassword])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      toast({ title: "All fields are required", variant: "destructive" })
      return
    }

    if (form.newPassword.length < 8) {
      toast({ title: "New password must be at least 8 characters", variant: "destructive" })
      return
    }

    if (form.newPassword !== form.confirmPassword) {
      toast({ title: "New passwords do not match", variant: "destructive" })
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
        toast({
          title: "Failed to change password",
          description: error.error,
          variant: "destructive",
        })
        return
      }

      await update({ ...session, user: { ...session?.user, firstLogin: false } })
      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      })
      toast({
        title: "Password changed",
        description: "Your admin password was updated successfully.",
      })
    } catch {
      toast({
        title: "Network error",
        description: "Could not reach the password service.",
        variant: "destructive",
      })
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
                    onChange={(event) => setForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
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
                    onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Strength</span>
                    <span>{passwordStrength.label}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full transition-all ${passwordStrength.color}`} style={{ width: passwordStrength.width }} />
                  </div>
                  <p className="text-xs text-slate-500">Use at least 8 characters with mixed case, numbers, and symbols.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
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

              <Button type="submit" className="h-11 rounded-[18px]" disabled={isSubmitting}>
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
