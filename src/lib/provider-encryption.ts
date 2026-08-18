import { z } from "zod"
import crypto from "crypto"
import { safeJsonParse } from "./json-utils"

const PROVIDER_TIMEOUT_MS = 15_000
const PROVIDER_RETRY_ATTEMPTS = 3
const PROVIDER_RETRY_BASE_DELAY_MS = 600

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Retries a fetch request with exponential backoff.
 * retryOn5xx=true for idempotent GET calls; false for POST payment initiations
 * where a 5xx could mean the provider accepted the request but failed to respond.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  {
    timeoutMs = PROVIDER_TIMEOUT_MS,
    attempts = PROVIDER_RETRY_ATTEMPTS,
    baseDelayMs = PROVIDER_RETRY_BASE_DELAY_MS,
    retryOn5xx = true,
  }: { timeoutMs?: number; attempts?: number; baseDelayMs?: number; retryOn5xx?: boolean } = {}
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs)
      if (retryOn5xx && res.status >= 500 && attempt < attempts - 1) {
        console.warn(`Provider returned ${res.status} on attempt ${attempt + 1}, retrying...`)
        await delay(baseDelayMs * 2 ** attempt)
        continue
      }
      return res
    } catch (err) {
      lastError = err
      if (attempt < attempts - 1) {
        const isTimeout = err instanceof Error && err.name === "AbortError"
        console.warn(`Provider fetch ${isTimeout ? "timed out" : "failed"} on attempt ${attempt + 1} (${url}), retrying...`)
        await delay(baseDelayMs * 2 ** attempt)
      }
    }
  }
  throw lastError
}

// Provider's payload schema for push (before encryption)
export const ProviderPushPayloadSchema = z.object({
  amount: z.number().finite().positive(),
  callbackUrl: z.string().url().optional(),
  company: z.string().min(1),
  creditAccount: z.string().min(1),
  customerPhone: z.string().min(1),
  description: z.string().min(1).optional(),
  merchantName: z.string().min(1).optional(),
  transactionRef: z.string().min(1),
})

export type ProviderPushPayload = z.infer<typeof ProviderPushPayloadSchema>

export const EncryptedPushRequestSchema = z.object({
  payload: z.string(),
  pubkey: z.string(),
  cksum: z.string(),
  salt: z.string(),
  tag: z.string(),
})

export type EncryptedPushRequest = z.infer<typeof EncryptedPushRequestSchema>

export type ProviderPushResponse = {
  message?: string
  statusCode: number
  details?: string
  error?: string
  sharedSecret?: string
}

export type ProviderConfig = {
  baseUrl: string
  username: string
  password: string
}

function toHex(buffer: Buffer): string {
  return buffer.toString("hex")
}

export function resolveProviderConfig(): ProviderConfig {
  const baseUrl = process.env.PROVIDER_BASE_URL?.trim()
  const username = process.env.PROVIDER_USERNAME?.trim()
  const password = process.env.PROVIDER_PASSWORD?.trim()

  if (!baseUrl || !username || !password) {
    throw new Error(
      "Provider credentials not configured (PROVIDER_BASE_URL, PROVIDER_USERNAME, PROVIDER_PASSWORD)"
    )
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), username, password }
}

export function generateProviderTransactionRef(): string {
  return `ref${Math.random().toString(36).slice(2, 11)}`
}

export function isProviderPushSuccess(response: ProviderPushResponse): boolean {
  return response.statusCode === 200
}

