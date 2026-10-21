import ipaddr from "ipaddr.js"
import { isBlockedAddress } from "@/lib/ip-guard"

/**
 * The caller's IP address, for lockouts, rate limits and audit logs.
 *
 * X-Forwarded-For is a list the client starts and every proxy appends to, so
 * only the entries our own proxies added can be trusted — the leftmost one is
 * whatever the client chose to send, which is how IP lockouts were bypassed.
 *
 * - TRUSTED_PROXY_HOPS=<n> set: the address n entries from the right is the
 *   client (n = number of proxies in front of the app that append to the header).
 * - Unset (default): walk from the right and take the first public address.
 *   Our load balancer / WAF / proxies sit on private addresses and are skipped;
 *   anything a client forged sits to the left of the real address and is never
 *   reached. If every entry is private (intranet users), the rightmost is used.
 *
 * Falls back to "127.0.0.1" when there is no header (local development).
 */
export function getClientIp(request: Request | null | undefined): string {
  if (!request) return "127.0.0.1"

  const entries = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((e) => normalize(e.trim()))
    .filter((e): e is string => !!e)

  if (entries.length === 0) {
    const realIp = normalize(request.headers.get("x-real-ip")?.trim() ?? "")
    return realIp ?? "127.0.0.1"
  }

  const hops = Number(process.env.TRUSTED_PROXY_HOPS)
  if (Number.isInteger(hops) && hops > 0) {
    return entries[Math.max(0, entries.length - hops)]
  }

  for (let i = entries.length - 1; i >= 0; i--) {
    if (!isBlockedAddress(entries[i])) return entries[i]
  }
  return entries[entries.length - 1]
}

/** Valid IP in canonical form (IPv4-mapped IPv6 unwrapped), or null. */
function normalize(value: string): string | null {
  if (!value) return null
  // Some load balancers append "ip:port" or "[ipv6]:port".
  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/)
  const ipv4WithPort = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  const candidate = bracketed?.[1] ?? ipv4WithPort?.[1] ?? value
  if (!ipaddr.isValid(candidate)) return null
  return ipaddr.process(candidate).toString()
}
