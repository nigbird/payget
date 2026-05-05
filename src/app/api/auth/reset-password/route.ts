import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { writeAuditLog } from '@/lib/audit-log';
import { requireCsrf } from '@/lib/request-security';

export async function POST(request: Request) {
  let actorUserId: string | null = null; // reset-password flows are unauthenticated
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const { identifier, action, token, password } = await request.json();

    if (action === 'request') {
      const merchant = await db.findMerchantByIdentifier(identifier);

      if (!merchant) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: 'AUTH_RESET_PASSWORD_REQUEST',
          entityType: 'MERCHANT',
          entityId: null,
          newValue: { result: 'failed', reason: 'MERCHANT_NOT_FOUND', identifier },
        });

        return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
      }

      const config = await db.getSystemConfig();
      const resetToken = Math.random().toString(36).substr(2, 12);
      const expiry = new Date(Date.now() + (config?.resetTimeoutSeconds || 60) * 1000).toISOString();

      await db.updateMerchant(merchant.id, {
        passwordResetToken: resetToken,
        passwordResetExpires: expiry,
      });

      // Do not log resetToken/password values
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'AUTH_RESET_PASSWORD_REQUEST',
        entityType: 'MERCHANT',
        entityId: merchant.id,
        oldValue: null,
        newValue: { result: 'success', expiry, identifier },
      });

      return NextResponse.json({ token: resetToken });
    }

    if (action === 'check') {
      const merchant = await db.findMerchantByResetToken(token);

      if (!merchant) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: 'AUTH_RESET_PASSWORD_CHECK',
          entityType: 'MERCHANT',
          entityId: null,
          newValue: { result: 'failed', reason: 'INVALID_RESET_TOKEN' },
        });

        return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
      }

      if (merchant.passwordResetExpires && new Date(merchant.passwordResetExpires) < new Date()) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: 'AUTH_RESET_PASSWORD_CHECK',
          entityType: 'MERCHANT',
          entityId: merchant.id,
          newValue: { result: 'failed', reason: 'TOKEN_EXPIRED' },
        });

        return NextResponse.json({ error: 'Token expired' }, { status: 400 });
      }

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'AUTH_RESET_PASSWORD_CHECK',
        entityType: 'MERCHANT',
        entityId: merchant.id,
        newValue: { result: 'success' },
      });

      return NextResponse.json({ merchantId: merchant.id });
    }

    if (action === 'reset') {
      const merchant = await db.findMerchantByResetToken(token);

      if (!merchant) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: 'AUTH_RESET_PASSWORD_RESET',
          entityType: 'MERCHANT',
          entityId: null,
          newValue: { result: 'failed', reason: 'INVALID_OR_EXPIRED_TOKEN' },
        });

        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
      }

      if (merchant.passwordResetExpires && new Date(merchant.passwordResetExpires) < new Date()) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: 'AUTH_RESET_PASSWORD_RESET',
          entityType: 'MERCHANT',
          entityId: merchant.id,
          newValue: { result: 'failed', reason: 'TOKEN_EXPIRED' },
        });

        return NextResponse.json({ error: 'Token expired' }, { status: 400 });
      }

      // Do not log password
      await db.updateMerchant(merchant.id, {
        password: password,
        passwordResetToken: null,
        passwordResetExpires: null,
      });

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'AUTH_RESET_PASSWORD_RESET',
        entityType: 'MERCHANT',
        entityId: merchant.id,
        oldValue: null,
        newValue: { result: 'success' },
      });

      return NextResponse.json({ success: true });
    }

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: 'AUTH_RESET_PASSWORD',
      entityType: 'MERCHANT',
      entityId: null,
      newValue: { result: 'failed', reason: 'INVALID_ACTION', action },
    });

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in reset password:', error);

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: 'AUTH_RESET_PASSWORD',
      entityType: 'MERCHANT',
      entityId: null,
      newValue: { result: 'failed', reason: 'INTERNAL_ERROR' },
    });

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
