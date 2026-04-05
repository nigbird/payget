import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/rbac';
import { sendNotification, generatePasswordSetupLink } from '@/lib/notifications';
import crypto from 'crypto';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const merchant = await db.getMerchantById(id);
  if (!merchant) {
    return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
  }
  return NextResponse.json(merchant);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    
    const currentMerchant = await db.getMerchantById(id);
    if (!currentMerchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    // Check for merchant approval permission if status is being changed to approved
    if (body.status === 'approved' || body.status === 'APPROVED' || body.status === 'branch_approved' || body.status === 'BRANCH_APPROVED') {
      const canApprove = await hasPermission('MERCHANT_APPROVE');
      if (!canApprove) {
        return NextResponse.json({ error: 'Permission denied: MERCHANT_APPROVE required' }, { status: 403 });
      }

      // Maker-Checker principle: creator cannot approve
      if (currentMerchant.createdBy === (session.user as any).id) {
        return NextResponse.json({ 
          error: 'Maker-Checker violation: The user who registered this merchant cannot approve it.' 
        }, { status: 403 });
      }

      // Record who approved it
      body.approvedBy = (session.user as any).id;
      
      // If fully approved, generate setup token
      if (body.status === 'approved' || body.status === 'APPROVED') {
        const token = crypto.randomBytes(32).toString('hex');
        body.passwordResetToken = token;
        body.passwordResetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      }
    }

    // Check for transaction limit permissions
    if (body.dailyLimit !== undefined || body.transactionLimit !== undefined || body.dailyCountLimit !== undefined) {
      const canSetLimits = await hasPermission('TRANSACTION_LIMIT_SET');
      const canOverrideLimits = await hasPermission('TRANSACTION_LIMIT_OVERRIDE');
      
      if (!canSetLimits && !canOverrideLimits) {
        return NextResponse.json({ 
          error: 'Permission denied: You do not have permission to modify transaction limits.' 
        }, { status: 403 });
      }
    }

    // Update merchant using the existing updateMerchant method
    const updated = await db.updateMerchant(id, body);

    // Trigger notification if approved
    if ((body.status === 'approved' || body.status === 'APPROVED') && updated) {
      const setupLink = generatePasswordSetupLink(id, body.passwordResetToken);
      await sendNotification({
        to: updated.contactUsername,
        subject: 'Merchant Account Approved',
        message: `Congratulations! Your merchant account for ${updated.name} has been approved. Please set up your password here: ${setupLink}`
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating merchant:', error);
    return NextResponse.json({ error: 'Failed to update merchant' }, { status: 500 });
  }
}
