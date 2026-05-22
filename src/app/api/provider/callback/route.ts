import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { decryptProviderPayload, deriveSharedSecret } from '@/lib/crypto-provider';
import crypto from 'crypto';
import { writeAuditLog } from '@/lib/audit-log';

const TERMINAL_STATUSES = new Set(['success', 'failed']);

/**
 * Endpoint to receive payment results from the provider.
 * Follows Section 5 (Callback Mechanism) of the Integration Guide.
 */
export async function POST(request: Request) {
  try {
    const getReferenceCandidates = (value: string) => {
      const candidate = value.trim();
      const candidates = [candidate];

      if (candidate.startsWith('ref_')) {
        candidates.push(candidate.replace(/^ref_/, 'ref'));
      } else if (candidate.startsWith('ref') && !candidate.startsWith('ref_')) {
        candidates.push(candidate.replace(/^ref/, 'ref_'));
      }

      return [...new Set(candidates)];
    };

    const resolveTransactionByAnyReference = async (value: unknown) => {
      if (typeof value !== 'string' || !value.trim()) return null;
      for (const candidate of getReferenceCandidates(value)) {
        const tx = await db.getTransactionByReference(candidate);
        if (tx) return tx;
      }

      return await db.getTransactionById(value.trim());
    };

    // 0. Authenticate the provider request (Auth)
    const authHeader = request.headers.get('Authorization');
    const expectedToken = process.env.PROVIDER_CALLBACK_TOKEN;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      console.error('[CALLBACK] Unauthorized: Invalid or missing PROVIDER_CALLBACK_TOKEN');
      await writeAuditLog({
        request,
        userId: null,
        action: "PAYMENT_CALLBACK",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      });
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
      await writeAuditLog({
        request,
        userId: null,
        action: "PAYMENT_CALLBACK",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "MALFORMED_PAYLOAD", transactionRef },
      });
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
      await writeAuditLog({
        request,
        userId: null,
        action: "PAYMENT_CALLBACK",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "INTEGRITY_CHECK_FAILED", transactionRef },
      });
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

    // 4. TERMINAL STATE PROTECTION: Never modify a transaction that's already in success or failed state
    if (TERMINAL_STATUSES.has(tx.status)) {
      await writeAuditLog({
        request,
        userId: null,
        action: "PAYMENT_CALLBACK",
        entityType: "TRANSACTION",
        entityId: tx.id,
        oldValue: { status: tx.status },
        newValue: {
          result: "no_op",
          reason: "TRANSACTION_ALREADY_TERMINAL",
          currentStatus: tx.status,
          transactionReference: tx.transactionReference,
        },
      });

      // Still return 200 OK to provider to acknowledge receipt
      return NextResponse.json({ 
        message: 'Callback received (transaction already in terminal state)' 
      });
    }

    // 5. Update transaction status (source of truth: provider statusCode)
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

    // statusCode is source of truth: 0 = success, 1 = failed
    let finalStatus: "success" | "failed" | null = null;
    if (Number.isFinite(providerStatusCode)) {
      if (providerStatusCode === 0) {
        finalStatus = "success";
      } else if (providerStatusCode === 1) {
        finalStatus = "failed";
      }
    }

    // Fallback to status string only if statusCode not available
    if (!finalStatus && providerStatusString) {
      const lowerStatus = String(providerStatusString).toLowerCase();
      if (lowerStatus === "success") {
        finalStatus = "success";
      } else if (lowerStatus === "failed" || lowerStatus === "failure") {
        finalStatus = "failed";
      }
    }

    if (!finalStatus) {
      await writeAuditLog({
        request,
        userId: null,
        action: "PAYMENT_CALLBACK",
        entityType: "TRANSACTION",
        entityId: tx.id,
        newValue: {
          result: "failed",
          reason: "AMBIGUOUS_PROVIDER_STATUS",
          providerStatusCodeRaw,
          providerStatusString,
          providerStatusDesc,
        },
      });
      return NextResponse.json({ error: 'Ambiguous provider status' }, { status: 400 });
    }

    const providerCbsReference: unknown =
      decryptedData.cbsreference ?? decryptedData.cbsReference ?? decryptedData.cbs_reference ?? "";

    const providerCompany: unknown = decryptedData.company ?? "";

    console.log(
      `[CALLBACK] Updating transaction ${tx.id} status to: ${finalStatus} (statusCode: ${String(
        providerStatusCodeRaw
      )}, statusDesc: ${String(providerStatusDesc)})`
    );

    const oldStatus = tx.status;
    await db.updateTransactionStatus(tx.id, finalStatus);

    if (finalStatus === "success") {
      const { processCashbackForSettlement } = await import("@/lib/cashback/processor");
      void processCashbackForSettlement(tx.id).catch((cashbackErr) => {
        console.error("[cashback] Settlement processing failed:", cashbackErr);
      });
    }
    
    const merchant = await db.getMerchantById(tx.merchantId);
    await writeAuditLog({
      request,
      userId: null,
      action: "PAYMENT_STATUS_UPDATE",
      entityType: "TRANSACTION",
      entityId: tx.id,
      oldValue: { status: oldStatus },
      newValue: {
        result: "success",
        status: finalStatus,
        merchantId: tx.merchantId,
        merchantName: merchant?.name,
        transactionId: tx.id,
        transactionReference: tx.transactionReference,
        amount: tx.amount,
        providerStatusCode: providerStatusCodeRaw,
        providerStatusDesc: providerStatusDesc,
      },
    });

    // Persist provider callback details into transaction.userCredentials (Json)
    // PRESERVE ALL EXISTING DATA including providerSharedSecret!
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

    // 6. Notify the merchant (via their registered callback) with canonical status fields
    if (merchant && merchant.callbackUrl) {
      try {
        await fetch(merchant.callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Canonical payment status fields (source of truth)
            statusCode: providerStatusCodeRaw ?? null,
            status: finalStatus,
            
            // Provider-specific fields
            transactionId: decryptedData.transactionId ?? null,
            cbsreference: providerCbsReference,
            statusDesc: providerStatusDesc ?? null,
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
    await writeAuditLog({
      request,
      userId: null,
      action: "PAYMENT_CALLBACK",
      entityType: "TRANSACTION",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR", error: error?.message },
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
