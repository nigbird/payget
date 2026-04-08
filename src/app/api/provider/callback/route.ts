import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { decryptProviderPayload } from '@/lib/crypto-provider';
import crypto from 'crypto';

/**
 * Endpoint to receive payment results from the provider.
 * Follows Section 5 (Callback Mechanism) of the Integration Guide.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { payload, salt, tag, cksum, transactionRef } = body;

    if (!payload || !salt || !tag || !cksum) {
      return NextResponse.json({ error: 'Malformed callback payload' }, { status: 400 });
    }

    // 1. Verify Integrity (SHA-256 checksum of encrypted payload)
    const computedCksum = crypto.createHash('sha256').update(payload).digest('hex');
    if (computedCksum !== cksum) {
      return NextResponse.json({ error: 'Integrity check failed' }, { status: 400 });
    }

    // 2. Identify the transaction
    // Note: The provider should include a reference (e.g., our transactionReference) in the callback.
    // If it's not in the root, it might be in the decrypted payload, but we need the secret first.
    // We assume the provider sends 'transactionRef' as per the push request.
    if (!transactionRef) {
       return NextResponse.json({ error: 'Missing transactionRef' }, { status: 400 });
    }

    const tx = await db.getTransactionByReference(transactionRef);
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const sharedSecretBase64 = tx.userCredentials.providerSharedSecret;
    if (!sharedSecretBase64) {
      return NextResponse.json({ error: 'Shared secret not found for this transaction' }, { status: 400 });
    }

    // 3. Decrypt the payload
    const sharedSecret = Buffer.from(sharedSecretBase64, 'base64');
    const decryptedData = decryptProviderPayload({ payload, salt, tag }, sharedSecret);

    console.log('[CALLBACK] Decrypted data:', decryptedData);

    // 4. Update transaction status
    // Expected fields in decryptedData: status (success/failed), etc.
    const finalStatus = decryptedData.status === 'success' ? 'success' : 'failed';
    await db.updateTransactionStatus(tx.id, finalStatus);
    if (finalStatus === 'success') {
      await db.updateTransaction(tx.id, {
        userCredentials: {
          ...tx.userCredentials,
          link: {
            ...((tx.userCredentials as any).link || {}),
            status: 'USED',
            usedAt: new Date().toISOString()
          }
        }
      })
    }

    // 5. Notify the merchant (via their registered callback)
    const merchant = await db.getMerchantById(tx.merchantId);
    if (merchant && merchant.callbackUrl) {
      try {
        await fetch(merchant.callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantId: merchant.id,
            transactionId: tx.id,
            transactionReference: tx.transactionReference,
            amount: tx.amount,
            status: finalStatus,
            processedAt: new Date().toISOString(),
            providerDetails: decryptedData.details
          }),
        });
      } catch (err) {
        console.error('Failed to notify merchant callback:', err);
      }
    }

    return NextResponse.json({ message: 'Callback processed successfully' });
  } catch (error: any) {
    console.error('Error processing provider callback:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
