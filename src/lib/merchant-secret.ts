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

export function decryptMerchantSecretInMemory(storedValue: string): { plaintext: string } {
  if (!isEncryptedMerchantSecret(storedValue)) {
    return { plaintext: storedValue }
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

  // Validate IV length (GCM recommends 12 bytes - standard)
  if (iv.length !== 12) {
    throw new Error("Invalid IV length: must be 12 bytes")
  }

  // Validate authentication tag length (GCM requires 16 bytes)
  if (tag.length !== 16) {
    throw new Error("Invalid authentication tag length: must be 16 bytes")
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(cipherB64, "base64url")),
    decipher.final(),
  ]).toString("utf8")

  return { plaintext }
}

export function requiresRewrap(storedValue: string): boolean {
  return !isEncryptedMerchantSecret(storedValue)
}
