import { z } from "zod"
import { CompactEncrypt, compactDecrypt, importJWK, base64url } from "jose"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// Payload schema required by the gateway contract.
export const PaymentPayloadSchema = z.object({
  merchantId: z.string().min(1),
  transactionId: z.string().min(1),
  userCredentials: z.object({
    phone: z.string().min(1),
    authToken: z.string().min(1),
  }),
  amount: z.number().finite().positive(),
  serviceDescription: z.string().min(1),
  timestamp: z.string().min(1), // ISO string
  transactionReference: z.string().min(1), // Gateway-generated
  status: z
    .enum(["initiated", "pending", "awaiting_pin", "processing", "success", "failed"])
    .default("awaiting_pin"),
  expiresAt: z.string().optional(),
  linkStatus: z.enum(["PENDING", "USED", "EXPIRED"]).optional(),
})

export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>

async function deriveJwkKey(jweSecret: string) {
  const secretBytes = encoder.encode(jweSecret)
  const hashBuf = await crypto.subtle.digest("SHA-256", secretBytes)
  const hashBytes = new Uint8Array(hashBuf)

  // Symmetric direct encryption key for JWE (dir + A256GCM).
  const jwk = { kty: "oct", k: base64url.encode(hashBytes) }
  return importJWK(jwk, "A256GCM")
}

export function validatePayloadSchema(payload: unknown) {
  return PaymentPayloadSchema.parse(payload)
}

export function buildPaymentPayload(input: PaymentPayload): PaymentPayload {
  // Ensures we store/ship exactly the required contract.
  return PaymentPayloadSchema.parse(input)
}

export async function encryptPayload(payload: PaymentPayload, jweSecret: string, kid?: string) {
  const key = await deriveJwkKey(jweSecret)
  const plaintext = encoder.encode(JSON.stringify(payload))

  return new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", ...(kid ? { kid } : {}) })
    .encrypt(key)
}

export async function decryptPayload(token: string, jweSecret: string): Promise<PaymentPayload> {
  const key = await deriveJwkKey(jweSecret)
  const { plaintext } = await compactDecrypt(token, key)
  const json = decoder.decode(plaintext)
  const parsed = JSON.parse(json)
  return validatePayloadSchema(parsed)
}

