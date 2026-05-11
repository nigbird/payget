import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit-log';
import { requireCsrf } from '@/lib/request-security';
import { generateResetPasswordLink, sendNotification } from '@/lib/notifications';
import { isValidEmail, isValidPhoneNumber } from '@/lib/utils';
import bcrypt from 'bcryptjs';
import { resetUserLockout, resetLoginIdentifierLockout } from '@/lib/rate-limit';
import { normalizeLoginIdentifierForLockout } from '@/lib/login-identifier-normalize';
import { validatePassword } from '@/lib/password-policy';
import { getPwnedCount } from '@/lib/pwned-password.server';

export async function POST(request: Request) {
  let actorUserId: string | null = null; // reset-password flows are unauthenticated
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const { identifier, action, token, password } = await request.json();

    if (action === 'request') {
      // First check if it's a merchant
      let entityType: 'MERCHANT' | 'USER' = 'MERCHANT';
      let entityId: string | null = null;
      let contactEmail: string | null = null;
      
      let merchant = await db.findMerchantByIdentifier(identifier);
      
      // If not a merchant, check if it's an admin user
      let user = null;
      if (!merchant) {
        user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { name: identifier }
            ]
          }
        });
        if (user) {
          entityType = 'USER';
          entityId = user.id;
          contactEmail = user.email;
        }
      } else {
        entityId = merchant.id;
        contactEmail = merchant.email;
      }

      if (!merchant && !user) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: 'AUTH_RESET_PASSWORD_REQUEST',
          entityType: 'GENERIC',
          entityId: null,
          newValue: { result: 'failed', reason: 'NOT_FOUND', identifier },
        });

        return NextResponse.json({ error: 'No account found with that email or phone' }, { status: 404 });
      }

      const config = await db.getSystemConfig();
      const resetToken = Math.random().toString(36).substr(2, 12);
      const expiry = new Date(Date.now() + (config?.resetTimeoutSeconds || 60) * 1000).toISOString();

      // Update the correct entity
      if (entityType === 'MERCHANT' && merchant) {
        await db.updateMerchant(merchant.id, {
          passwordResetToken: resetToken,
          passwordResetExpires: expiry,
        });
      } else if (entityType === 'USER' && user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            passwordResetToken: resetToken,
            passwordResetExpires: new Date(expiry),
          }
        });
      }

      // Do not log resetToken/password values
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'AUTH_RESET_PASSWORD_REQUEST',
        entityType,
        entityId,
        oldValue: null,
        newValue: { result: 'success', expiry, identifier },
      });

      const resetLink = await generateResetPasswordLink(resetToken);
      
      // Determine which contact to use for notification
      let recipient: string = identifier;
      
      // First check if the identifier they entered is a valid email or phone
      const isIdentifierEmail = isValidEmail(identifier);
      const isIdentifierPhone = isValidPhoneNumber(identifier);
      
      // If the identifier is a valid email or phone, use that!
      // If it's just a username/id, fall back to the merchant/user email
      if (!isIdentifierEmail && !isIdentifierPhone && contactEmail) {
        recipient = contactEmail;
      }

      console.log('[RESET-PASSWORD] Attempting to send notification to:', recipient);

      // Send the notification via email or SMS
      const notificationSent = await sendNotification({
        to: recipient,
        subject: 'Password Reset Request',
        message: `Hello,\n\nWe received a request to reset your password. Please use the link below to reset it:\n\n${resetLink}\n\nThis link will expire in ${config?.resetTimeoutSeconds || 60} seconds.\n\nIf you didn't request this, please ignore this message.\n\nBest regards,\nNibTera Merchants Team`
      });

      console.log('[RESET-PASSWORD] Notification sent status:', notificationSent);
      
      return NextResponse.json({ success: true, notificationSent, entityType });
    }

    if (action === 'check') {
      // First check merchant token
      let merchant = await db.findMerchantByResetToken(token);
      let entityType: 'MERCHANT' | 'USER' = merchant ? 'MERCHANT' : 'USER';
      
      let user = null;
      if (!merchant) {
        user = await prisma.user.findFirst({
          where: { passwordResetToken: token }
        });
        if (!user) {
          await writeAuditLog({
            request,
            userId: actorUserId,
            action: 'AUTH_RESET_PASSWORD_CHECK',
            entityType: 'GENERIC',
            entityId: null,
            newValue: { result: 'failed', reason: 'INVALID_RESET_TOKEN' },
          });

          return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
        }
      }

      // Check expiry
      let expiryDate: Date | null = null;
      if (merchant && merchant.passwordResetExpires) {
        expiryDate = new Date(merchant.passwordResetExpires);
      } else if (user && user.passwordResetExpires) {
        expiryDate = user.passwordResetExpires;
      }

      if (expiryDate && expiryDate < new Date()) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: 'AUTH_RESET_PASSWORD_CHECK',
          entityType,
          entityId: merchant?.id || user?.id,
          newValue: { result: 'failed', reason: 'TOKEN_EXPIRED' },
        });

        return NextResponse.json({ error: 'Token expired' }, { status: 400 });
      }

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'AUTH_RESET_PASSWORD_CHECK',
        entityType,
        entityId: merchant?.id || user?.id,
        newValue: { result: 'success' },
      });

      return NextResponse.json({ 
        entityId: merchant?.id || user?.id, 
        entityType 
      });
    }

    if (action === 'reset') {
      // First check merchant token
      let merchant = await db.findMerchantByResetToken(token);
      let entityType: 'MERCHANT' | 'USER' = merchant ? 'MERCHANT' : 'USER';
      
      let user = null;
      if (!merchant) {
        user = await prisma.user.findFirst({
          where: { passwordResetToken: token }
        });
        if (!user) {
          await writeAuditLog({
            request,
            userId: actorUserId,
            action: 'AUTH_RESET_PASSWORD_RESET',
            entityType: 'GENERIC',
            entityId: null,
            newValue: { result: 'failed', reason: 'INVALID_OR_EXPIRED_TOKEN' },
          });

          return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
        }
      }

      // Check expiry
      let expiryDate: Date | null = null;
      if (merchant && merchant.passwordResetExpires) {
        expiryDate = new Date(merchant.passwordResetExpires);
      } else if (user && user.passwordResetExpires) {
        expiryDate = user.passwordResetExpires;
      }

      if (expiryDate && expiryDate < new Date()) {
        await writeAuditLog({
          request,
          userId: actorUserId,
          action: 'AUTH_RESET_PASSWORD_RESET',
          entityType,
          entityId: merchant?.id || user?.id,
          newValue: { result: 'failed', reason: 'TOKEN_EXPIRED' },
        });

        return NextResponse.json({ error: 'Token expired' }, { status: 400 });
      }

      if (!password) {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 });
      }

      const policy = validatePassword(password);
      if (!policy.valid) {
        return NextResponse.json({ error: policy.errors[0] ?? 'Password does not meet policy requirements' }, { status: 400 });
      }

      const pwnedCount = await getPwnedCount(password);
      if (pwnedCount > 0) {
        return NextResponse.json({ error: `For your security, this password isn’t safe to use. Please choose a different one.` }, { status: 400 });
      }

      // Hash password for both merchant and user
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update the correct entity
      if (entityType === 'MERCHANT' && merchant) {
        // First update the merchant record
        await db.updateMerchant(merchant.id, {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
        });

        // Then find and update the associated merchant user record (this is what's used for login!)
        const merchantUser = await prisma.user.findFirst({
          where: { merchantId: merchant.id, role: 'MERCHANT' }
        });

        if (merchantUser) {
          await resetUserLockout(merchantUser.id);
          await resetLoginIdentifierLockout(normalizeLoginIdentifierForLockout(merchant.contactUsername));
          await resetLoginIdentifierLockout(normalizeLoginIdentifierForLockout(merchant.email));
          await prisma.user.update({
            where: { id: merchantUser.id },
            data: {
              password: hashedPassword,
              passwordResetToken: null,
              passwordResetExpires: null,
            }
          });
        }
      } else if (entityType === 'USER' && user) {
        await resetUserLockout(user.id);
        if (user.email) {
          await resetLoginIdentifierLockout(normalizeLoginIdentifierForLockout(user.email));
        }
        await prisma.user.update({
          where: { id: user.id },
          data: {
            password: hashedPassword,
            passwordResetToken: null,
            passwordResetExpires: null,
            firstLogin: false
          }
        });
      }

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'AUTH_RESET_PASSWORD_RESET',
        entityType,
        entityId: merchant?.id || user?.id,
        oldValue: null,
        newValue: { result: 'success' },
      });

      return NextResponse.json({ success: true, entityType });
    }

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: 'AUTH_RESET_PASSWORD',
      entityType: 'GENERIC',
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
      entityType: 'GENERIC',
      entityId: null,
      newValue: { result: 'failed', reason: 'INTERNAL_ERROR' },
    });

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
