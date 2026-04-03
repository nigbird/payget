import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function POST(request: Request) {
  try {
    const { identifier, action, token, password } = await request.json();
    
    if (action === 'request') {
      const merchant = await db.findMerchantByIdentifier(identifier);
      if (!merchant) {
        return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
      }
      
      const config = await db.getSystemConfig();
      const resetToken = Math.random().toString(36).substr(2, 12);
      const expiry = new Date(Date.now() + (config?.resetTimeoutSeconds || 60) * 1000).toISOString();
      
      await db.updateMerchant(merchant.id, {
        passwordResetToken: resetToken,
        passwordResetExpires: expiry
      });
      
      return NextResponse.json({ token: resetToken });
    }
    
    if (action === 'check') {
      const merchant = await db.findMerchantByResetToken(token);
      if (!merchant) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
      }
      
      // Check expiry
      if (merchant.passwordResetExpires && new Date(merchant.passwordResetExpires) < new Date()) {
        return NextResponse.json({ error: 'Token expired' }, { status: 400 });
      }
      
      return NextResponse.json({ merchantId: merchant.id });
    }
    
    if (action === 'reset') {
      const merchant = await db.findMerchantByResetToken(token);
      if (!merchant) {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
      }
      
      // Check expiry
      if (merchant.passwordResetExpires && new Date(merchant.passwordResetExpires) < new Date()) {
        return NextResponse.json({ error: 'Token expired' }, { status: 400 });
      }
      
      await db.updateMerchant(merchant.id, {
        password: password,
        passwordResetToken: null,
        passwordResetExpires: null
      });
      
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in reset password:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
