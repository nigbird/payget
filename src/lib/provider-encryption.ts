import { z } from "zod"
import crypto from "crypto"
import { safeJsonParse } from "./json-utils"

// Provider's payload schema for push (before encryption)
export const ProviderPushPayloadSchema = z.object({
  transactionRef: z.string().min(1),
  customerPhone: z.string().min(1),
  creditAccount: z.string().min(1), // Merchant's account number
  amount: z.number().finite().positive(),
})

export type ProviderPushPayload = z.infer<typeof ProviderPushPayloadSchema>

// Encrypted request schema
export const EncryptedPushRequestSchema = z.object({
  payload: z.string(), // Hex-encoded encrypted data
  pubkey: z.string(), // Client's public key (Base64)
  cksum: z.string(), // SHA-256 checksum of encrypted payload (hex)
  salt: z.string(), // IV (hex)
  tag: z.string(), // Auth tag (hex)
})

export type EncryptedPushRequest = z.infer<typeof EncryptedPushRequestSchema>

function toHex(buffer: Buffer): string {
  return buffer.toString("hex")
}

// Fetch server public key from provider path matched to your Postman collection
export async function fetchServerPublicKey(baseUrl: string, username?: string, password?: string): Promise<string> {
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
  let data: any
  try {
    data = safeJsonParse(text)
  } catch (e: any) {
    console.error(`Failed to parse JSON from provider public key endpoint (encryption flow). Raw response: ${text}`)
    throw new Error(`Failed to parse JSON from provider: ${e.message}`)
  }
  const serverPublicKey = data.nibServerPublicKey || data.serverPublicKey || data.publicKey || data.pubkey

  if (!serverPublicKey) {
    console.error('Provider response body missing public key (encryption flow):', JSON.stringify(data));
    throw new Error("Provider response did not contain nibServerPublicKey, serverPublicKey, or pubkey")
  }
  
  return serverPublicKey
}

// Generate ECDH key pair (secp256k1)
export function generateECDHKeyPair(): { publicKey: string; privateKey: crypto.ECDH } {
  const ecdh = crypto.createECDH("secp256k1")
  ecdh.generateKeys()
  return { publicKey: ecdh.getPublicKey("base64"), privateKey: ecdh }
}

// Derive shared secret from server public key and client private key
export function deriveSharedSecret(serverPublicKeyBase64: string, clientPrivateKey: crypto.ECDH): Buffer {
  return clientPrivateKey.computeSecret(serverPublicKeyBase64.trim(), "base64")
}

// Encrypt payload using AES-256-GCM and encode required values as hex
export function encryptPayloadForProvider(payload: ProviderPushPayload, sharedSecret: Buffer): EncryptedPushRequest {
  const iv = crypto.randomBytes(16) // Updated to 16 bytes to match Postman collection and legacy flow
  const encryptionKey = sharedSecret.length >= 32 ? sharedSecret.subarray(0, 32) : crypto.createHash('sha256').update(sharedSecret).digest()
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv)
  
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ])
  const hexCiphertext = toHex(ciphertext)
  const tag = cipher.getAuthTag()

  return {
    payload: hexCiphertext,
    pubkey: "",
    cksum: crypto.createHash("sha256").update(hexCiphertext).digest("hex"),
    salt: toHex(iv),
    tag: toHex(tag),
  }
}

// Full workflow: prepare encrypted request
export async function prepareEncryptedPushRequest(
  payload: ProviderPushPayload,
  baseUrl: string,
  username?: string,
  password?: string
): Promise<{ request: EncryptedPushRequest; clientPublicKey: string }> {
  const serverPublicKey = await fetchServerPublicKey(baseUrl, username, password)
  const { publicKey: clientPublicKey, privateKey } = generateECDHKeyPair()
  const sharedSecret = deriveSharedSecret(serverPublicKey, privateKey)
  const encryptedRequest = encryptPayloadForProvider(payload, sharedSecret)
  encryptedRequest.pubkey = clientPublicKey
  return { request: encryptedRequest, clientPublicKey }
}

// Send push request to provider
export async function sendPushToProvider(
  encryptedRequest: EncryptedPushRequest,
  baseUrl: string,
  username: string,
  password: string
): Promise<any> {
  const auth = Buffer.from(`${username}:${password}`).toString('base64')
  console.log('Sending encrypted request to provider:', {
    baseUrl,
    url: `${baseUrl}/push-payment/transfer`,
    payload: encryptedRequest.payload.substring(0, 20) + '...',
    cksum: encryptedRequest.cksum,
    pubkey: encryptedRequest.pubkey.substring(0, 20) + '...'
  })
  const response = await fetch(`${baseUrl}/push-payment/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
    },
    body: JSON.stringify(encryptedRequest),
  })
  const text = await response.text()
  console.log('Provider raw response (encryption flow):', text)
  try {
    const data = safeJsonParse(text)
    return { ...data, statusCode: response.status }
  } catch (e: any) {
    console.error(`Failed to parse JSON from provider transfer endpoint (encryption flow). Raw response: ${text}`)
    return {
      message: "Failed to parse provider response",
      statusCode: response.status,
      error: e.message
    }
  }
}