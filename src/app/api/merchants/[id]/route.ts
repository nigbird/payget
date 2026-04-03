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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Check if it's a status update or a full merchant update
    if (body.status && Object.keys(body).length <= 3) { // id, status, rejectionReason
      const updated = await db.updateMerchantStatus(id, body.status, body.rejectionReason);
      return NextResponse.json(updated);
    } else {
      const updated = await db.updateMerchant(id, body);
      return NextResponse.json(updated);
    }
  } catch (error) {
    console.error('Error updating merchant:', error);
    return NextResponse.json({ error: 'Failed to update merchant' }, { status: 500 });
  }
}
