import { NextResponse } from 'next/server';
import { db, sanitizeTransaction } from '@/lib/db';
import { requireAuthUser, canAccessMerchant } from '@/lib/request-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; ref: string }> }
) {
  const { id, ref } = await params;
  const user = await requireAuthUser(request);

  if (!user?.id || !user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canAccessMerchant(user, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const transactions = await db.getTransactions({
    merchantId: id,
    transactionReference: ref,
    limit: 1
  });
  const transaction = transactions[0];

  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  return NextResponse.json(sanitizeTransaction(transaction));
}
