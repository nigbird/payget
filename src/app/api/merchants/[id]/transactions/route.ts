import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { requireAuthUser } from '@/lib/request-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireAuthUser(request);

  if (!user?.id || !user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role === 'MERCHANT' && user.merchantId !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (user.role === 'SALES' && !user.assignedMerchantIds?.includes(id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const transactions = await db.getTransactionsByMerchant(id);
  const visibleTransactions =
    user.role === 'SALES'
      ? transactions.filter((tx) => tx.userCredentials.initiatedById === user.id)
      : transactions;

  return NextResponse.json(visibleTransactions);
}
