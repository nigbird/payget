import { generateECDHKeyPair, deriveSharedSecret, encryptProviderPayload } from './crypto-provider';

/**
 * Client for interacting with the external Payment Provider API.
 * Follows Version 1.0 of the Push Payment Integration Guide.
 */

const PROVIDER_BASE_URL = process.env.PROVIDER_BASE_URL || 'https://api.provider.com';
const PROVIDER_USERNAME = process.env.PROVIDER_USERNAME || '';
const PROVIDER_PASSWORD = process.env.PROVIDER_PASSWORD || '';

export interface PushPaymentRequest {
  transactionRef: string;
  customerPhone: string;
  creditAccount: string;
  amount: number;
}

export interface ProviderResponse {
  message: string;
  statusCode: number;
  details?: string;
  error?: string;
  sharedSecret?: string; // Base64-encoded shared secret
}

/**
 * Fetches the server's public key from the provider.
 * Endpoint updated from Postman: /nib-push-payment/api/get-pub-key
 */
async function fetchServerPublicKey(): Promise<string> {
  const response = await fetch(`${PROVIDER_BASE_URL}/nib-push-payment/api/get-pub-key`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch server public key: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.serverPublicKey) {
    throw new Error('Provider response did not contain serverPublicKey');
  }

  return data.serverPublicKey;
}

/**
 * Initiates a push payment via the provider.
 * Endpoint updated from Postman: /push-payment/transfer
 */
export async function sendProviderPushRequest(request: PushPaymentRequest): Promise<ProviderResponse> {
  try {
    // 1. Retrieve Server Public Key
    const serverPublicKey = await fetchServerPublicKey();

    // 2. Generate Client Key Pair
    const { publicKey: clientPublicKey, privateKey: clientPrivateKey } = generateECDHKeyPair();

    // 3. Derive Shared Secret
    const sharedSecret = deriveSharedSecret(serverPublicKey, clientPrivateKey);

    // 4. Encrypt Payload according to Provider API
    const encryptedData = encryptProviderPayload(request, sharedSecret, clientPublicKey);

    // 5. Build Basic Auth Header
    const authHeader = `Basic ${Buffer.from(`${PROVIDER_USERNAME}:${PROVIDER_PASSWORD}`).toString('base64')}`;

    // 6. Send POST /push-payment/transfer
    const response = await fetch(`${PROVIDER_BASE_URL}/push-payment/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(encryptedData)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        message: data.message || 'Provider request failed',
        statusCode: response.status,
        details: data.details,
        error: data.error
      };
    }

    return {
      message: data.message,
      statusCode: data.statusCode || response.status,
      details: data.details,
      sharedSecret: sharedSecret.toString('base64')
    };
  } catch (error: any) {
    console.error('Error during provider push request:', error);
    return {
      message: 'Failed to communicate with provider',
      statusCode: 500,
      error: error.message
    };
  }
}
