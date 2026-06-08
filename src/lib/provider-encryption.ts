import { z } from "zod"
import crypto from "crypto"
import { safeJsonParse } from "./json-utils"

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

  const response = await fetch(`${baseUrl}/nib-push-payment/api/get-pub-key`, {
    method: "GET",
    headers,
  })

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

export async function prepareEncryptedPushRequest(
  payload: ProviderPushPayload,
  baseUrl: string,
  username?: string,
  password?: string
): Promise<{ request: EncryptedPushRequest; clientPublicKey: string; sharedSecret: Buffer }> {
  const serverPublicKey = await fetchServerPublicKey(baseUrl, username, password)
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
  const response = await fetch(`${baseUrl}/push-payment/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(encryptedRequest),
  })

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
    const res = await fetch(`${baseUrl}/push-payment/status/${encodeURIComponent(transactionRef)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
    })
    httpStatus = res.status
    responseText = await res.text()
  } catch (err: unknown) {
    return { ok: false, statusCode: 503, error: err instanceof Error ? err.message : String(err) }
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
