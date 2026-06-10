"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
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

const INACTIVITY_TIMEOUT = 30 * 60 * 1000
const WARNING_THRESHOLD = 28 * 60 * 1000
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

  const isAuthPage =
    pathname?.startsWith("/login") ||
    pathname === "/" ||
    pathname?.startsWith("/forgot-password") ||
    pathname?.startsWith("/reset-password") ||
    pathname === "/change-password" ||
    pathname?.startsWith("/payment") ||
    pathname?.startsWith("/activate")

  const isAuthPageRef = useRef(isAuthPage)

  useEffect(() => {
    statusRef.current = status
    isAuthPageRef.current = isAuthPage
  }, [status, isAuthPage])

  const clearAuthData = useCallback(() => {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY)
  }, [])

  const handleSessionExpired = useCallback(
    async (reason: "inactivity" | "unauthorized") => {
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

    if (status === "authenticated" && now - lastUpdateRef.current > SESSION_UPDATE_THROTTLE) {
      refresh()
      lastUpdateRef.current = now
    }

    localStorage.setItem(ACTIVITY_STORAGE_KEY, now.toString())
  }, [status, refresh])

  const handleStayLoggedIn = useCallback(() => {
    handleActivity()
    if (expiredReason === null) {
      setIsExpiring(false)
      setShowTimeoutModal(false)
    }
  }, [handleActivity, expiredReason])

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

  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args)
        // /api/auth/* 401s are handled by auth-context (token refresh flow) —
        // dispatching SESSION_EXPIRED_EVENT here would race with tryRefreshToken()
        // and log the user out before the refresh has a chance to run.
        const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : ""
        const isAuthEndpoint = url.includes("/api/auth/")
        if (response.status === 401 && !isAuthPageRef.current && statusRef.current === "authenticated" && !isAuthEndpoint) {
          window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
        }
        return response
      } catch (error) {
        throw error
      }
    }
    return () => {
      window.fetch = originalFetch
    }
  }, [])

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
      } else if (now - lastActivity > WARNING_THRESHOLD && !isExpiring) {
        setIsExpiring(true)
        setShowTimeoutModal(true)
      }

      if (statusRef.current === "authenticated" && !isAuthPageRef.current && !showTimeoutModal) {
        refresh()
      }
    }, SESSION_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [handleSessionExpired, isAuthPage, isExpiring, showTimeoutModal, refresh])

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

  useEffect(() => {
    if (status === "authenticated" && user) {
      const isMerchant = user.role === "MERCHANT"
      if (user.firstLogin && !isMerchant && pathname !== "/change-password" && !isAuthPage) {
        router.push("/change-password")
      }
    }
  }, [status, user, pathname, isAuthPage, router])

  const handleLoginAgain = () => {
    setShowTimeoutModal(false)
    clearAuthData()
    const loginUrl = pathname?.startsWith("/merchant") ? "/login/merchant" : "/login"
    logout(loginUrl)
  }

  const handleLogoutNow = useCallback(() => {
    clearAuthData()
    const loginUrl = pathname?.startsWith("/merchant") ? "/login/merchant" : "/login"
    logout(loginUrl)
  }, [clearAuthData, pathname, logout])

  if (isAuthPage) return null

  return (
    <Dialog open={showTimeoutModal} onOpenChange={expiredReason ? undefined : setShowTimeoutModal}>
      <DialogContent className="sm:max-w-[425px] border-none bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl">
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
