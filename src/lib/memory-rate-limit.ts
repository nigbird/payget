/**
 * In-process sliding-window rate limiter for unauthenticated endpoints that
 * trigger SMS / email / USSD (cost and harassment, not credential guessing —
 * that is lib/rate-limit.ts).
 *
 * State lives in this process, which matches the deployment (one app instance,
 * see apphosting.yaml maxInstances). A restart clears it, which is acceptable
 * for throttling. If the app is ever scaled out, move this to a shared store.
 */

type Bucket = number[]

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 50_000

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/**
 * Records a hit for `key` and reports whether it is within `limit` hits per
 * `windowMs`. A rejected hit is not recorded, so a blocked caller does not
 * extend their own block.
 */
export function hitRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)

  if (recent.length >= limit) {
    buckets.set(key, recent)
    const retryAfterMs = windowMs - (now - recent[0])
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
  }

  recent.push(now)
  buckets.set(key, recent)
  if (buckets.size > MAX_KEYS) prune(now)
  return { allowed: true }
}

/** Checks several limits; records a hit on all of them only if every one allows it. */
export function hitRateLimits(
  checks: { key: string; limit: number; windowMs: number }[]
): RateLimitResult {
  const now = Date.now()
  for (const { key, limit, windowMs } of checks) {
    const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= limit) {
      buckets.set(key, recent)
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)),
      }
    }
  }
  for (const { key, limit, windowMs } of checks) hitRateLimit(key, limit, windowMs)
  return { allowed: true }
}

/** Drops keys with no hit in the last hour (longest window in use). */
function prune(now: number) {
  for (const [key, hits] of buckets) {
    if (hits.length === 0 || now - hits[hits.length - 1] > 60 * 60 * 1000) buckets.delete(key)
  }
}
