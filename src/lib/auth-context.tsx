"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"

export type AuthUser = {
  id: string
  sid?: string
  email?: string | null
  name?: string | null
  firstLogin?: boolean
  role?: string | null
  merchantId?: string | null
  permissions?: string[]
  isHeadOffice?: boolean
  district?: string | null
  branch?: string | null
  assignedMerchantIds?: string[]
  assignedMerchants?: { id: string; name: string }[]
  teamMemberId?: string
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated"

type AuthContextValue = {
  user: AuthUser | null
  status: AuthStatus
  /** Re-fetch the current user from /api/auth/me. */
  refresh: () => Promise<void>
  /** Log out the current user and navigate to the login page. */
  logout: (callbackUrl?: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  status: "loading",
  refresh: async () => {},
  logout: async () => {},
})

async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" })
    if (!res.ok) return null
    return (await res.json()) as AuthUser
  } catch {
    return null
  }
}

// Module-level (not per-component) in-flight promise so every caller — the
// auth context's own me->refresh fallback, and SessionWatcher's 401
// interceptor — shares one outstanding refresh. The refresh endpoint rotates
// the refresh token and treats a reused token as theft, revoking the whole
// session, so two concurrent POSTs here would lock the user out.
let refreshPromise: Promise<boolean> | null = null

export function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")
  const router = useRouter()
  const refreshing = useRef(false)

  const loadUser = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    try {
      let me = await fetchMe()
      if (!me) {
        // Access token may be expired — try refreshing.
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          me = await fetchMe()
        }
      }
      if (me) {
        setUser(me)
        setStatus("authenticated")
      } else {
        setUser(null)
        setStatus("unauthenticated")
      }
    } finally {
      refreshing.current = false
    }
  }, [])

  // Initial load on mount.
  useEffect(() => {
    loadUser()
  }, [loadUser])

  const refresh = useCallback(async () => {
    await loadUser()
  }, [loadUser])

  const logout = useCallback(
    async (callbackUrl?: string) => {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      } catch {
        // Best-effort
      }
      setUser(null)
      setStatus("unauthenticated")
      const loginUrl = callbackUrl ?? "/login"
      router.push(loginUrl)
    },
    [router]
  )

  return (
    <AuthContext.Provider value={{ user, status, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
