export type ParsedCredentialsLockout =
  | { kind: "ip"; retryAfterSeconds: number }
  | { kind: "identifier"; retryAfterSeconds: number }

/** NextAuth v5 puts custom credential failure codes on `result.code` (redirect URL query). */
export function parseLockoutFromCredentialsCode(
  code: string | null | undefined
): ParsedCredentialsLockout | null {
  if (!code) return null
  if (code.startsWith("LOCKOUT_IP_")) {
    const sec = Number(code.slice("LOCKOUT_IP_".length))
    if (!Number.isFinite(sec) || sec < 0) return null
    return { kind: "ip", retryAfterSeconds: Math.ceil(sec) }
  }
  if (code.startsWith("LOCKOUT_IDENT_")) {
    const sec = Number(code.slice("LOCKOUT_IDENT_".length))
    if (!Number.isFinite(sec) || sec < 0) return null
    return { kind: "identifier", retryAfterSeconds: Math.ceil(sec) }
  }
  return null
}

/** Legacy / API string forms: LOCKOUT_IP:90 */
export function parseCredentialsLockoutError(error: string | undefined): ParsedCredentialsLockout | null {
  if (!error) return null
  if (error.startsWith("LOCKOUT_IP:")) {
    const sec = Number(error.slice("LOCKOUT_IP:".length))
    if (!Number.isFinite(sec) || sec < 0) return null
    return { kind: "ip", retryAfterSeconds: Math.ceil(sec) }
  }
  if (error.startsWith("LOCKOUT_IDENT:")) {
    const sec = Number(error.slice("LOCKOUT_IDENT:".length))
    if (!Number.isFinite(sec) || sec < 0) return null
    return { kind: "identifier", retryAfterSeconds: Math.ceil(sec) }
  }
  return null
}

/** Prefer `code` from signIn result, then fall back to `error` string. */
export function parseLockoutFromSignInResult(result: {
  code?: string | null
  error?: string | null
}): ParsedCredentialsLockout | null {
  return parseLockoutFromCredentialsCode(result.code) ?? parseCredentialsLockoutError(result.error ?? undefined)
}

export function formatLockoutCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  if (s >= 3600) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const r = s % 60
    return h > 0 ? `${h}h ${m}m ${r}s` : `${m}m ${r}s`
  }
  if (s >= 60) {
    const m = Math.floor(s / 60)
    const r = s % 60
    return r > 0 ? `${m}m ${r}s` : `${m}m`
  }
  return `${s}s`
}
