/** Normalized key for login rate limits (must match server auth / API login). */
export function normalizeLoginIdentifierForLockout(value: string): string {
  const v = value.trim()
  if (!v) return ""
  if (v.includes("@")) return v.toLowerCase().slice(0, 320)
  return v.replace(/[\s\-\(\)]/g, "").slice(0, 320)
}
