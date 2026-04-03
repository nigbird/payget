import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function GET() {
  const config = await db.getSystemConfig();
  return NextResponse.json(config);
}