export async function fetchServerPublicKey(
  baseUrl: string,
  username?: string,
  password?: string
): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }

  if (username && password) {
    const auth = Buffer.from(`${username}:${password}`).toString("base64")
    headers["Authorization"] = `Basic ${auth}`
  }

  const response = await fetchWithRetry(
    `${baseUrl}/nib-push-payment/api/get-pub-key`,
    { method: "GET", headers },
    { retryOn5xx: true }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch server public key from provider: ${response.statusText}`)
  }

  const text = await response.text()
  let data: Record<string, unknown>
  try {
    data = safeJsonParse(text)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(
      "Failed to parse JSON from provider public key endpoint. Raw response: %s",
      text
    )
    throw new Error(`Failed to parse JSON from provider: ${message}`)
  }

  const serverPublicKey =
    data.nibServerPublicKey || data.serverPublicKey || data.publicKey || data.pubkey

  if (!serverPublicKey || typeof serverPublicKey !== "string") {
    console.error("Provider response body missing public key:", JSON.stringify(data))
    throw new Error("Provider response did not contain a server public key")
  }

  return serverPublicKey
}

export function generateECDHKeyPair(): { publicKey: string; privateKey: crypto.ECDH } {
  const ecdh = crypto.createECDH("secp256k1")
  ecdh.generateKeys()
  return { publicKey: ecdh.getPublicKey("base64"), privateKey: ecdh }
}

export function deriveSharedSecret(
  serverPublicKeyBase64: string,
  clientPrivateKey: crypto.ECDH
): Buffer {
  return clientPrivateKey.computeSecret(serverPublicKeyBase64.trim(), "base64")
}

export function encryptPayloadForProvider(
  payload: ProviderPushPayload,
  sharedSecret: Buffer
): EncryptedPushRequest {
  const iv = crypto.randomBytes(16)
  const encryptionKey =
    sharedSecret.length >= 32
      ? sharedSecret.subarray(0, 32)
      : crypto.createHash("sha256").update(sharedSecret).digest()

  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv)
  const rawJsonString = JSON.stringify(payload)
  const ciphertext = Buffer.concat([cipher.update(rawJsonString, "utf8"), cipher.final()])
  const hexCiphertext = toHex(ciphertext)
  const tag = cipher.getAuthTag()

  return {
    payload: hexCiphertext,
    pubkey: "",
    cksum: crypto.createHash("sha256").update(Buffer.from(hexCiphertext, "hex")).digest("hex"),
    salt: toHex(iv),
    tag: toHex(tag),
  }
}

// The provider's ECDH public key is static between rotations, so refetching it
// on every push wastes a full HTTPS round-trip. Cache it in memory for the TTL
// below; invalidateCachedProviderPublicKey() drops it early if the provider
// signals the key is no longer valid (e.g. an auth rejection on push).
const PUBLIC_KEY_CACHE_TTL_MS = 12 * 60 * 60_000

let cachedPublicKey: { key: string; fetchedAt: number } | null = null

export function invalidateCachedProviderPublicKey(): void {
  cachedPublicKey = null
}

async function getCachedServerPublicKey(
  baseUrl: string,
  username?: string,
  password?: string
): Promise<string> {
  if (cachedPublicKey && Date.now() - cachedPublicKey.fetchedAt < PUBLIC_KEY_CACHE_TTL_MS) {
    return cachedPublicKey.key
  }
  const key = await fetchServerPublicKey(baseUrl, username, password)
  cachedPublicKey = { key, fetchedAt: Date.now() }
  return key
}

export async function prepareEncryptedPushRequest(
  payload: ProviderPushPayload,
  baseUrl: string,
  username?: string,
  password?: string
): Promise<{ request: EncryptedPushRequest; clientPublicKey: string; sharedSecret: Buffer }> {
  const serverPublicKey = await getCachedServerPublicKey(baseUrl, username, password)
  const { publicKey: clientPublicKey, privateKey } = generateECDHKeyPair()
  const sharedSecret = deriveSharedSecret(serverPublicKey, privateKey)
  const encryptedRequest = encryptPayloadForProvider(payload, sharedSecret)
  encryptedRequest.pubkey = clientPublicKey
  return { request: encryptedRequest, clientPublicKey, sharedSecret }
}

export async function sendPushToProvider(
  encryptedRequest: EncryptedPushRequest,
  baseUrl: string,
  username: string,
  password: string
): Promise<ProviderPushResponse> {
  const auth = Buffer.from(`${username}:${password}`).toString("base64")
  // POST is not idempotent — only retry on network/timeout errors, never on 5xx
  // (a 5xx could mean the provider accepted the payment but failed to send a response)
  const response = await fetchWithRetry(
    `${baseUrl}/push-payment/transfer`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(encryptedRequest),
    },
    { retryOn5xx: false, timeoutMs: 20_000 }
  )

  const text = await response.text()
  try {
    const data = safeJsonParse(text) as Record<string, unknown>
    return {
      message: data.message as string | undefined,
      statusCode: response.status,
      details: data.details as string | undefined,
      error: data.error as string | undefined,
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error("Failed to parse JSON from provider transfer endpoint. Raw response: %s", text)
    return {
      message: "Failed to parse provider response",
      statusCode: response.status,
      error: message,
    }
  }
}

export type ProviderStatusPaymentStatus = "PAID" | "NOT_PAID" | "PENDING"

export type ProviderStatusResponse = {
  ok: true
  transactionId: string
  customerPhone: string
  amount: number
  paymentStatus: ProviderStatusPaymentStatus
  cbsreference: string
  message: string
  updatedAt: string
  raw: Record<string, unknown>
} | {
  ok: false
  statusCode: number
  error: string
}

/**
 * Calls the provider's status endpoint and decrypts the response using the
 * transaction's established shared secret (AES-256-GCM).
 */
export async function checkTransactionStatusAtProvider(
  transactionRef: string,
  sharedSecretBase64: string,
  config?: ProviderConfig
): Promise<ProviderStatusResponse> {
  const { baseUrl, username, password } = config ?? resolveProviderConfig()
  const auth = Buffer.from(`${username}:${password}`).toString("base64")

  let responseText: string
  let httpStatus: number
  try {
    const res = await fetchWithRetry(
      `${baseUrl}/push-payment/status/${encodeURIComponent(transactionRef)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
      },
      { retryOn5xx: true }
    )
    httpStatus = res.status
    responseText = await res.text()
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "AbortError"
    return {
      ok: false,
      statusCode: isTimeout ? 408 : 503,
      error: isTimeout ? "Provider status check timed out" : (err instanceof Error ? err.message : String(err)),
    }
  }

  let envelope: Record<string, unknown>
  try {
    envelope = safeJsonParse(responseText)
  } catch {
    return { ok: false, statusCode: httpStatus, error: "Failed to parse provider status response" }
  }

  const { payload, salt, tag, cksum } = envelope as {
    payload?: string; salt?: string; tag?: string; cksum?: string
  }

  if (!payload || !salt || !tag || !cksum) {
    return { ok: false, statusCode: httpStatus, error: "Malformed status response: missing encrypted fields" }
  }

  // Verify integrity (SHA-256 checksum over ciphertext bytes, same logic as callback)
  const computedCksumBytes = crypto.createHash("sha256").update(Buffer.from(payload, "hex")).digest("hex")
  const computedCksumText = crypto.createHash("sha256").update(payload).digest("hex")
  if (
    String(cksum).toLowerCase() !== computedCksumBytes.toLowerCase() &&
    String(cksum).toLowerCase() !== computedCksumText.toLowerCase()
  ) {
    return { ok: false, statusCode: httpStatus, error: "Integrity check failed: checksum mismatch" }
  }

  // Decrypt using the established shared secret
  const sharedSecret = Buffer.from(sharedSecretBase64, "base64")
  const encryptionKey =
    sharedSecret.length >= 32
      ? sharedSecret.subarray(0, 32)
      : crypto.createHash("sha256").update(sharedSecret).digest()

  let decrypted: Record<string, unknown>
  try {
    const iv = Buffer.from(salt, "hex")
    const authTag = Buffer.from(tag, "hex")
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv)
    decipher.setAuthTag(authTag)
    let plain = decipher.update(payload, "hex", "utf8")
    plain += decipher.final("utf8")
    decrypted = safeJsonParse(plain)
  } catch (err: unknown) {
    return { ok: false, statusCode: httpStatus, error: "Decryption failed: " + (err instanceof Error ? err.message : String(err)) }
  }

  const paymentStatus = (decrypted.paymentStatus ?? decrypted.status ?? decrypted.state) as string | undefined
  if (!paymentStatus) {
    return { ok: false, statusCode: httpStatus, error: "Decrypted payload missing paymentStatus" }
  }

  const normalized = paymentStatus.toUpperCase()
  const mappedStatus: ProviderStatusPaymentStatus =
    normalized === "PAID" ? "PAID" : normalized === "NOT_PAID" ? "NOT_PAID" : "PENDING"

  return {
    ok: true,
    transactionId: String(decrypted.transactionId ?? ""),
    customerPhone: String(decrypted.customerPhone ?? ""),
    amount: Number(decrypted.amount ?? 0),
    paymentStatus: mappedStatus,
    cbsreference: String(decrypted.cbsreference ?? decrypted.cbsReference ?? ""),
    message: String(decrypted.message ?? ""),
    updatedAt: String(decrypted.updatedAt ?? ""),
    raw: decrypted,
  }
}

