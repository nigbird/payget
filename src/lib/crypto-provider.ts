import crypto from 'crypto';

/**
 * Cryptographic utility for Provider Push Payment API integration.
 * Standards: ECDH (secp256k1), AES-256-GCM, SHA-256 Checksum.
 */

export interface EncryptedPayload {
  payload: string; // Hex-encoded ciphertext
  pubkey: string;  // Client's Base64-encoded public key
  cksum: string;   // SHA-256 checksum of the ciphertext
  salt: string;    // Initialization Vector (IV) Hex-encoded
  tag: string;     // AES-GCM Authentication Tag Hex-encoded
}

/**
 * Generates an ECDH key pair using the secp256k1 curve.
 */
export function generateECDHKeyPair() {
  const ecdh = crypto.createECDH('secp256k1');
  const publicKey = ecdh.generateKeys('base64');
  const privateKey = ecdh.getPrivateKey();
  return { publicKey, privateKey };
}

/**
 * Derives a shared secret from the server's public key and the client's private key.
 */
export function deriveSharedSecret(serverPublicKeyBase64: string, clientPrivateKey: Buffer): Buffer {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.setPrivateKey(clientPrivateKey);
  return ecdh.computeSecret(serverPublicKeyBase64, 'base64');
}

/**
 * Encrypts a JSON payload using AES-256-GCM with a shared secret.
 * Updates from Postman: uses Hex encoding for payload, salt, and tag.
 */
export function encryptProviderPayload(
  payload: any,
  sharedSecret: Buffer,
  clientPublicKey: string
): EncryptedPayload {
  // 1. Convert payload to string
  const plaintext = JSON.stringify(payload);

  // 2. Derive a 256-bit key from the shared secret (using SHA-256 to ensure exactly 32 bytes)
  const encryptionKey = crypto.createHash('sha256').update(sharedSecret).digest();

  // 3. Generate a unique 16-byte IV (salt) - based on 32-char hex in Postman
  const iv = crypto.randomBytes(16);

  // 4. Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);

  // 5. Encrypt
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  // 6. Get Auth Tag
  const tag = cipher.getAuthTag().toString('hex');

  // 7. Compute SHA-256 Checksum of the encrypted payload (hex)
  const cksum = crypto.createHash('sha256').update(ciphertext).digest('hex');

  return {
    payload: ciphertext,
    pubkey: clientPublicKey,
    cksum: cksum,
    salt: iv.toString('hex'),
    tag: tag
  };
}

/**
 * Decrypts a payload from the provider (used for callbacks).
 * Updates from Postman: handles Hex encoding for payload, salt, and tag.
 */
export function decryptProviderPayload(
  encryptedData: { payload: string, salt: string, tag: string },
  sharedSecret: Buffer
): any {
  const encryptionKey = crypto.createHash('sha256').update(sharedSecret).digest();
  const iv = Buffer.from(encryptedData.salt, 'hex');
  const tag = Buffer.from(encryptedData.tag, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedData.payload, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}
