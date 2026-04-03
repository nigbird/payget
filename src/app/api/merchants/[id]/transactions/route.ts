import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const transactions = await db.getTransactionsByMerchant(id);
  return NextResponse.json(transactions);
}
