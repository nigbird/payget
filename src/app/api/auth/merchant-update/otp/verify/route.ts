import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { writeAuditLog } from '@/lib/audit-log';
import { requireCsrf } from '@/lib/request-security';

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const body = await request.json();
    const { token, otp } = body;

    if (!token || !otp) {
      await writeAuditLog({
        request,
        action: "MERCHANT_UPDATE_OTP_VERIFY",
        entityType: "MERCHANT_UPDATE_TOKEN",
        entityId: null,
        newValue: { result: "failed", reason: "MISSING_TOKEN_OR_OTP" },
      })

      return NextResponse.json({ error: 'Token and OTP are required' }, { status: 400 });
    }

    const updateToken = await db.getMerchantUpdateToken(token);

    if (!updateToken || new Date(updateToken.expiresAt) < new Date() || updateToken.usedAt) {
      await writeAuditLog({
        request,
        action: "MERCHANT_UPDATE_OTP_VERIFY",
        entityType: "MERCHANT_UPDATE_TOKEN",
        entityId: (updateToken as any)?.id ?? null,
        newValue: { result: "failed", reason: "INVALID_OR_EXPIRED_TOKEN" },
      })

      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    if (!updateToken.otp || updateToken.otp !== otp) {
      await writeAuditLog({
        request,
        action: "MERCHANT_UPDATE_OTP_VERIFY",
        entityType: "MERCHANT_UPDATE_TOKEN",
        entityId: updateToken.id,
        newValue: { result: "failed", reason: "INVALID_OTP" },
      })

      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }

    if (updateToken.otpExpires && new Date(updateToken.otpExpires) < new Date()) {
      await writeAuditLog({
        request,
        action: "MERCHANT_UPDATE_OTP_VERIFY",
        entityType: "MERCHANT_UPDATE_TOKEN",
        entityId: updateToken.id,
        newValue: { result: "failed", reason: "OTP_EXPIRED" },
      })

      return NextResponse.json({ error: 'OTP expired' }, { status: 400 });
    }

    // Mark as verified
    await db.updateMerchantUpdateToken(updateToken.id, {
      verified: true
    });

    await writeAuditLog({
      request,
      action: "MERCHANT_UPDATE_OTP_VERIFY",
      entityType: "MERCHANT_UPDATE_TOKEN",
      entityId: updateToken.id,
      newValue: { result: "success", merchantId: (updateToken as any).merchantId ?? updateToken.merchant?.id ?? null },
    })

    return NextResponse.json({ 
      success: true, 
      message: 'OTP verified successfully'
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);

    await writeAuditLog({
      request,
      action: "MERCHANT_UPDATE_OTP_VERIFY",
      entityType: "MERCHANT_UPDATE_TOKEN",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
