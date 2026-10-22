import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { requireCsrf } from '@/lib/request-security';
import { validatePassword } from '@/lib/password-policy';
import { getPwnedCount } from '@/lib/pwned-password.server';
import crypto from 'crypto';
import { writeAuditLog } from '@/lib/audit-log';

/** Account activation is security-relevant: record every attempt's outcome. */
function auditSetup(request: Request, merchantId: string, failureReason: string | null) {
  return writeAuditLog({
    request,
    userId: null,
    action: 'MERCHANT_ACCOUNT_ACTIVATION',
    entityType: 'MERCHANT',
    entityId: merchantId,
    newValue: failureReason ? { result: 'failed', reason: failureReason } : { result: 'success' },
  });
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const { id } = await params;
    const { password, token } = await request.json();

    if (!password || !token) {
      return NextResponse.json({ error: 'Password and token are required' }, { status: 400 });
    }

    const policy = validatePassword(password);
    if (!policy.valid) {
      return NextResponse.json({ error: policy.errors[0] ?? 'Password does not meet policy requirements' }, { status: 400 });
    }

    const pwnedCount = await getPwnedCount(password);
    if (pwnedCount > 0) {
      return NextResponse.json({ error: `For your security, this password isn’t safe to use. Please choose a different one.` }, { status: 400 });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id },
      include: {
        users: true
      }
    });

    if (
      !merchant ||
      typeof token !== 'string' ||
      !merchant.passwordResetToken ||
      !safeEqual(merchant.passwordResetToken, token)
    ) {
      await auditSetup(request, id, 'INVALID_TOKEN');
      return NextResponse.json({ error: 'Invalid or expired setup link' }, { status: 400 });
    }

    // Activation is only the last step after a checker approved the application.
    // The approval route is the only thing that issues this link (with an expiry);
    // a token on a merchant in any other state did not come from it.
    if (merchant.status !== 'APPROVED') {
      await auditSetup(request, id, 'NOT_APPROVED');
      return NextResponse.json({ error: 'Invalid or expired setup link' }, { status: 400 });
    }

    if (!merchant.passwordResetExpires || new Date() > merchant.passwordResetExpires) {
      await auditSetup(request, id, 'EXPIRED');
      return NextResponse.json({ error: 'Setup link has expired' }, { status: 400 });
    }

    // The login is keyed on contactUsername. If that identifier already belongs to
    // a different account (staff, or another merchant's login), refuse instead of
    // overwriting that account's password and re-homing it to this merchant.
    const existingLogin = await prisma.user.findUnique({
      where: { email: merchant.contactUsername },
      select: { role: true, merchantId: true },
    });
    if (existingLogin && !(existingLogin.role === 'MERCHANT' && existingLogin.merchantId === merchant.id)) {
      console.error('[setup-password] contactUsername of merchant %s already belongs to another account', merchant.id);
      await auditSetup(request, id, 'CONTACT_CONFLICT');
      return NextResponse.json(
        { error: 'This contact is already linked to another account. Please contact the bank.' },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Update merchant and create user record in a transaction
    await prisma.$transaction(async (tx) => {
      // Update merchant status and clear token
      await tx.merchant.update({
        where: { id },
        data: {
          password: hashedPassword,
          status: 'ACTIVE',
          passwordResetToken: null,
          passwordResetExpires: null
        }
      });

      // Create or update the primary user for this merchant
      // Using the contactUsername (which can be email or phone)
      // If it's a phone, we might store it in email field if that's what we use for login,
      // or we might need a separate username field in User. 
      // For now, let's assume User.email can store either for login purposes.
      
      const userEmail = merchant.contactUsername; // This is the flexible username
      
      await tx.user.upsert({
        where: { email: userEmail },
        update: {
          password: hashedPassword,
          name: merchant.contactName,
          role: 'MERCHANT',
          merchantId: merchant.id
        },
        create: {
          email: userEmail,
          password: hashedPassword,
          name: merchant.contactName,
          role: 'MERCHANT',
          merchantId: merchant.id
        }
      });
    });

    await auditSetup(request, id, null);

    return NextResponse.json({ success: true, message: 'Password set successfully. You can now log in.' });
  } catch (error) {
    console.error('Error setting password:', error);
    return NextResponse.json({ error: 'Failed to set password' }, { status: 500 });
  }
}
