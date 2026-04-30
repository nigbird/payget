import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { sendNotification } from '@/lib/notifications';
import { writeAuditLog } from '@/lib/audit-log';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      await writeAuditLog({
        request,
        action: "MERCHANT_UPDATE_OTP_SEND",
        entityType: "MERCHANT_UPDATE_TOKEN",
        entityId: null,
        newValue: { result: "failed", reason: "MISSING_TOKEN" },
      })

      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const updateToken = await db.getMerchantUpdateToken(token);

    if (!updateToken || new Date(updateToken.expiresAt) < new Date() || updateToken.usedAt) {
      await writeAuditLog({
        request,
        action: "MERCHANT_UPDATE_OTP_SEND",
        entityType: "MERCHANT_UPDATE_TOKEN",
        entityId: (updateToken as any)?.id ?? null,
        newValue: { result: "failed", reason: "INVALID_OR_EXPIRED_TOKEN" },
      })

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

    await writeAuditLog({
      request,
      action: "MERCHANT_UPDATE_OTP_SEND",
      entityType: "MERCHANT_UPDATE_TOKEN",
      entityId: updateToken.id,
      newValue: { result: "success", merchantId: (updateToken as any).merchant?.id ?? null },
    })

    return NextResponse.json({ 
      success: true, 
      message: 'OTP sent successfully',
      delivered 
    });

  } catch (error) {
    console.error('Error sending OTP:', error);

    await writeAuditLog({
      request,
      action: "MERCHANT_UPDATE_OTP_SEND",
      entityType: "MERCHANT_UPDATE_TOKEN",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
