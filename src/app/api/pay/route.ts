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
    const merchant = await db.getMerchantById(merchantId);
    if (!merchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    if (merchant.status !== 'approved') {
      return NextResponse.json({ error: 'Merchant account is not active' }, { status: 403 });
    }

    // 3. Limit Checks (Amount)
    if (amount > merchant.transactionLimit) {
      return NextResponse.json({ 
        error: 'Transaction amount exceeds per-transaction limit',
        limit: merchant.transactionLimit
      }, { status: 400 });
    }

    const merchantTxs = await db.getTransactionsByMerchant(merchantId);
    const todayTxs = merchantTxs.filter(tx => {
      const txDate = new Date(tx.timestamp).toDateString();
      const todayDate = new Date().toDateString();
      return txDate === todayDate && tx.status === 'success';
    });

    const totalTodayAmount = todayTxs.reduce((acc, tx) => acc + tx.amount, 0);
    if (totalTodayAmount + amount > merchant.dailyLimit) {
      return NextResponse.json({
        error: 'Daily processing amount limit reached',
        limit: merchant.dailyLimit
      }, { status: 400 });
    }

    // 4. Limit Checks (Count)
    if (todayTxs.length >= merchant.dailyCountLimit) {
      return NextResponse.json({
        error: 'Daily transaction count limit reached',
        limit: merchant.dailyCountLimit
      }, { status: 400 });
    }

    // 5. Process Payment (Simulated)
    const transactionId = `tx_${Math.random().toString(36).substr(2, 9)}`;
    const isSuccess = Math.random() > 0.1;

    const tx: any = {
      id: transactionId,
      merchantId,
      amount,
      status: isSuccess ? 'success' : 'failed',
      callbackUrl,
      description: description || 'Payment initiation',
      timestamp: new Date().toISOString(),
      transactionReference: `ref_${transactionId}`,
      serviceDescription: description || 'Payment initiation',
      transactionTimestamp: new Date().toISOString(),
      userCredentials: {
        phone: 'unknown',
        authToken: 'legacy_demo_auth',
      }
    };

    await db.addTransaction(tx);

    return NextResponse.json({
      transactionId: tx.id,
      status: tx.status,
      message: isSuccess ? 'Payment processed successfully' : 'Payment processing failed'
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
