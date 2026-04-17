import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/rbac';
import { generateMerchantUpdateLink, sendNotification } from '@/lib/notifications';
import crypto from 'crypto';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canApprove = await hasPermission('MERCHANT_APPROVE');
    if (!canApprove) {
      return NextResponse.json({ error: 'Permission denied: MERCHANT_APPROVE required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { comments } = body; // comments: { general: string, fields: { [fieldName]: string } }

    const merchant = await db.getMerchantById(id);
    if (!merchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update merchant status and comments
    await db.updateMerchant(id, {
      status: 'rejected_with_update',
      updateComments: comments
    });

    // Create update token
    await db.createMerchantUpdateToken(id, token, expiresAt);

    // Send notification
    const updateLink = generateMerchantUpdateLink(token);
    const delivered = await sendNotification({
      to: merchant.contactUsername,
      subject: 'Update Required: Merchant Application',
      message: `Your merchant application requires updates. Please use the following link to review the comments and resubmit your application: ${updateLink}\n\nNote: For security, you will be required to verify an OTP sent to this contact method after clicking the link.`
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: (session.user as any).id,
        action: 'MERCHANT_REQUEST_UPDATE',
        entityType: 'MERCHANT',
        entityId: id,
        newValue: { status: 'rejected_with_update', comments } as any
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Update request sent successfully',
      delivered
    });

  } catch (error) {
    console.error('Error requesting update:', error);
    return NextResponse.json({ error: 'Failed to request update' }, { status: 500 });
  }
}
