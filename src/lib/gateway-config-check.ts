import crypto from "crypto"
import { retrieveMpgsOrder, type MpgsConfig } from "@/lib/mpgs-client"
import { encryptYagout, decryptYagout, isValidYagoutKey } from "@/lib/yagout-crypto"
import type { YagoutConfig } from "@/lib/yagout-client"

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

/**
 * Yagout's encryption API sits next to the hosted payment page, so it is derived
 * from the post URL rather than configured separately; YAGOUTPAY_ENCRYPT_URL
 * overrides that when the layout differs.
 */
function yagoutEncryptUrl(postUrl: string): string | null {
  const override = process.env.YAGOUTPAY_ENCRYPT_URL?.trim()
  if (override) return override

  const marker = "/paymentRedirection/"
  const at = postUrl.indexOf(marker)
  if (at < 0) return null
  return `${postUrl.slice(0, at)}/othersRedirection/encryption`
}

export async function checkYagoutConfig(config: YagoutConfig): Promise<ConfigCheck[]> {
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
    // block the redirect to any other host.
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

  try {
    const res = await fetch(config.postUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    })
    checks.push({
      label: "Post URL reachable",
      status: res.status >= 500 ? "warn" : "pass",
      detail: `${postUrl.hostname} responded (HTTP ${res.status}).`,
    })
  } catch (error) {
    checks.push({
      label: "Post URL reachable",
      status: "fail",
      detail: `Could not reach ${postUrl.hostname}: ${error instanceof Error ? error.message : "network error"}`,
    })
  }

  // The only proof the key is right: Yagout encrypts a probe with the key it
  // holds for this me_id, and ours must produce identical ciphertext.
  const encryptUrl = yagoutEncryptUrl(config.postUrl)
  if (!encryptUrl) {
    checks.push({
      label: "Key matches Yagout",
      status: "warn",
      detail: "Could not derive Yagout's encryption API from the post URL; set YAGOUTPAY_ENCRYPT_URL to enable this check.",
    })
    return checks
  }

  const probe = JSON.stringify({ me_id: config.meId, amount: "100" })
  try {
    const res = await fetch(encryptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/text", me_id: config.meId },
      body: probe,
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    })
    const text = await res.text()
    let theirs = ""
    try {
      theirs = String(JSON.parse(text)?.Response ?? "").trim()
    } catch {
      theirs = ""
    }

    if (!theirs) {
      checks.push({
        label: "Key matches Yagout",
        status: "warn",
        detail: `Yagout's encryption API returned no ciphertext (HTTP ${res.status}); the me_id may be unknown to this environment.`,
      })
    } else if (theirs === encryptYagout(probe, key)) {
      checks.push({
        label: "Key matches Yagout",
        status: "pass",
        detail: `Yagout confirms this key belongs to me_id ${config.meId}.`,
      })
    } else {
      let readable = false
      try {
        readable = decryptYagout(theirs, key) === probe
      } catch {
        readable = false
      }
      checks.push({
        label: "Key matches Yagout",
        status: "fail",
        detail: readable
          ? "Yagout's ciphertext decrypts with this key but differs byte-for-byte; payments may be rejected."
          : `This key does not match the one Yagout holds for me_id ${config.meId}.`,
      })
    }
  } catch (error) {
    checks.push({
      label: "Key matches Yagout",
      status: "warn",
      detail: `Could not reach Yagout's encryption API: ${error instanceof Error ? error.message : "network error"}`,
    })
  }

  return checks
}
