"use client"

import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { refreshAccessTokenResult } from "@/lib/auth-context"

const LAST_ATTEMPT_KEY = "session_resume_at"
// If we land back here this soon after a successful resume, the page we went
// to rejected the session again; go to login instead of looping.
const LOOP_GUARD_MS = 15 * 1000
const MAX_TRANSIENT_RETRIES = 3

/** Only same-origin paths: never an absolute or protocol-relative URL. */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null
  return raw
}

/**
 * The middleware sends a page request here, instead of to login, when the
 * request carried no usable access token but the browser may still hold a
 * valid refresh token: the 5-minute access token lapsed a moment before the
 * click, or the browser arrived from another site (YagoutPay's return, a link
 * in an email), where SameSite=Strict cookies are not sent on the first
 * request. A same-site fetch from this page does carry them, so try a silent
 * refresh and continue to the requested page; only a rejected refresh means
 * the session is really over.
 */
export default function SessionResumePage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const next = safeNext(params.get("next")) ?? "/"
    const loginUrl = next.startsWith("/merchant") ? "/login/merchant" : "/login"

    let lastAttempt = 0
    try {
      lastAttempt = Number(sessionStorage.getItem(LAST_ATTEMPT_KEY) || 0)
    } catch {}
    if (Date.now() - lastAttempt < LOOP_GUARD_MS) {
      try {
        sessionStorage.removeItem(LAST_ATTEMPT_KEY)
      } catch {}
      window.location.replace(loginUrl)
      return
    }

    let cancelled = false
    ;(async () => {
      for (let attempt = 0; attempt < MAX_TRANSIENT_RETRIES && !cancelled; attempt++) {
        const result = await refreshAccessTokenResult()
        if (result === "ok") {
          try {
            sessionStorage.setItem(LAST_ATTEMPT_KEY, String(Date.now()))
          } catch {}
          window.location.replace(next)
          return
        }
        if (result === "unauthorized") break
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
      if (!cancelled) window.location.replace(loginUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-gray-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Restoring your session…</span>
      </div>
    </div>
  )
}
