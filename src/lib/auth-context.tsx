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
  /** For SALES sessions, `role` is the person's team role in that merchant. */
  assignedMerchants?: { id: string; name: string; role?: string }[]
  teamMemberId?: string
  teamRole?: string
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

/**
 * "unauthorized" means the server rejected the session (401/403). "error" is
 * anything else — a network blip, a 5xx while the server is busy or
 * restarting, a rate limit — and must not be mistaken for a logout.
 */
type MeResult = AuthUser | "unauthorized" | "error"

async function fetchMe(): Promise<MeResult> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" })
    if (res.status === 401 || res.status === 403) return "unauthorized"
    if (!res.ok) return "error"
    return (await res.json()) as AuthUser
  } catch {
    return "error"
  }
}

export type RefreshResult = "ok" | "unauthorized" | "error"

// Module-level (not per-component) in-flight promise so every caller — the
// auth context's own me->refresh fallback, and SessionWatcher's 401
// interceptor — shares one outstanding refresh. The refresh endpoint rotates
// the refresh token and treats a reused token as theft, revoking the whole
// session, so two concurrent POSTs here would lock the user out.
let refreshPromise: Promise<RefreshResult> | null = null

export function refreshAccessTokenResult(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then((res): RefreshResult =>
        res.ok ? "ok" : res.status === 401 || res.status === 403 ? "unauthorized" : "error"
      )
      .catch((): RefreshResult => "error")
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

export function refreshAccessToken(): Promise<boolean> {
  return refreshAccessTokenResult().then((r) => r === "ok")
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")
  const router = useRouter()
  const refreshing = useRef(false)
  const statusRef = useRef<AuthStatus>("loading")
  statusRef.current = status

  const loadUser = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    try {
      let me = await fetchMe()
      if (me === "unauthorized") {
        // Access token may be expired — try refreshing.
        const refreshed = await refreshAccessTokenResult()
        me = refreshed === "ok" ? await fetchMe() : refreshed
      }
      if (me === "error") {
        // Transient failure: keep a signed-in user signed in and let the next
        // poll try again. Only a definite rejection ends the session.
        if (statusRef.current !== "authenticated") {
          setUser(null)
          setStatus("unauthenticated")
        }
      } else if (me === "unauthorized") {
        setUser(null)
        setStatus("unauthenticated")
      } else {
        setUser(me)
        setStatus("authenticated")
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
