import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, otp } = body;

    if (!token || !otp) {
      return NextResponse.json({ error: 'Token and OTP are required' }, { status: 400 });
    }

    const updateToken = await db.getMerchantUpdateToken(token);

    if (!updateToken || new Date(updateToken.expiresAt) < new Date() || updateToken.usedAt) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    if (!updateToken.otp || updateToken.otp !== otp) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }

    if (updateToken.otpExpires && new Date(updateToken.otpExpires) < new Date()) {
      return NextResponse.json({ error: 'OTP expired' }, { status: 400 });
    }

    // Mark as verified
    await db.updateMerchantUpdateToken(updateToken.id, {
      verified: true
    });

    return NextResponse.json({ 
      success: true, 
      message: 'OTP verified successfully'
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
