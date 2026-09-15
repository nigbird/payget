import ipaddr from "ipaddr.js"

/**
 * Blocks loopback, private, link-local (including the 169.254.169.254 cloud
 * metadata endpoint), and other non-public IP ranges. `ipaddr.js` classifies
 * an address into one of several ranges; only "unicast" is a normal,
 * publicly-routable address, so everything else is denied by default rather
 * than pattern-matching specific bad ranges.
 */
export function isBlockedAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return true
  const addr = ipaddr.process(address)
  return addr.range() !== "unicast"
}

/** Strips the brackets Node's URL puts around a literal IPv6 host. */
function unwrapIpv6(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname
}

/**
 * Synchronous, DNS-free check for use at input-validation time (including
 * client-side). Catches literal-IP SSRF attempts (127.0.0.1, 169.254.169.254,
 * obfuscated forms, etc. — the WHATWG URL parser already normalizes hex/octal/
 * decimal IPv4 forms) and the "localhost" hostname. It cannot catch a hostname
 * that merely *resolves* to a private address — that is enforced at request
 * time by `ssrfSafeDispatcher` in `@/lib/ssrf-guard` (server-only, since it
 * needs Node's dns module).
 */
export function isObviouslyUnsafeCallbackHost(hostname: string): boolean {
  const host = unwrapIpv6(hostname).toLowerCase()
  if (host === "localhost" || host.endsWith(".localhost")) return true
  if (ipaddr.isValid(host)) return isBlockedAddress(host)
  return false
}
