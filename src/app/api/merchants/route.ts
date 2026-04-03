import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function GET() {
  const merchants = await db.getMerchants();
  return NextResponse.json(merchants);
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const merchant = await db.addMerchant(data);
    return NextResponse.json(merchant, { status: 201 });
  } catch (error) {
    console.error('Error adding merchant:', error);
    return NextResponse.json({ error: 'Failed to create merchant' }, { status: 500 });
  }
}
