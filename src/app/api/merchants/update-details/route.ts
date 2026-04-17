import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  try {
    const updateToken = await db.getMerchantUpdateToken(token);

    if (!updateToken || !updateToken.verified || updateToken.usedAt || new Date(updateToken.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Unauthorized or invalid token' }, { status: 401 });
    }

    const merchant = updateToken.merchant;

    return NextResponse.json({
      success: true,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        accountNumber: merchant.accountNumber,
        businessDescription: merchant.businessDescription,
        websiteUrl: merchant.websiteUrl,
        callbackUrl: merchant.callbackUrl,
        contactName: merchant.contactName,
        contactUsername: merchant.contactUsername,
        category: merchant.category,
        businessType: merchant.businessType,
        status: merchant.status,
        updateComments: merchant.updateComments,
        documents: (merchant as any).documents || []
      }
    });

  } catch (error) {
    console.error('Error fetching update details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
