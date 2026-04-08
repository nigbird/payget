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
    // 0. Authenticate the provider request (Auth)
    const authHeader = request.headers.get('Authorization');
    const expectedToken = process.env.PROVIDER_CALLBACK_TOKEN;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      console.error('[CALLBACK] Unauthorized: Invalid or missing PROVIDER_CALLBACK_TOKEN');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('[CALLBACK] Received raw body:', JSON.stringify(body, null, 2));
    
    const { payload, salt, tag, cksum } = body;
    // The provider might send transactionRef under different names
    const transactionRef = body.transactionRef || body.transactionReference || body.externalReference || body.requestId;

    if (!payload || !salt || !tag || !cksum) {
      console.error('[CALLBACK] Malformed payload. Missing one of: payload, salt, tag, cksum');
      return NextResponse.json({ error: 'Malformed callback payload' }, { status: 400 });
    }

    // 1. Verify Integrity (SHA-256 checksum of encrypted payload)
    const computedCksum = crypto.createHash('sha256').update(payload).digest('hex');
    if (computedCksum !== cksum) {
      console.error('[CALLBACK] Integrity check failed. Expected:', cksum, 'Computed:', computedCksum);
      return NextResponse.json({ error: 'Integrity check failed' }, { status: 400 });
    }

    // 2. Identify the transaction
    if (!transactionRef) {
       console.error('[CALLBACK] Missing transactionRef in root of request. Cannot identify transaction.');
       return NextResponse.json({ error: 'Missing transactionRef' }, { status: 400 });
    }

    const tx = await db.getTransactionByReference(transactionRef);
    if (!tx) {
      console.error('[CALLBACK] Transaction not found for reference:', transactionRef);
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const sharedSecretBase64 = tx.userCredentials.providerSharedSecret;
    if (!sharedSecretBase64) {
      console.error('[CALLBACK] Shared secret not found for transaction:', tx.id);
      return NextResponse.json({ error: 'Shared secret not found for this transaction' }, { status: 400 });
    }

    // 3. Decrypt the payload
    const sharedSecret = Buffer.from(sharedSecretBase64, 'base64');
    let decryptedData: any;
    try {
      decryptedData = decryptProviderPayload({ payload, salt, tag }, sharedSecret);
      console.log('[CALLBACK] Decrypted data:', decryptedData);
    } catch (err) {
      console.error('[CALLBACK] Decryption failed:', err);
      // Even if decryption fails, if we got a callback, something happened.
      // But we can't be sure of the status without decryption.
      return NextResponse.json({ error: 'Decryption failed' }, { status: 400 });
    }

    // 4. Update transaction status
    // If decryptedData has a status, use it. Otherwise, if we got here, maybe it's failed if it wasn't successful.
    // Some providers send error details in decryptedData.details or decryptedData.message
    const providerStatus = decryptedData.status || decryptedData.state || decryptedData.result;
    const finalStatus = providerStatus === 'success' || providerStatus === 'SUCCESS' ? 'success' : 'failed';
    
    console.log(`[CALLBACK] Updating transaction ${tx.id} status to: ${finalStatus} (Provider status: ${providerStatus})`);
    
    await db.updateTransactionStatus(tx.id, finalStatus);
    
    // Also update provider details if available
    if (decryptedData.details || decryptedData.message || decryptedData.error) {
       await db.updateTransaction(tx.id, {
         userCredentials: {
           ...tx.userCredentials,
           providerDetails: decryptedData.details || decryptedData.message || decryptedData.error
         }
       });
    }

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
