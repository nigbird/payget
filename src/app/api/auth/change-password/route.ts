import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { requireAuthUser } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import { writeAuditLog } from '@/lib/audit-log';
import { validatePassword } from '@/lib/password-policy';
import { getPwnedCount } from '@/lib/pwned-password.server';

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the full user to check role
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Merchant users should use the merchant password reset flow, not this endpoint
    if (dbUser.role === 'MERCHANT') {
      await writeAuditLog({
        request,
        userId: user.id,
        action: 'AUTH_CHANGE_PASSWORD',
        entityType: 'USER',
        entityId: user.id,
        newValue: { result: 'failed', reason: 'MERCHANT_USER_NOT_ALLOWED' }
      });
      return NextResponse.json({ error: 'Merchant users must use the merchant password reset flow' }, { status: 403 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
    }

    const policy = validatePassword(newPassword);
    if (!policy.valid) {
      return NextResponse.json({ error: policy.errors[0] ?? 'Password does not meet policy requirements' }, { status: 400 });
    }

    const pwnedCount = await getPwnedCount(newPassword);
    if (pwnedCount > 0) {
      return NextResponse.json({ error: `For your security, this password isn’t safe to use. Please choose a different one.` }, { status: 400 });
    }

    if (!dbUser.password) {
      return NextResponse.json({ error: 'User has no password set' }, { status: 400 });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, dbUser.password);
    if (!isValidPassword) {
      await writeAuditLog({
        request,
        userId: user.id,
        action: 'AUTH_CHANGE_PASSWORD',
        entityType: 'USER',
        entityId: user.id,
        newValue: { result: 'failed', reason: 'INVALID_CURRENT_PASSWORD' }
      });
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedNewPassword,
        firstLogin: false
      }
    });

    await writeAuditLog({
      request,
      userId: user.id,
      action: 'AUTH_CHANGE_PASSWORD',
      entityType: 'USER',
      entityId: user.id,
      newValue: { result: 'success' }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
