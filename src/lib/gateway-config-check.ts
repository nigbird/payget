import crypto from "crypto"
import { retrieveMpgsOrder, type MpgsConfig } from "@/lib/mpgs-client"
import { encryptYagout, isValidYagoutKey, yagoutHash } from "@/lib/yagout-crypto"
import { yagoutReturnUrls, type YagoutConfig } from "@/lib/yagout-client"
import {
  YAGOUT_CHANNEL_WEB,
  YAGOUT_COUNTRY,
  YAGOUT_CURRENCY,
  YAGOUT_TXN_TYPE,
  buildHostedMerchantRequest,
} from "@/lib/yagout-request"

/**
 * Checks a gateway configuration against the gateway itself, so an admin learns
 * a credential is wrong on the configuration screen rather than from the first
 * customer whose payment fails.
 */

export type CheckStatus = "pass" | "warn" | "fail"

export type ConfigCheck = {
  label: string
  status: CheckStatus
  detail: string
}

export type ConfigCheckReport = {
  status: CheckStatus
  /** Whose credentials were checked: this merchant's own, or the platform fallback. */
  source: "merchant" | "platform" | "form"
  checks: ConfigCheck[]
}

const REMOTE_TIMEOUT_MS = 10_000

export function summarise(checks: ConfigCheck[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail"
  if (checks.some((c) => c.status === "warn")) return "warn"
  return "pass"
}

function parseHttpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    return url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// MPGS
// ---------------------------------------------------------------------------

export async function checkMpgsConfig(config: MpgsConfig): Promise<ConfigCheck[]> {
  const checks: ConfigCheck[] = []

  const baseUrl = parseHttpsUrl(config.baseUrl)
  checks.push(
    baseUrl
      ? { label: "Gateway URL", status: "pass", detail: config.baseUrl }
      : { label: "Gateway URL", status: "fail", detail: `"${config.baseUrl}" is not a valid https URL.` },
  )

  checks.push(
    /^[A-Z]{3}$/.test(config.currency)
      ? { label: "Settlement currency", status: "pass", detail: config.currency }
      : {
          label: "Settlement currency",
          status: "fail",
          detail: `"${config.currency}" is not a 3-letter ISO 4217 code.`,
        },
  )

  if (!baseUrl) return checks

  // No MPGS operation authenticates without side effects, but looking up an order
  // that cannot exist comes close: the gateway checks the credentials first, so
  // "order not found" proves they were accepted and 401 proves they were not.
  const probeOrderId = `payget-verify-${crypto.randomBytes(6).toString("hex")}`
  const result = await retrieveMpgsOrder(config, probeOrderId)

  if (result.ok) {
    checks.push({
      label: "Credentials",
      status: "pass",
      detail: `Gateway accepted merchant ${config.merchantId}.`,
    })
  } else if (result.status === 401 || result.status === 403) {
    checks.push({
      label: "Credentials",
      status: "fail",
      detail: `Gateway rejected merchant ${config.merchantId}: wrong merchant id or password (HTTP ${result.status}).`,
    })
  } else if (result.status === 502) {
    checks.push({
      label: "Credentials",
      status: "fail",
      detail: `Could not get a valid response from ${config.baseUrl}: ${result.error}`,
    })
  } else {
    checks.push({
      label: "Credentials",
      status: "fail",
      detail: `Gateway returned HTTP ${result.status}: ${result.error}`,
    })
  }

  return checks
}

// ---------------------------------------------------------------------------
// YagoutPay
// ---------------------------------------------------------------------------

/** Pulls the message out of Yagout's HTML error page ("Invalid Merchant Id" etc.). */
function yagoutPageMessage(html: string): string {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? html
  return heading
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
}

/**
 * Yagout has no credential-check endpoint (its encryption API needs a token the
 * integration document never mentions), but its checkout page validates in a
 * fixed order and says which step failed:
 *
 *   unknown me_id         -> "Invalid Merchant Id"
 *   key cannot decrypt    -> "Invalid Encryption..."
 *
 * So we post a request built exactly as a real payment is, except that the hash
 * covers a different order number. A correct key gets past decryption and is
 * then refused on the hash, which proves the key without ever opening a
 * checkout session a customer could pay into.
 */
async function probeYagoutCheckout(config: YagoutConfig, appBaseUrl: string): Promise<ConfigCheck> {
  const label = "Credentials"
  const orderNo = `verify${crypto.randomBytes(5).toString("hex")}`
  const amount = "1.00"
  const { successUrl, failureUrl } = yagoutReturnUrls(appBaseUrl)

  let merchantRequest: string
  let hash: string
  try {
    merchantRequest = encryptYagout(
      buildHostedMerchantRequest({
        txn: {
          agId: config.aggregatorId,
          meId: config.meId,
          orderNo,
          amount,
          country: YAGOUT_COUNTRY,
          currency: YAGOUT_CURRENCY,
          txnType: YAGOUT_TXN_TYPE,
          successUrl,
          failureUrl,
          channel: YAGOUT_CHANNEL_WEB,
        },
        cust: { emailId: "verify@example.com", mobileNo: "251900000000", isLoggedIn: "Y" },
      }),
      config.encryptionKey,
    )
    // Deliberately mismatched: see the comment above.
    hash = yagoutHash(
      { meId: config.meId, orderNo: `${orderNo}x`, amount, country: YAGOUT_COUNTRY, currency: YAGOUT_CURRENCY },
      config.encryptionKey,
    )
  } catch (error) {
    return {
      label,
      status: "fail",
      detail: `Could not build a test request: ${error instanceof Error ? error.message : "unknown error"}`,
    }
  }

  let status: number
  let message: string
  try {
    const res = await fetch(config.postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ me_id: config.meId, merchant_request: merchantRequest, hash }),
      redirect: "manual",
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    })
    status = res.status
    message = yagoutPageMessage(await res.text())
  } catch (error) {
    return {
      label,
      status: "fail",
      detail: `Could not reach ${new URL(config.postUrl).hostname}: ${error instanceof Error ? error.message : "network error"}`,
    }
  }

  if (/invalid merchant/i.test(message)) {
    return {
      label,
      status: "fail",
      detail: `Yagout does not recognise me_id ${config.meId} on this endpoint ("${message}"). Check the me_id, and that it belongs to this environment (test vs live).`,
    }
  }
  if (/invalid encryption/i.test(message)) {
    return {
      label,
      status: "fail",
      detail: `Yagout knows me_id ${config.meId} but could not decrypt with this key ("${message}"). The encryption key is wrong.`,
    }
  }
  if (status >= 500) {
    return {
      label,
      status: "warn",
      detail: `Yagout returned HTTP ${status}${message ? ` ("${message}")` : ""}; could not confirm the credentials.`,
    }
  }
  return {
    label,
    status: "pass",
    detail: `Yagout accepted me_id ${config.meId} and decrypted the request with this key${message ? ` (gateway said: "${message}")` : ""}.`,
  }
}

