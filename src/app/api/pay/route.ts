import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { merchantId, amount, callbackUrl, description } = body;

    // 1. Basic Validation
    if (!merchantId || !amount || !callbackUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 2. Merchant Status Check
    const merchant = db.getMerchantById(merchantId);
    if (!merchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    if (merchant.status !== 'approved') {
      return NextResponse.json({ error: 'Merchant account is not active' }, { status: 403 });
    }

    // 3. Limit Check
    if (amount > merchant.transactionLimit) {
      return NextResponse.json({ 
        error: 'Transaction amount exceeds per-transaction limit',
        limit: merchant.transactionLimit
      }, { status: 400 });
    }

    // 4. Process Payment (Simulated)
    const transactionId = `tx_${Math.random().toString(36).substr(2, 9)}`;
    const isSuccess = Math.random() > 0.1; // 90% success rate

    const tx = {
      id: transactionId,
      merchantId,
      amount,
      status: isSuccess ? 'success' : 'failed' as any,
      callbackUrl,
      description: description || 'Payment initiation',
      timestamp: new Date().toISOString()
    };

    db.addTransaction(tx);

    // 5. Notify Merchant (Simulated Callback)
    // In a real app, this would be an async webhook request
    console.log(`[Webhook] Sending update to ${callbackUrl}: Status ${tx.status} for Tx ${tx.id}`);

    return NextResponse.json({
      transactionId: tx.id,
      status: tx.status,
      message: isSuccess ? 'Payment processed successfully' : 'Payment processing failed'
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}