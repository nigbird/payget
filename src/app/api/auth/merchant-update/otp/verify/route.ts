import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit-log';
import { requireCsrf } from '@/lib/request-security';
import {
  checkLoginIdentifierLockout,
  recordLoginIdentifierFailure,
  resetLoginIdentifierLockout,
} from '@/lib/rate-limit';
import crypto from 'crypto';

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

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

    // Attempt limit per update link: 5 wrong codes lock it briefly and burn the
    // code, so a new one has to be sent (and guessing can't run unbounded).
    const lockoutKey = `merchant-update:${updateToken.id}`;
    const lockout = await checkLoginIdentifierLockout(lockoutKey);
    if (lockout.locked) {
      return NextResponse.json(
        { error: 'Too many incorrect codes. Request a new code and try again shortly.' },
        { status: 429 }
      );
    }

    if (!updateToken.otp || typeof otp !== 'string' || !safeEqual(updateToken.otp, otp)) {
      await writeAuditLog({
        request,
        action: "MERCHANT_UPDATE_OTP_VERIFY",
        entityType: "MERCHANT_UPDATE_TOKEN",
        entityId: updateToken.id,
        newValue: { result: "failed", reason: "INVALID_OTP" },
      })

      await recordLoginIdentifierFailure(lockoutKey);
      const after = await checkLoginIdentifierLockout(lockoutKey);
      if (after.locked) {
        await db.updateMerchantUpdateToken(updateToken.id, { otp: null, otpExpires: null });
      }

      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    }

    await resetLoginIdentifierLockout(lockoutKey);

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