export async function checkYagoutConfig(config: YagoutConfig, appBaseUrl: string): Promise<ConfigCheck[]> {
  const checks: ConfigCheck[] = []

  checks.push(
    /^\d+$/.test(config.meId)
      ? { label: "Merchant ID (me_id)", status: "pass", detail: config.meId }
      : {
          label: "Merchant ID (me_id)",
          status: "warn",
          detail: `"${config.meId}" is not numeric; Yagout normally issues numeric me_ids.`,
        },
  )

  // Buffer.from(..., "base64") silently drops characters it does not recognise,
  // so a key with a stray space or a missing "=" can still decode to 32 bytes of
  // the wrong value. Re-encoding catches that.
  const key = config.encryptionKey.trim()
  if (!isValidYagoutKey(key)) {
    checks.push({
      label: "Encryption key",
      status: "fail",
      detail: "Key does not decode to 32 bytes (AES-256). Check it was pasted in full.",
    })
    return checks
  }
  const canonical = Buffer.from(key, "base64").toString("base64") === key
  checks.push(
    canonical
      ? { label: "Encryption key", status: "pass", detail: "Valid base64 AES-256 key." }
      : {
          label: "Encryption key",
          status: "warn",
          detail: "Key decodes to 32 bytes but is not canonical base64 — it may contain stray characters.",
        },
  )

  const postUrl = parseHttpsUrl(config.postUrl)
  if (!postUrl) {
    checks.push({ label: "Post URL", status: "fail", detail: `"${config.postUrl}" is not a valid https URL.` })
    return checks
  }
  if (!/(^|\.)yagoutpay\.com$/i.test(postUrl.hostname)) {
    // The CSP form-action only allows *.yagoutpay.com, so the browser would
    // block the redirect to any other host — and we will not post credentials
    // to an arbitrary host either.
    checks.push({
      label: "Post URL",
      status: "fail",
      detail: `${postUrl.hostname} is not a yagoutpay.com host; the browser will block the checkout redirect.`,
    })
    return checks
  }
  const isUat = /uat/i.test(postUrl.hostname)
  checks.push({
    label: "Post URL",
    status: isUat ? "warn" : "pass",
    detail: isUat ? `${config.postUrl} (UAT/test endpoint, not live)` : config.postUrl,
  })

  checks.push(await probeYagoutCheckout({ ...config, encryptionKey: key }, appBaseUrl))

  return checks
}
