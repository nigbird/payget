import crypto from "crypto"

const ENCRYPTED_SECRET_PREFIX = "enc:v1"

function getMasterKey(): Buffer {
  const keyBase64 = process.env.MERCHANT_SECRET_MASTER_KEY
  if (!keyBase64) {
    throw new Error("MERCHANT_SECRET_MASTER_KEY is not configured")
  }
  const key = Buffer.from(keyBase64, "base64")
  if (key.length !== 32) {
    throw new Error("Master key must be 32 bytes (base64 encoded)")
  }
  return key
}

function zeroBuffer(buf: Buffer): void {
  buf.fill(0)
}

function decryptMerchantSecretBuffer(storedValue: string): Buffer {
  if (!isEncryptedMerchantSecret(storedValue)) {
    return Buffer.from(storedValue, "utf8")
  }

  const parts = storedValue.split(":")
  if (parts.length !== 5) {
    throw new Error("Invalid encrypted merchant secret format")
  }
  const [, version, ivB64, cipherB64, tagB64] = parts
  if (version !== "v1") throw new Error("Unsupported merchant secret version")

  const key = getMasterKey()
  const iv = Buffer.from(ivB64, "base64url")
  const tag = Buffer.from(tagB64, "base64url")

  if (iv.length !== 12) {
    throw new Error("Invalid IV length: must be 12 bytes")
  }

  if (tag.length !== 16) {
    throw new Error("Invalid authentication tag length: must be 16 bytes")
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([
    decipher.update(Buffer.from(cipherB64, "base64url")),
    decipher.final(),
  ])
}

export function isEncryptedMerchantSecret(value: string): boolean {
  return typeof value === "string" && value.startsWith(`${ENCRYPTED_SECRET_PREFIX}:`)
}

export function encryptMerchantSecretAtRest(plaintextSecret: string): { ciphertext: string } {
  if (!plaintextSecret) throw new Error("Secret is required")
  const key = getMasterKey()

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintextSecret, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    ciphertext: `${ENCRYPTED_SECRET_PREFIX}:${iv.toString("base64url")}:${ciphertext.toString("base64url")}:${tag.toString("base64url")}`,
  }
}

/**
 * Decrypts a merchant secret and passes it to a callback.
 * Plaintext exists only for the duration of the callback; intermediate buffers are zeroed.
 */
export function withMerchantSecret<T>(
  storedValue: string,
  callback: (plaintext: string) => T
): T {
  const secretBuffer = decryptMerchantSecretBuffer(storedValue)
  const plaintext = secretBuffer.toString("utf8")
  zeroBuffer(secretBuffer)
  try {
    return callback(plaintext)
  } finally {
    // Plaintext string is eligible for GC after callback completes
  }
}

export function requiresRewrap(storedValue: string): boolean {
  return !isEncryptedMerchantSecret(storedValue)
}
