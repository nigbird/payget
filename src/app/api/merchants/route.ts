import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function GET() {
  const merchants = await db.getMerchants();
  return NextResponse.json(merchants);
}
