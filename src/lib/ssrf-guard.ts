import dns from "node:dns"
import type { LookupFunction } from "node:net"
import type { Agent as UndiciAgent } from "undici"
import { isBlockedAddress } from "@/lib/ip-guard"

/**
 * A `dns.lookup`-compatible function that only returns publicly-routable
 * addresses. Passed as the `connect.lookup` option to an undici `Agent`, so
 * it re-validates the destination on every connection attempt undici makes
 * through that agent — including redirects and reconnects — which is what
 * prevents a DNS-rebinding bypass of a one-time upfront check.
 */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, "")

    if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
      callback(new Error(`Refusing to connect to ${hostname}: resolves to a disallowed address`), "")
      return
    }

    if ("all" in options && options.all) {
      callback(null, addresses)
    } else {
      callback(null, addresses[0].address, addresses[0].family)
    }
  })
}

let cachedDispatcher: UndiciAgent | undefined

/**
 * Shared undici Agent for making requests to untrusted, caller-supplied URLs
 * (merchant webhook callbacks). Blocks connections to loopback/private/link-local/
 * metadata addresses — re-checked on every connect, not just once upfront — so
 * combine it with `redirect: "manual"` on the fetch call to also stop a webhook
 * target from 3xx-redirecting the request to an internal address.
 */
export async function ssrfSafeDispatcher(): Promise<UndiciAgent> {
  if (!cachedDispatcher) {
    const { Agent } = await import("undici")
    cachedDispatcher = new Agent({ connect: { lookup: safeLookup } })
  }
  return cachedDispatcher
}
