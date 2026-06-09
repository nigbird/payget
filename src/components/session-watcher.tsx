"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSession, signOut } from "next-auth/react"
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

const INACTIVITY_TIMEOUT      = 30 * 60 * 1000   // 30 min
const WARNING_THRESHOLD       = 28 * 60 * 1000   // warn at 28 min
const SESSION_CHECK_INTERVAL  =  2 * 1000         // probe every 2 s (was 5 s)
const SESSION_UPDATE_THROTTLE =  5 * 1000         // refresh session data on activity
const ACTIVITY_STORAGE_KEY    = "last_activity_timestamp"

export function SessionWatcher() {
  const { data: session, status, update } = useSession()
  const router   = useRouter()
  const pathname = usePathname()

  const [showTimeoutModal, setShowTimeoutModal] = useState(false)
  const [isExpiring,       setIsExpiring]       = useState(false)
  const [expiredReason,    setExpiredReason]    = useState<"inactivity" | "unauthorized" | null>(null)

  const lastActivityRef  = useRef<number>(Date.now())
  const lastUpdateRef    = useRef<number>(Date.now())
  const statusRef        = useRef(status)
  const isAuthPageRef    = useRef(false)
  const showModalRef     = useRef(showTimeoutModal)
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
    pathname?.startsWith("/activate")

  // Keep refs in sync with latest render values.
  useEffect(() => {
    statusRef.current    = status
    isAuthPageRef.current = isAuthPage
    showModalRef.current  = showTimeoutModal
    if (status === "authenticated") wasAuthenticatedRef.current = true
  }, [status, isAuthPage, showTimeoutModal])

  const clearAuthData = useCallback(() => {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY)
  }, [])

  const logout = useCallback(async (reason: "inactivity" | "unauthorized") => {
    setExpiredReason(reason)
    setIsExpiring(false)
    setShowTimeoutModal(true)
    clearAuthData()
    await signOut({ redirect: false })
  }, [clearAuthData])

  // ─── FIX 1: Dedicated session-validity probe ─────────────────────────────
  // Fetches /api/auth/session-status. When the server's session() callback
  // detects a sessionVersion mismatch (new login on another device), it returns
  // 401. The global fetch interceptor below catches every 401 and fires logout.
  // This is more reliable than update() because the 401 path is deterministic.
  const checkSessionValidity = useCallback(async () => {
    if (isAuthPageRef.current || showModalRef.current) return
    try {
      await fetch("/api/session-check", { cache: "no-store" })
      // 401 is handled by the window.fetch interceptor registered below.
    } catch {
      // Network error — do not log out; may be a transient connectivity issue.
    }
  }, [])

  // ─── FIX 2: Immediate check on tab focus / visibility ────────────────────
  // When the user switches back to this tab after having logged in elsewhere,
  // the validity check fires immediately instead of waiting for the next tick.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && statusRef.current === "authenticated") {
        checkSessionValidity()
      }
    }
    const handleFocus = () => {
      if (statusRef.current === "authenticated") {
        checkSessionValidity()
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("focus", handleFocus)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("focus", handleFocus)
    }
  }, [checkSessionValidity])

  // ─── FIX 3: Immediate check on page navigation ───────────────────────────
  // Each time the user navigates to a new route within the SPA, re-probe so
  // there is no window where a revoked session sees fresh page content.
  useEffect(() => {
    if (statusRef.current === "authenticated" && !isAuthPage) {
      checkSessionValidity()
    }
  }, [pathname, checkSessionValidity, isAuthPage])

  // ─── FIX 4: Handle "unauthenticated on protected route" after navigation ──
  // When middleware (Edge runtime, no DB access) lets a revoked JWT through,
  // the server layout calls auth() → detects version mismatch → returns null →
  // AuthSessionProvider starts with null session → status = "unauthenticated"
  // right from mount. The transition detector below never fires because there
  // was no "authenticated" → "unauthenticated" shift on this page. We redirect
  // to login directly if we know this session was previously valid.
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

  // ─── Status-transition detector (existing, kept as secondary guard) ───────
  const prevStatusRef = useRef(status)
  useEffect(() => {
    if (
      prevStatusRef.current === "authenticated" &&
      status === "unauthenticated" &&
      !isAuthPage &&
      !showTimeoutModal
    ) {
      logout("unauthorized")
    }
    prevStatusRef.current = status
  }, [status, isAuthPage, logout, showTimeoutModal])

  // ─── Activity handler ─────────────────────────────────────────────────────
  const handleActivity = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now

    // Refresh session data on activity (keeps name/role up to date).
    if (status === "authenticated" && now - lastUpdateRef.current > SESSION_UPDATE_THROTTLE) {
      update()
      lastUpdateRef.current = now
    }

    localStorage.setItem(ACTIVITY_STORAGE_KEY, now.toString())

    if ((isExpiring || showTimeoutModal) && expiredReason === null) {
      setIsExpiring(false)
      setShowTimeoutModal(false)
    }
  }, [isExpiring, showTimeoutModal, status, update, expiredReason])

  // Cross-tab activity sync + 401 event listener
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
        logout("unauthorized")
      }
    }

    window.addEventListener("storage", handleStorageChange)
    window.addEventListener(SESSION_EXPIRED_EVENT, handleUnauthorized)
    return () => {
      window.removeEventListener("storage", handleStorageChange)
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleUnauthorized)
    }
  }, [logout, isExpiring, showTimeoutModal, expiredReason])

  // ─── Global 401 fetch interceptor ────────────────────────────────────────
  // Catches 401 from ANY fetch in the app — including our session-status probe.
  // This is the single path through which all session invalidity is reported.
  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args)
        if (
          response.status === 401 &&
          !isAuthPageRef.current &&
          statusRef.current === "authenticated"
        ) {
          window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
        }
        return response
      } catch (error) {
        throw error
      }
    }
    return () => { window.fetch = originalFetch }
  }, [])

  // ─── Periodic probe + inactivity check ───────────────────────────────────
  useEffect(() => {
    if (isAuthPage) {
      if (showTimeoutModal) setShowTimeoutModal(false)
      if (isExpiring) setIsExpiring(false)
      return
    }

    const interval = setInterval(() => {
      const now          = Date.now()
      const lastActivity = lastActivityRef.current

      if (now - lastActivity > INACTIVITY_TIMEOUT) {
        if (statusRef.current === "authenticated" && !isAuthPageRef.current) {
          logout("inactivity")
        }
      } else if (now - lastActivity > WARNING_THRESHOLD && !isExpiring) {
        setIsExpiring(true)
        setShowTimeoutModal(true)
      }

      // Core concurrent-session revocation check — every 2 s.
      // The 401 from this probe is caught by the interceptor above → instant logout.
      if (statusRef.current === "authenticated" && !isAuthPageRef.current && !showModalRef.current) {
        checkSessionValidity()
      }
    }, SESSION_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [logout, isAuthPage, isExpiring, checkSessionValidity])

  // Activity event listeners (throttled to 1 s)
  useEffect(() => {
    const events = ["mousedown", "mousemove", "keydown", "scroll", "click", "touchstart", "wheel"]
    let lastCall = 0
    const throttled = () => {
      const now = Date.now()
      if (now - lastCall > 1000) { handleActivity(); lastCall = now }
    }
    events.forEach(e => window.addEventListener(e, throttled))
    return () => events.forEach(e => window.removeEventListener(e, throttled))
  }, [handleActivity])

  // First-login password change enforcement
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const user = session.user as any
      if (user.firstLogin === true && user.role !== "MERCHANT" && pathname !== "/change-password" && !isAuthPage) {
        router.push("/change-password")
      }
    }
  }, [status, session, pathname, isAuthPage, router])

  const handleLoginAgain = () => {
    setShowTimeoutModal(false)
    const loginUrl = pathname?.startsWith("/merchant") ? "/login/merchant" : "/login"
    signOut({ callbackUrl: loginUrl })
  }

  const handleLogoutNow = useCallback(() => {
    clearAuthData()
    const loginUrl = pathname?.startsWith("/merchant") ? "/login/merchant" : "/login"
    signOut({ callbackUrl: loginUrl })
  }, [clearAuthData, pathname])

  if (isAuthPage) return null

  return (
    <Dialog open={showTimeoutModal} onOpenChange={expiredReason ? undefined : setShowTimeoutModal}>
      <DialogContent className="sm:max-w-[425px] border-none bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl">
        <DialogHeader className="flex flex-col items-center pt-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isExpiring ? "bg-amber-100 text-amber-600" : "bg-rose-100 text-rose-600"}`}>
            {isExpiring ? <Clock className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
          </div>
          <DialogTitle className="text-2xl font-bold text-gray-900 text-center">
            {isExpiring ? "Session Expiring Soon" : (expiredReason === "inactivity" ? "Session Timeout" : "Session Expired")}
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600 pt-2">
            {isExpiring
              ? "You've been inactive for a while. For your security, you'll be logged out soon."
              : (expiredReason === "inactivity"
                ? "Your session has expired due to inactivity. Please log in again to continue."
                : "Your session is no longer valid. Please log in again to continue.")}
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
                onClick={handleActivity}
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
