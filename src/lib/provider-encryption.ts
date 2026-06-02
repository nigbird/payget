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
