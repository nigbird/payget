import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { requireAuthUser } from '@/lib/request-auth';

export async function GET(request: Request) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  const status = searchParams.get('status');
  
  const filters: any = {};
  if (phone) filters.phone = phone;
  if (status) filters.status = status;

  // If merchant or sales, they shouldn't query all global transactions
  if (user.role === 'MERCHANT' && user.merchantId) {
    filters.merchantId = user.merchantId;
  } else if (user.role === 'SALES') {
    filters.merchantIds = user.assignedMerchantIds || [];
    // Sales users typically only see transactions they initiated
    filters.initiatedById = user.id;
  }
  
  const transactions = await db.getTransactions(filters);
  
  return NextResponse.json(transactions);
}