/**
 * Unified Postman-aligned push payment client.
 * Fetches pubkey, encrypts payload, POSTs to /push-payment/transfer, returns shared secret for callbacks.
 */
export async function sendProviderPushPayment(
  payload: ProviderPushPayload,
  config?: ProviderConfig
): Promise<ProviderPushResponse> {
  const { baseUrl, username, password } = config ?? resolveProviderConfig()
  const validated = ProviderPushPayloadSchema.parse(payload)

  try {
    const { request: encryptedRequest, sharedSecret } = await prepareEncryptedPushRequest(
      validated,
      baseUrl,
      username,
      password
    )

    // Debug log to verify exactly what is sent to the provider transfer endpoint.
    console.log("Sending encrypted payload to provider:", encryptedRequest)

    const response = await sendPushToProvider(encryptedRequest, baseUrl, username, password)

    if (!isProviderPushSuccess(response)) {
      if (response.statusCode === 401) {
        // Auth/key rejection, not a normal business decline — the cached public
        // key may be stale (provider rotated it). Force a refetch next attempt.
        invalidateCachedProviderPublicKey()
      }
      return response
    }

    return {
      ...response,
      sharedSecret: sharedSecret.toString("base64"),
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error during provider push request:", error)
    return {
      message: "Failed to communicate with provider",
      statusCode: 500,
      error: message,
    }
  }
}
