import crypto from "crypto"

/**
 * AES-256-CBC as specified by the YagoutPay integration document (section 3).
 *
 * Deliberately unlike every other cipher in this codebase: crypto-provider,
 * provider-encryption and merchant-secret are all AES-256-GCM with a random IV
 * per message. Yagout specifies CBC with one fixed IV shared by every merchant,
 * which means identical plaintext always encrypts to identical ciphertext.
 * That is their protocol, not a choice available to us — the gateway will not
 * decrypt anything else. Nothing here should be reused for our own payloads.
 */

/** The IV is a literal ASCII string in the spec, not hex or base64. */
const IV = Buffer.from("0123456789abcdef", "utf8")

const ALGORITHM = "aes-256-cbc"

/**
 * The spec's PHP pads manually (`pad = 16 - len % 16`, repeated) and then
 * passes OPENSSL_ZERO_PADDING to stop OpenSSL adding its own. That manual
 * scheme is exactly PKCS#7 — including the full extra block when the input is
 * already block-aligned — so Node's default auto-padding is byte-identical and
 * we let it do the work.
 */
function cipherKey(encryptionKeyB64: string): Buffer {
  const key = Buffer.from(encryptionKeyB64.trim(), "base64")

  if (key.length !== 32) {
    throw new Error(
      `Yagout encryption key must decode to 32 bytes for AES-256, got ${key.length}`
    )
  }

  return key
}

/** Encrypts to the base64 form Yagout expects in `merchant_request` and `hash`. */
export function encryptYagout(plaintext: string, encryptionKeyB64: string): string {
  const cipher = crypto.createCipheriv(ALGORITHM, cipherKey(encryptionKeyB64), IV)
  return Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]).toString("base64")
}

/** Decrypts a base64 field from a Yagout response back to its pipe-delimited form. */
export function decryptYagout(ciphertextB64: string, encryptionKeyB64: string): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, cipherKey(encryptionKeyB64), IV)
  const input = Buffer.from(ciphertextB64.trim(), "base64")
  return Buffer.concat([decipher.update(input), decipher.final()]).toString("utf8")
}

/**
 * The request signature, tilde-joined then hashed then encrypted.
 *
 * The document describes this as "sha256" but every sample it prints is an
 * 80-byte base64 blob rather than a 64-char digest. 80 bytes is exactly a
 * 64-character hex digest under PKCS#7, which is how we know the digest is
 * hex-encoded before being encrypted rather than hashed raw (that would be 48
 * bytes). Confirm against their encryption API before going live.
 *
 * Callers must pass the same `amount` string they put in txn_details — a hash
 * over "1" against a request carrying "1.00" is rejected by the gateway.
 */
export function yagoutHash(
  values: {
    meId: string
    orderNo: string
    amount: string
    country: string
    currency: string
  },
  encryptionKeyB64: string
): string {
  const canonical = [
    values.meId,
    values.orderNo,
    values.amount,
    values.country,
    values.currency,
  ].join("~")

  const digestHex = crypto.createHash("sha256").update(canonical, "utf8").digest("hex")

  return encryptYagout(digestHex, encryptionKeyB64)
}
