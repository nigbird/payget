import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { sendNotification } from '@/lib/notifications';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const updateToken = await db.getMerchantUpdateToken(token);

    if (!updateToken || new Date(updateToken.expiresAt) < new Date() || updateToken.usedAt) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    const merchant = updateToken.merchant;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await db.updateMerchantUpdateToken(updateToken.id, {
      otp,
      otpExpires
    });

    const delivered = await sendNotification({
      to: merchant.contactUsername,
      subject: 'Verification Code: Merchant Application Update',
      message: `Your verification code is: ${otp}. This code will expire in 5 minutes.`
    });

    return NextResponse.json({ 
      success: true, 
      message: 'OTP sent successfully',
      delivered 
    });

  } catch (error) {
    console.error('Error sending OTP:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
