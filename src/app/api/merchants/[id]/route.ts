import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const merchant = await db.getMerchantById(id);
  if (!merchant) {
    return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
  }
  return NextResponse.json(merchant);
}
