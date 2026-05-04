import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { decryptProviderPayload, deriveSharedSecret } from '@/lib/crypto-provider';
import crypto from 'crypto';

/**
 * Endpoint to receive payment results from the provider.
 * Follows Section 5 (Callback Mechanism) of the Integration Guide.
 */
export async function POST(request: Request) {
  try {
    const resolveTransactionByAnyReference = async (value: unknown) => {
      if (typeof value !== 'string' || !value.trim()) return null;
      const candidate = value.trim();
      return (await db.getTransactionByReference(candidate)) || (await db.getTransactionById(candidate));
    };

    // 0. Authenticate the provider request (Auth)
    const authHeader = request.headers.get('Authorization');
    const expectedToken = process.env.PROVIDER_CALLBACK_TOKEN;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      console.error('[CALLBACK] Unauthorized: Invalid or missing PROVIDER_CALLBACK_TOKEN');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('[CALLBACK] Received raw body:', JSON.stringify(body, null, 2));
    
    const { payload, salt, tag, cksum, pubkey: providerPubKey } = body;
    // The provider might send transactionRef under different names
    let transactionRef =
      body.transactionRef ||
      body.transactionReference ||
      body.externalReference ||
      body.requestId ||
      body.transactionId ||
      body.cbsreference;

    if (!payload || !salt || !tag || !cksum) {
      console.error('[CALLBACK] Malformed payload. Missing one of: payload, salt, tag, cksum');
      return NextResponse.json({ error: 'Malformed callback payload' }, { status: 400 });
    }

    // 1. Verify Integrity (SHA-256 checksum of encrypted payload)
    // Provider integrations may checksum either raw hex text or decoded ciphertext bytes.
    const computedCksumFromBytes = crypto.createHash('sha256').update(Buffer.from(payload, 'hex')).digest('hex');
    const computedCksumFromText = crypto.createHash('sha256').update(payload).digest('hex');
    const normalizedIncomingCksum = String(cksum).toLowerCase();

    if (
      normalizedIncomingCksum !== computedCksumFromBytes.toLowerCase() &&
      normalizedIncomingCksum !== computedCksumFromText.toLowerCase()
    ) {
      console.error(
        '[CALLBACK] Integrity check failed. Expected:',
        cksum,
        'Computed(bytes):',
        computedCksumFromBytes,
        'Computed(text):',
        computedCksumFromText
      );
      return NextResponse.json({ error: 'Integrity check failed' }, { status: 400 });
    }

    // 2. Identify transaction and obtain shared secret
    // Prefer per-transaction shared secret when transactionRef is sent in root;
    // otherwise derive secret from provider callback pubkey + server private key.
    let tx: any = null;
    let sharedSecret: Buffer | null = null;
    let sharedSecretSource: "transaction" | "server_private_key" | "unknown" = "unknown";

    if (transactionRef) {
      tx = await resolveTransactionByAnyReference(transactionRef);
      if (!tx) {
        console.error('[CALLBACK] Transaction not found for reference:', transactionRef);
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      }

      const sharedSecretBase64 = tx.userCredentials.providerSharedSecret;
      if (!sharedSecretBase64) {
        console.error('[CALLBACK] Shared secret not found for transaction:', tx.id);
        return NextResponse.json({ error: 'Shared secret not found for this transaction' }, { status: 400 });
      }

      sharedSecret = Buffer.from(sharedSecretBase64, 'base64');
      sharedSecretSource = "transaction";
    } else if (providerPubKey) {
      const serverPrivateKeyBase64 = process.env.PROVIDER_SERVER_PRIVATE_KEY;
      if (!serverPrivateKeyBase64) {
        console.error('[CALLBACK] Missing transactionRef in root and PROVIDER_SERVER_PRIVATE_KEY is not configured');
        return NextResponse.json({ error: 'Cannot identify transaction without transactionRef or server private key' }, { status: 400 });
      }

      try {
        const serverPrivateKey = Buffer.from(serverPrivateKeyBase64.trim(), 'base64');
        sharedSecret = deriveSharedSecret(providerPubKey, serverPrivateKey);
        sharedSecretSource = "server_private_key";
      } catch (err) {
        console.error('[CALLBACK] Failed to derive shared secret from provider pubkey:', err);
        return NextResponse.json({ error: 'Failed to derive callback shared secret' }, { status: 400 });
      }
    } else {
      console.error('[CALLBACK] Missing both transactionRef and callback pubkey. Cannot identify transaction.');
      return NextResponse.json({ error: 'Missing transactionRef and pubkey' }, { status: 400 });
    }

    if (!sharedSecret) {
      return NextResponse.json({ error: 'Missing shared secret' }, { status: 400 });
    }

    // 3. Decrypt the payload
    let decryptedData: any;
    try {
      console.log(`[CALLBACK] Decrypting using sharedSecretSource=${sharedSecretSource}`);
      decryptedData = decryptProviderPayload({ payload, salt, tag }, sharedSecret);
      console.log('[CALLBACK] Decrypted data:', decryptedData);
    } catch (err) {
      console.error('[CALLBACK] Decryption failed:', err);
      // Even if decryption fails, if we got a callback, something happened.
      // But we can't be sure of the status without decryption.
      return NextResponse.json({ error: 'Decryption failed' }, { status: 400 });
    }

    // If root reference was absent, recover it from decrypted payload and resolve tx.
    if (!transactionRef) {
      transactionRef =
        decryptedData.transactionRef ||
        decryptedData.transactionReference ||
        decryptedData.externalReference ||
        decryptedData.requestId ||
        decryptedData.transactionId ||
        decryptedData.cbsreference;

      if (!transactionRef) {
        console.error('[CALLBACK] Missing transactionRef in both root and decrypted payload');
        return NextResponse.json({ error: 'Missing transactionRef' }, { status: 400 });
      }

      tx = await resolveTransactionByAnyReference(transactionRef);
      if (!tx) {
        console.error('[CALLBACK] Transaction not found for decrypted reference:', transactionRef);
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      }
    }

    // 4. Update transaction status
    const providerStatusDesc: unknown =
      decryptedData.statusDesc ?? decryptedData.status_desc ?? decryptedData.statusDescription;

    const providerStatusCodeRaw: unknown =
      decryptedData.statusCode ?? decryptedData.status_code ?? decryptedData.resultCode;

    const providerStatusString: unknown =
      decryptedData.status ?? decryptedData.state ?? decryptedData.result;

    const providerStatusCode = (() => {
      if (typeof providerStatusCodeRaw === "number") return providerStatusCodeRaw;
      if (typeof providerStatusCodeRaw === "string") {
        const n = Number(providerStatusCodeRaw);
        return Number.isFinite(n) ? n : NaN;
      }
      return NaN;
    })();

    // Convention used by your example: statusCode "0" => success, anything else => failed
    const finalStatus: "success" | "failed" = Number.isFinite(providerStatusCode)
      ? providerStatusCode === 0
        ? "success"
        : "failed"
      : providerStatusString === "success" || providerStatusString === "SUCCESS"
        ? "success"
        : "failed";

    const providerCbsReference: unknown =
      decryptedData.cbsreference ?? decryptedData.cbsReference ?? decryptedData.cbs_reference ?? "";

    const providerCompany: unknown = decryptedData.company ?? "";

    console.log(
      `[CALLBACK] Updating transaction ${tx.id} status to: ${finalStatus} (statusCode: ${String(
        providerStatusCodeRaw
      )}, statusDesc: ${String(providerStatusDesc)})`
    );

    await db.updateTransactionStatus(tx.id, finalStatus);

    // Persist provider callback details into transaction.userCredentials (Json)
    await db.updateTransaction(tx.id, {
      userCredentials: {
        ...tx.userCredentials,
        providerCallback: {
          transactionId:
            decryptedData.transactionId ??
            decryptedData.transactionRef ??
            decryptedData.transactionReference ??
            null,
          cbsreference: providerCbsReference,
          statusDesc: providerStatusDesc ?? null,
          statusCode: providerStatusCodeRaw ?? null,
          company: providerCompany ?? null,
          amount: decryptedData.amount ?? null,
          raw: decryptedData,
        },
        providerDetails: providerStatusDesc ?? decryptedData.details ?? decryptedData.message ?? decryptedData.error ?? null,
      },
    });

    if (finalStatus === "success" || finalStatus === "failed") {
      await db.updateTransaction(tx.id, {
        userCredentials: {
          ...tx.userCredentials,
          link: {
            ...(((tx.userCredentials as any).link as any) || {}),
            status: "USED",
            usedAt: new Date().toISOString(),
          },
        },
      })
    }

    // 5. Notify the merchant (via their registered callback)
    const merchant = await db.getMerchantById(tx.merchantId);
    if (merchant && merchant.callbackUrl) {
      try {
        await fetch(merchant.callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionId: decryptedData.transactionId ?? null,
            cbsreference: providerCbsReference,
            statusDesc: providerStatusDesc ?? null,
            statusCode: providerStatusCodeRaw ?? null,
            company: providerCompany ?? null,
            amount: decryptedData.amount ?? null,

            // Keep extra context without breaking required fields above
            transactionReference: tx.transactionReference,
            processedAt: new Date().toISOString(),
          }),
        });
      } catch (err) {
        console.error("Failed to notify merchant callback:", err);
      }
    }

    return NextResponse.json({ message: 'Callback processed successfully' });
  } catch (error: any) {
    console.error('Error processing provider callback:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
