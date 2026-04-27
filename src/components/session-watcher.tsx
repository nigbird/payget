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

// Configuration for session behavior (30-minute period)
const INACTIVITY_TIMEOUT = 30 * 60 * 1000 // 30 minutes of inactivity
const WARNING_THRESHOLD = 28 * 60 * 1000 // Show warning 2 minutes before timeout (at 28 min)
const SESSION_CHECK_INTERVAL = 30 * 1000 // Check every 30 seconds
const ACTIVITY_STORAGE_KEY = "last_activity_timestamp"

export function SessionWatcher() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [showTimeoutModal, setShowTimeoutModal] = useState(false)
  const [isExpiring, setIsExpiring] = useState(false)
  const [expiredReason, setExpiredReason] = useState<"inactivity" | "unauthorized" | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const lastUpdateRef = useRef<number>(Date.now())
  const statusRef = useRef(status)
  
  const isAuthPage = pathname?.startsWith("/login") || 
                     pathname === "/" || 
                     pathname?.startsWith("/forgot-password") || 
                     pathname?.startsWith("/reset-password")
  
  const isAuthPageRef = useRef(isAuthPage)

  // Keep refs in sync
  useEffect(() => {
    statusRef.current = status
    isAuthPageRef.current = isAuthPage
  }, [status, isAuthPage])

  const handleActivity = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now
    
    // Periodically update the NextAuth session (every 30 seconds) to keep it alive
    if (status === "authenticated" && now - lastUpdateRef.current > 30 * 1000) {
      update()
      lastUpdateRef.current = now
    }

    // Sync activity across tabs
    localStorage.setItem(ACTIVITY_STORAGE_KEY, now.toString())
    
    if (isExpiring || showTimeoutModal) {
      // Only reset if it's just a warning, not a full expiry
      if (expiredReason === null) {
        setIsExpiring(false)
        setShowTimeoutModal(false)
      }
    }
  }, [isExpiring, showTimeoutModal, status, update, expiredReason])

  // Clear session-related data from storage
  const clearAuthData = useCallback(() => {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY)
    // Clear any other app-specific storage here
    // e.g., localStorage.removeItem("user_settings"), etc.
  }, [])

  const logout = useCallback(async (reason: "inactivity" | "unauthorized") => {
    setExpiredReason(reason)
    setIsExpiring(false)
    setShowTimeoutModal(true)
    
    // Clear data before signing out
    clearAuthData()
    
    // Sign out without immediate redirect to show the dialog
    await signOut({ redirect: false })
  }, [clearAuthData])

  // Listen for activity and storage changes in other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ACTIVITY_STORAGE_KEY && e.newValue) {
        lastActivityRef.current = parseInt(e.newValue, 10)
        if (isExpiring || showTimeoutModal) {
          // Only reset if it's just a warning, not a full expiry
          if (expiredReason === null) {
            setIsExpiring(false)
            setShowTimeoutModal(false)
          }
        }
      }
    }

    // Handle global 401 unauthorized event from api-client.ts
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
  }, [logout])

  // Global fetch interceptor for 401 Unauthorized (runs once)
  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args)
        if (response.status === 401 && !isAuthPageRef.current && statusRef.current === "authenticated") {
          console.warn("Unauthorized request detected (401). Triggering session expiry flow.")
          window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
        }
        return response
      } catch (error) {
        // Only log actual errors, not 401s which are handled above
        console.error("Fetch error:", error)
        throw error
      }
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  // Periodic session check and inactivity timeout
  useEffect(() => {
    if (isAuthPage) {
      if (showTimeoutModal) setShowTimeoutModal(false)
      if (isExpiring) setIsExpiring(false)
      return
    }

    const interval = setInterval(() => {
      const now = Date.now()
      const lastActivity = lastActivityRef.current

      // Check for inactivity timeout
      if (now - lastActivity > INACTIVITY_TIMEOUT) {
        if (statusRef.current === "authenticated" && !isAuthPageRef.current) {
          logout("inactivity")
        }
      } else if (now - lastActivity > WARNING_THRESHOLD && !isExpiring) {
        setIsExpiring(true)
        setShowTimeoutModal(true)
      }
    }, SESSION_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [logout, status, isAuthPage, isExpiring])

  // Reset activity timer on user interaction
  useEffect(() => {
    const events = ["mousedown", "mousemove", "keydown", "scroll", "click", "touchstart", "wheel"]
    
    // Throttle the handleActivity to avoid performance issues
    let lastCall = 0
    const throttledHandleActivity = () => {
      const now = Date.now()
      if (now - lastCall > 1000) {
        handleActivity()
        lastCall = now
      }
    }

    events.forEach(event => window.addEventListener(event, throttledHandleActivity))

    return () => {
      events.forEach(event => window.removeEventListener(event, throttledHandleActivity))
    }
  }, [handleActivity])

  const handleLoginAgain = () => {
    setShowTimeoutModal(false)
    const loginUrl = pathname?.startsWith("/merchant") ? "/login/merchant" : "/login"
    // Using signOut with callbackUrl is the most robust way to ensure 
    // the session is fully cleared before landing on the login page.
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
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isExpiring ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>
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
