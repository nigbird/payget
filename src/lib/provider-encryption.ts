import { z } from "zod"
import crypto from "crypto"

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
export async function fetchServerPublicKey(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/nib-push-payment/api/get-pub-key`)
  if (!response.ok) throw new Error("Failed to fetch server public key from provider")
  const data = await response.json()
  return data.serverPublicKey
}

// Generate ECDH key pair (secp256k1)
export function generateECDHKeyPair(): { publicKey: string; privateKey: crypto.ECDH } {
  const ecdh = crypto.createECDH("secp256k1")
  ecdh.generateKeys()
  return { publicKey: ecdh.getPublicKey("base64"), privateKey: ecdh }
}

// Derive shared secret from server public key and client private key
export function deriveSharedSecret(serverPublicKeyBase64: string, clientPrivateKey: crypto.ECDH): Buffer {
  return clientPrivateKey.computeSecret(serverPublicKeyBase64, "base64")
}

// Encrypt payload using AES-256-GCM and encode required values as hex
export function encryptPayloadForProvider(payload: ProviderPushPayload, sharedSecret: Buffer): EncryptedPushRequest {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", sharedSecret, iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return {
    payload: toHex(ciphertext),
    pubkey: "",
    cksum: toHex(crypto.createHash("sha256").update(ciphertext).digest()),
    salt: toHex(iv),
    tag: toHex(tag),
  }
}

// Full workflow: prepare encrypted request
export async function prepareEncryptedPushRequest(
  payload: ProviderPushPayload,
  baseUrl: string
): Promise<{ request: EncryptedPushRequest; clientPublicKey: string }> {
  const serverPublicKey = await fetchServerPublicKey(baseUrl)
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
  const response = await fetch(`${baseUrl}/push-payment/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
    },
    body: JSON.stringify(encryptedRequest),
  })
  return response.json()
}