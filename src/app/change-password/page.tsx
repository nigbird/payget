"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Lock, Eye, EyeOff, LogOut } from "lucide-react"
import { SigningInOverlay } from "@/components/auth/signing-in-overlay"
import { PasswordStrength } from "@/components/auth/password-strength"
import { validatePassword } from "@/lib/password-policy"

const getAdminLandingPath = (permissions: string[]) => {
  if (permissions.includes("DASHBOARD_VIEW")) return "/admin"
  if (permissions.includes("MERCHANT_REGISTER")) return "/admin/onboarding"
  if (permissions.includes("MERCHANT_APPROVE")) return "/admin/review"
  if (permissions.includes("USER_CREATE")) return "/admin/users"
  if (permissions.includes("ROLE_CREATE")) return "/admin/roles"
  if (permissions.includes("CONFIGURATION_MANAGE")) return "/admin/configuration"
  if (permissions.includes("AUDIT_LOG_VIEW")) return "/admin/audit-logs"
  return null
}

const getPostChangePasswordRedirect = (role?: string | null, permissions?: string[]) => {
  if (!role) return "/login"
  if (role === "MERCHANT" || role === "SALES") return "/merchant"
  return getAdminLandingPath(permissions ?? []) ?? "/admin"
}

export default function ChangePasswordPage() {
  const { user, status, refresh, logout } = useAuth()
  const router = useRouter()
  const isAdmin = !!user?.role && user.role !== "MERCHANT" && user.role !== "SALES"
  const isFirstLogin = Boolean(user?.firstLogin)
  const [isLoading, setIsLoading] = useState(false)
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false)
  const [newPasswordVisible, setNewPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [credentials, setCredentials] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!credentials.currentPassword || !credentials.newPassword || !credentials.confirmPassword) {
      setFormError("Fill in every field below.")
      return
    }

    if (credentials.newPassword !== credentials.confirmPassword) {
      setFormError("New password and confirmation must match.")
      return
    }

    const policy = validatePassword(credentials.newPassword)
    if (!policy.valid) {
      setFormError(policy.errors[0] ?? "Password does not meet the required policy.")
      return
    }

    setIsLoading(true)
    let completed = false
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: credentials.currentPassword,
          newPassword: credentials.newPassword,
        }),
      })

      if (res.ok) {
        completed = true
        setRedirecting(true)
        // Re-fetch user — the server set a new access token with firstLogin: false.
        await refresh()
        router.push(getPostChangePasswordRedirect(user?.role, user?.permissions))
      } else {
        const error = await res.json()
        setFormError(error?.error || "Could not update your password. Try again.")
      }
    } catch {
      setFormError("Something went wrong. Check your connection and try again.")
    } finally {
      if (!completed) setIsLoading(false)
    }
  }

  const handleLogout = () => {
    const loginUrl = user?.role === "MERCHANT" || user?.role === "SALES" ? "/login/merchant" : "/login"
    logout(loginUrl)
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-white">
      {redirecting ? (
        <SigningInOverlay message="Saving your password…" subMessage="Redirecting to your dashboard" />
      ) : null}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-96 h-96 bg-gradient-to-br from-[#f4db9f]/30 to-[#f8b513]/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-gradient-to-tl from-[#f8b513]/25 to-[#754319]/15 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-gradient-to-r from-[#754319]/20 to-[#f4db9f]/15 rounded-full blur-2xl animate-pulse delay-500" />
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="honeycomb" x="0" y="0" width="60" height="52" patternUnits="userSpaceOnUse">
                <polygon points="30,5 50,15 50,35 30,45 10,35 10,15" fill="none" stroke="#754319" strokeWidth="1"/>
                <polygon points="0,26 20,36 20,56 0,66 -20,56 -20,36" fill="none" stroke="#754319" strokeWidth="1"/>
                <polygon points="60,26 80,36 80,56 60,66 40,56 40,36" fill="none" stroke="#754319" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#honeycomb)" />
          </svg>
        </div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="backdrop-blur-md bg-white/60 border border-white/40 rounded-2xl shadow-2xl p-8 space-y-8">
            <div className="flex justify-center">
              <div className="w-20 h-20 flex items-center justify-center">
                <img src="/niblogo.png" alt="Nib Bank Logo" className="max-w-full max-h-full object-contain" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold text-[#1F2937] tracking-tight">Change Password</h1>
              <p className="text-[#6B7280] font-medium">
                {isFirstLogin
                  ? "Please set a new password before continuing"
                  : isAdmin
                  ? "Update your admin password to keep your account secure"
                  : "Update your password to keep your account secure"}
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-6">
              <div className="space-y-2.5">
                <Label htmlFor="currentPassword" className="text-sm font-semibold text-[#374151]">Current Password</Label>
                <div className="relative group transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                  <Input
                    id="currentPassword"
                    type={currentPasswordVisible ? "text" : "password"}
                    className="h-12 pl-10 pr-12 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                    placeholder="Enter your current password"
                    required
                    value={credentials.currentPassword}
                    onChange={(e) => { setFormError(null); setCredentials({ ...credentials, currentPassword: e.target.value }) }}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setCurrentPasswordVisible((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#6B7280] hover:text-[#f8b513] transition-colors"
                    aria-label={currentPasswordVisible ? "Hide password" : "Show password"}
                  >
                    {currentPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="newPassword" className="text-sm font-semibold text-[#374151]">New Password</Label>
                <div className="relative group transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                  <Input
                    id="newPassword"
                    type={newPasswordVisible ? "text" : "password"}
                    className="h-12 pl-10 pr-12 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                    placeholder="Enter your new password"
                    required
                    value={credentials.newPassword}
                    onChange={(e) => { setFormError(null); setCredentials({ ...credentials, newPassword: e.target.value }) }}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setNewPasswordVisible((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#6B7280] hover:text-[#f8b513] transition-colors"
                    aria-label={newPasswordVisible ? "Hide password" : "Show password"}
                  >
                    {newPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrength password={credentials.newPassword} />
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="confirmPassword" className="text-sm font-semibold text-[#374151]">Confirm New Password</Label>
                <div className="relative group transition-all">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280] group-focus-within:text-[#f8b513] transition-colors" />
                  <Input
                    id="confirmPassword"
                    type={confirmPasswordVisible ? "text" : "password"}
                    className="h-12 pl-10 pr-12 rounded-xl border-[#E5E7EB] bg-white/80 backdrop-blur-sm focus:ring-2 focus:ring-[#f8b513]/20 focus:border-[#f8b513] transition-all shadow-sm"
                    placeholder="Confirm your new password"
                    required
                    value={credentials.confirmPassword}
                    onChange={(e) => { setFormError(null); setCredentials({ ...credentials, confirmPassword: e.target.value }) }}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmPasswordVisible((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#6B7280] hover:text-[#f8b513] transition-colors"
                    aria-label={confirmPasswordVisible ? "Hide password" : "Show password"}
                  >
                    {confirmPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end pt-1">
                <div className="flex items-center gap-4">
                  {!isFirstLogin ? (
                    <button
                      type="button"
                      onClick={() => router.push(getPostChangePasswordRedirect(user?.role, user?.permissions))}
                      className="text-sm font-semibold text-[#6B7280] hover:text-[#374151] transition-colors"
                      disabled={isLoading}
                    >
                      {isAdmin ? "Back to admin console" : "Back to dashboard"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-sm font-semibold text-[#f8b513] hover:text-[#754319] transition-colors flex items-center gap-2"
                    disabled={isLoading}
                  >
                    <LogOut className="w-4 h-4" />
                    Log Out
                  </button>
                </div>
              </div>

              {formError ? (
                <p className="text-sm font-medium text-rose-600 text-center" role="alert">{formError}</p>
              ) : null}

              <Button
                type="submit"
                className="w-full h-12 text-base font-bold rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 hover:-translate-y-0.5 transition-all duration-300"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Changing password...
                  </>
                ) : (
                  "Change Password"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
