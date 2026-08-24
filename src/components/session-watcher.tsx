"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useAuth, refreshAccessToken } from "@/lib/auth-context"
import { useRouter, usePathname } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Clock, LogIn, AlertCircle } from "lucide-react"
import { SESSION_EXPIRED_EVENT } from "@/lib/api-client"

// Inactivity window matches the access-token TTL so a timed-out tab and an
// expired token expire together.
const INACTIVITY_TIMEOUT = 5 * 60 * 1000
const WARNING_THRESHOLD = 4 * 60 * 1000
const SESSION_CHECK_INTERVAL = 5 * 1000
const SESSION_UPDATE_THROTTLE = 5 * 1000
const ACTIVITY_STORAGE_KEY = "last_activity_timestamp"

export function SessionWatcher() {
  const { user, status, refresh, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const [showTimeoutModal, setShowTimeoutModal] = useState(false)
  const [isExpiring, setIsExpiring] = useState(false)
  const [expiredReason, setExpiredReason] = useState<"inactivity" | "unauthorized" | null>(null)

  const lastActivityRef = useRef<number>(Date.now())
  const lastUpdateRef = useRef<number>(Date.now())
  const statusRef = useRef(status)
  const showModalRef = useRef(showTimeoutModal)
  const expiredReasonRef = useRef<"inactivity" | "unauthorized" | null>(null)
  // Tracks whether this tab ever reached an authenticated state, so we can
  // distinguish "revoked mid-session" from "never logged in" when redirecting.
  const wasAuthenticatedRef = useRef(false)

  const isAuthPage =
    pathname?.startsWith("/login") ||
    pathname === "/" ||
    pathname?.startsWith("/forgot-password") ||
    pathname?.startsWith("/reset-password") ||
    pathname === "/change-password" ||
    pathname?.startsWith("/payment") ||
    pathname?.startsWith("/pay") ||
    pathname?.startsWith("/activate") ||
    pathname?.startsWith("/l/") ||
    pathname?.startsWith("/merchant/review-update")

  const isAuthPageRef = useRef(isAuthPage)

  // Keep refs in sync with latest render values.
  useEffect(() => {
    statusRef.current = status
    isAuthPageRef.current = isAuthPage
    showModalRef.current = showTimeoutModal
    if (status === "authenticated") wasAuthenticatedRef.current = true
  }, [status, isAuthPage, showTimeoutModal])

  const clearAuthData = useCallback(() => {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY)
  }, [])

  const handleSessionExpired = useCallback(
    async (reason: "inactivity" | "unauthorized") => {
      if (expiredReasonRef.current !== null) return
      expiredReasonRef.current = reason
      setExpiredReason(reason)
      setIsExpiring(false)
      setShowTimeoutModal(true)
      clearAuthData()
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      } catch {
        // Best-effort
      }
    },
    [clearAuthData]
  )

  // ─── Concurrent-session revocation probe ─────────────────────────────────
  // /api/auth/validate-session checks the ActiveSession row behind the token's
  // sid, so a login on another device (which revokes the older session) is
  // detected here. A 401 can also just mean the short-lived access token
  // expired, so we attempt one silent refresh before declaring the session
  // dead — the refresh endpoint itself 401s when the session was revoked.
  //
  // This probe handles its own 401 rather than relying on the global fetch
  // interceptor below, because that interceptor deliberately ignores
  // /api/auth/* responses to avoid racing the refresh flow.
  const checkSessionValidity = useCallback(async () => {
    if (isAuthPageRef.current || showModalRef.current) return
    if (statusRef.current !== "authenticated") return
    try {
      const res = await fetch("/api/auth/validate-session", { cache: "no-store" })
      if (res.status !== 401) return

      const refreshed = await refreshAccessToken()
      if (!refreshed) {
        handleSessionExpired("unauthorized")
        return
      }

      const retry = await fetch("/api/auth/validate-session", { cache: "no-store" })
      if (retry.status === 401) handleSessionExpired("unauthorized")
    } catch {
      // Network error — do not log out; may be a transient connectivity issue.
    }
  }, [handleSessionExpired])

  // Immediate check on tab focus / visibility, so returning to a tab after
  // logging in elsewhere does not wait for the next tick.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkSessionValidity()
    }
    const handleFocus = () => checkSessionValidity()

    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleFocus)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleFocus)
    }
  }, [checkSessionValidity])

  // Re-probe on every in-app navigation so a revoked session never sees fresh
  // page content.
  useEffect(() => {
    if (!isAuthPage) checkSessionValidity()
  }, [pathname, checkSessionValidity, isAuthPage])

  // Landing on a protected route already unauthenticated (server rejected the
  // token before this tab mounted) produces no authenticated -> unauthenticated
  // transition for the detector below to catch. Redirect directly when we know
  // this tab previously held a valid session.
  useEffect(() => {
    if (
      status === "unauthenticated" &&
      !isAuthPage &&
      !showTimeoutModal &&
      wasAuthenticatedRef.current
    ) {
      const loginUrl = pathname?.startsWith("/merchant") ? "/login/merchant" : "/login"
      router.replace(loginUrl)
    }
  }, [status, isAuthPage, showTimeoutModal, pathname, router])

  // Status-transition detector (secondary guard).
  const prevStatusRef = useRef(status)
  useEffect(() => {
    if (
      prevStatusRef.current === "authenticated" &&
      status === "unauthenticated" &&
      !isAuthPage &&
      !showTimeoutModal
    ) {
      handleSessionExpired("unauthorized")
    }
    prevStatusRef.current = status
  }, [status, isAuthPage, handleSessionExpired, showTimeoutModal])

  const handleActivity = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now

    // Refresh user data on activity (keeps name/role/permissions up to date).
    if (status === "authenticated" && now - lastUpdateRef.current > SESSION_UPDATE_THROTTLE) {
      refresh()
      lastUpdateRef.current = now
    }

    localStorage.setItem(ACTIVITY_STORAGE_KEY, now.toString())
  }, [status, refresh])

  const handleStayLoggedIn = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now
    lastUpdateRef.current = now
    localStorage.setItem(ACTIVITY_STORAGE_KEY, now.toString())
    setIsExpiring(false)
    setShowTimeoutModal(false)
    refresh()
  }, [refresh])

  // Cross-tab activity sync + 401 event listener.
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ACTIVITY_STORAGE_KEY && e.newValue) {
        lastActivityRef.current = parseInt(e.newValue, 10)
        if ((isExpiring || showTimeoutModal) && expiredReason === null) {
          setIsExpiring(false)
          setShowTimeoutModal(false)
        }
      }
    }

    const handleUnauthorized = () => {
      if (statusRef.current === "authenticated" && !isAuthPageRef.current) {
        handleSessionExpired("unauthorized")
      }
    }

    window.addEventListener("storage", handleStorageChange)
    window.addEventListener(SESSION_EXPIRED_EVENT, handleUnauthorized)
    return () => {
      window.removeEventListener("storage", handleStorageChange)
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleUnauthorized)
    }
  }, [handleSessionExpired, isExpiring, showTimeoutModal, expiredReason])

  // ─── Global 401 fetch interceptor ────────────────────────────────────────
  // Catches 401 from any app fetch and reports session invalidity through a
  // single path.
  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const response = await originalFetch(...args)

      // /api/auth/* 401s are handled by auth-context (token refresh flow) —
      // dispatching SESSION_EXPIRED_EVENT here would race with refreshAccessToken()
      // and log the user out before the refresh has a chance to run.
      const url =
        typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : ""
      const isAuthEndpoint = url.includes("/api/auth/")

      if (
        response.status === 401 &&
        !isAuthPageRef.current &&
        statusRef.current === "authenticated" &&
        !isAuthEndpoint
      ) {
        // The access token may have simply expired (it's short-lived and only
        // renewed reactively). Try a silent refresh and replay the request once
        // before treating this as a real session expiry.
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          const retryResponse = await originalFetch(...args)
          if (retryResponse.status !== 401) return retryResponse
          window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
          return retryResponse
        }
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
      }

      return response
    }
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  // ─── Periodic probe + inactivity check ───────────────────────────────────
  useEffect(() => {
    if (isAuthPage) {
      if (showTimeoutModal) setShowTimeoutModal(false)
      if (isExpiring) setIsExpiring(false)
      return
    }

    const interval = setInterval(() => {
      const now = Date.now()
      const lastActivity = lastActivityRef.current

      if (now - lastActivity > INACTIVITY_TIMEOUT) {
        if (statusRef.current === "authenticated" && !isAuthPageRef.current) {
          handleSessionExpired("inactivity")
        }
      } else if (
        now - lastActivity > WARNING_THRESHOLD &&
        !isExpiring &&
        expiredReasonRef.current === null
      ) {
        setIsExpiring(true)
        setShowTimeoutModal(true)
      }

      checkSessionValidity()
    }, SESSION_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [handleSessionExpired, isAuthPage, isExpiring, showTimeoutModal, checkSessionValidity])

  // Activity event listeners (throttled to 1 s).
  useEffect(() => {
    const events = ["mousedown", "mousemove", "keydown", "scroll", "click", "touchstart", "wheel"]
    let lastCall = 0
    const throttled = () => {
      const now = Date.now()
      if (now - lastCall > 1000) {
        handleActivity()
        lastCall = now
      }
    }
    events.forEach((e) => window.addEventListener(e, throttled))
    return () => events.forEach((e) => window.removeEventListener(e, throttled))
  }, [handleActivity])

  // First-login password change enforcement.
  useEffect(() => {
    if (status === "authenticated" && user) {
      const isMerchant = user.role === "MERCHANT"
      if (user.firstLogin && !isMerchant && pathname !== "/change-password" && !isAuthPage) {
        router.push("/change-password")
      }
    }
  }, [status, user, pathname, isAuthPage, router])

  const handleLoginAgain = useCallback(() => {
    expiredReasonRef.current = null
    setShowTimeoutModal(false)
    clearAuthData()
    const loginUrl = pathname?.startsWith("/merchant") ? "/login/merchant" : "/login"
    logout(loginUrl)
  }, [clearAuthData, pathname, logout])

  const handleLogoutNow = useCallback(() => {
    expiredReasonRef.current = null
    clearAuthData()
    const loginUrl = pathname?.startsWith("/merchant") ? "/login/merchant" : "/login"
    logout(loginUrl)
  }, [clearAuthData, pathname, logout])

  if (isAuthPage) return null

  return (
    <Dialog open={showTimeoutModal} onOpenChange={expiredReason ? undefined : setShowTimeoutModal}>
      <DialogContent className="sm:max-w-[425px] border-none bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl [&>button]:hidden">
        <DialogHeader className="flex flex-col items-center pt-4">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
              isExpiring ? "bg-amber-100 text-amber-600" : "bg-rose-100 text-rose-600"
            }`}
          >
            {isExpiring ? <Clock className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
          </div>
          <DialogTitle className="text-2xl font-bold text-gray-900 text-center">
            {isExpiring
              ? "Session Expiring Soon"
              : expiredReason === "inactivity"
              ? "Session Timeout"
              : "Session Expired"}
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600 pt-2">
            {isExpiring
              ? "You've been inactive for a while. For your security, you'll be logged out soon."
              : expiredReason === "inactivity"
              ? "Your session has expired due to inactivity. Please log in again to continue."
              : "Your session is no longer valid. Please log in again to continue."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-3 pt-6 pb-2">
          {isExpiring ? (
            <>
              <Button
                variant="outline"
                onClick={handleLogoutNow}
                className="w-full sm:flex-1 rounded-xl border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                Log Out
              </Button>
              <Button
                onClick={handleStayLoggedIn}
                className="w-full sm:flex-1 rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] hover:opacity-90 text-white shadow-lg shadow-amber-200/50"
              >
                Stay Logged In
              </Button>
            </>
          ) : (
            <Button
              onClick={handleLoginAgain}
              className="w-full rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] hover:opacity-90 text-white shadow-lg shadow-amber-200/50 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Log In Again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
