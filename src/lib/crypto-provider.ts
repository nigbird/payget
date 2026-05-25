import crypto from 'crypto';
import { safeJsonParse } from './json-utils';

export interface EncryptedPayload {
  payload: string;
  pubkey: string;
  cksum: string;
  salt: string;
  tag: string;
}

export function generateECDHKeyPair() {
  const ecdh = crypto.createECDH('secp256k1');
  const publicKey = ecdh.generateKeys('base64');
  const privateKey = ecdh.getPrivateKey();
  return { publicKey, privateKey };
}

export function deriveSharedSecret(serverPublicKeyBase64: string, clientPrivateKey: Buffer): Buffer {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.setPrivateKey(clientPrivateKey);
  return ecdh.computeSecret(serverPublicKeyBase64.trim(), 'base64');
}

export function encryptProviderPayload(
  payload: any,
  sharedSecret: Buffer,
  clientPublicKey: string
): EncryptedPayload {
  const plaintext = JSON.stringify(payload);

  // ✅ Always derive key via SHA-256 (consistent, properly distributed)
  const encryptionKey = crypto.createHash('sha256').update(sharedSecret).digest();

  // ✅ 12-byte IV (NIST SP 800-38D standard for AES-GCM)
  const iv = crypto.randomBytes(12);

  // ✅ authTagLength explicitly set
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv, { authTagLength: 16 });

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const tag = cipher.getAuthTag().toString('hex');

  const cksum = crypto
    .createHash('sha256')
    .update(Buffer.from(ciphertext, 'hex'))
    .digest('hex');

  return {
    payload: ciphertext,
    pubkey: clientPublicKey,
    cksum,
    salt: iv.toString('hex'),
    tag,
  };
}

export function decryptProviderPayload(
  encryptedData: { payload: string, salt: string, tag: string, cksum: string },
  sharedSecret: Buffer
): any {
  // ✅ Always derive key via SHA-256
  const encryptionKey = crypto.createHash('sha256').update(sharedSecret).digest();

  const iv = Buffer.from(encryptedData.salt, 'hex');
  const tag = Buffer.from(encryptedData.tag, 'hex');

  // ✅ Strict 12-byte IV
  if (iv.length !== 12) {
    throw new Error("Invalid IV length: must be 12 bytes");
  }

  // ✅ Strict 16-byte tag
  if (tag.length !== 16) {
    throw new Error("Invalid authentication tag length: must be 16 bytes");
  }

  // ✅ Verify checksum before decryption
  const expectedCksum = crypto
    .createHash('sha256')
    .update(Buffer.from(encryptedData.payload, 'hex'))
    .digest('hex');

  if (expectedCksum !== encryptedData.cksum) {
    throw new Error("Checksum mismatch: payload has been tampered with");
  }

  // ✅ authTagLength explicitly set
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedData.payload, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return safeJsonParse(decrypted);
}