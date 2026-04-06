import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { auth } from '@/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const user = session?.user as { id?: string; role?: string; merchantId?: string | null } | undefined;

  if (!user?.id || !user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if ((user.role === 'MERCHANT' || user.role === 'SALES') && user.merchantId !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const transactions = await db.getTransactionsByMerchant(id);
  const visibleTransactions =
    user.role === 'SALES'
      ? transactions.filter((tx) => tx.userCredentials.initiatedById === user.id)
      : transactions;

  return NextResponse.json(visibleTransactions);
}
