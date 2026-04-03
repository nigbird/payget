import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  const status = searchParams.get('status');
  
  let transactions = await db.getTransactions();
  
  if (phone) {
    transactions = transactions.filter(tx => tx.payerPhone === phone || tx.userCredentials.phone === phone);
  }
  
  if (status) {
    transactions = transactions.filter(tx => tx.status === status);
  }
  
  return NextResponse.json(transactions);
}
