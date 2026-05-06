import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { requireAuthUser, userHasPermission } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import { generatePasswordSetupLink, sendNotification } from '@/lib/notifications';
import crypto from 'crypto';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canApprove = userHasPermission(user, 'MERCHANT_APPROVE');
    if (!canApprove) {
      return NextResponse.json({ error: 'Permission denied: MERCHANT_APPROVE required' }, { status: 403 });
    }

    const { id } = await params;
    const merchant = await db.getMerchantById(id);

    if (!merchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    if (merchant.status !== 'approved') {
      return NextResponse.json({
        error: 'Setup link resend is only available for merchants awaiting password setup.'
      }, { status: 400 });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.updateMerchant(id, {
      passwordResetToken: token,
      passwordResetExpires: expires
    });

    const setupLink = await generatePasswordSetupLink(id, token);
    const delivered = await sendNotification({
      to: merchant.contactUsername,
      subject: 'Merchant Account Setup Link Resent',
      message: `Your account approval is complete. Please activate your merchant portal access by setting a password here: ${setupLink}`
    });

    if (!delivered) {
      return NextResponse.json({ error: 'Failed to send setup link' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Setup link resent successfully.' });
  } catch (error) {
    console.error('Error resending setup link:', error);
    return NextResponse.json({ error: 'Failed to resend setup link' }, { status: 500 });
  }
}
