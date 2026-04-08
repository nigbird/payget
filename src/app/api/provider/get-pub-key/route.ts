import { NextResponse } from 'next/server';

/**
 * Public Key Endpoint (EP) for the provider.
 * Returns the server's public key for ECDH key exchange.
 */
export async function GET() {
  const publicKey = process.env.PROVIDER_SERVER_PUBLIC_KEY;

  if (!publicKey) {
    console.error('[GET-PUB-KEY] Server public key not configured');
    return NextResponse.json({ error: 'Server public key not configured' }, { status: 500 });
  }

  return NextResponse.json({
    nibServerPublicKey: publicKey, // Follow the provider's expected format
    publicKey: publicKey,
    status: 'success'
  });
}
