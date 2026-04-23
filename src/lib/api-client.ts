"use client"

export const SESSION_EXPIRED_EVENT = "session-expired"

/**
 * A robust fetch wrapper that handles 401 Unauthorized responses globally.
 * Although SessionWatcher monkey-patches window.fetch for broad coverage,
 * this wrapper provides a clean, explicit way to make authenticated requests.
 */
export async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Use the original fetch if we want to avoid double-intercepting,
  // but since the monkey-patch is on window.fetch, we just use it.
  const response = await fetch(input, init)
  
  // If the monkey-patch didn't catch it for some reason (e.g. server-side)
  // we can handle it here if we're on the client.
  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
    }
  }
  
  return response
}

/**
 * Utility to check if a response is unauthorized.
 */
export function isUnauthorized(response: Response): boolean {
  return response.status === 401
}
