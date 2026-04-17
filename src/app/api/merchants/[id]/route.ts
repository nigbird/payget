import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { requireAuthUser, userHasPermission, userHasAnyPermission } from '@/lib/request-auth';
import { sendNotification, generatePasswordSetupLink } from '@/lib/notifications';
import crypto from 'crypto';

function isSafeLogoUrl(value: unknown) {
  if (typeof value !== "string") return false
  // Only allow logos served by our API (prevents injecting arbitrary remote URLs)
  return /^\/api\/uploads\/merchant-logos\/[a-zA-Z0-9._-]+$/.test(value)
}

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
    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    
    const currentMerchant = await db.getMerchantById(id);
    if (!currentMerchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    // Restrict logo updates:
    // - merchant can update their own logo
    // - staff can update if they have merchant permissions
    if (body.logoUrl !== undefined) {
      if (!isSafeLogoUrl(body.logoUrl)) {
        return NextResponse.json({ error: "Invalid logoUrl" }, { status: 400 })
      }

      const sessionUser = user as any
      const isOwnMerchant =
        sessionUser?.role === "MERCHANT" && sessionUser?.merchantId && sessionUser.merchantId === id

      if (!isOwnMerchant) {
        const canStaffUpdate = userHasAnyPermission(user, ["MERCHANT_REGISTER", "MERCHANT_APPROVE"])
        if (!canStaffUpdate) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
      }
    }

    const incomingStatus = body.status as string | undefined
    const isFinalApprovalStatus =
      incomingStatus === "approved" ||
      incomingStatus === "APPROVED" ||
      incomingStatus === "rejected" ||
      incomingStatus === "REJECTED" ||
      incomingStatus === "active" ||
      incomingStatus === "ACTIVE"

    const isInitialReviewStatus =
      incomingStatus === "branch_approved" || incomingStatus === "BRANCH_APPROVED"

    // Final approval actions require MERCHANT_APPROVE
    if (isFinalApprovalStatus) {
      const canApprove = userHasPermission(user, "MERCHANT_APPROVE")
      if (!canApprove) {
        return NextResponse.json({ error: "Permission denied: MERCHANT_APPROVE required" }, { status: 403 })
      }

      // Maker-Checker principle: creator cannot approve/reject/activate
      if (currentMerchant.createdBy === user.id) {
        return NextResponse.json(
          { error: "Maker-Checker violation: The user who registered this merchant cannot perform final approval actions." },
          { status: 403 }
        )
      }

      // Maker-Checker principle: initial reviewer / limit setter cannot perform final approval actions
      if ((currentMerchant as any).limitsSetBy === user.id) {
        return NextResponse.json(
          { error: "Maker-Checker violation: The user who performed initial limit-setting cannot perform final approval actions." },
          { status: 403 }
        )
      }

      body.approvedBy = user.id

      // If fully approved, generate setup token
      if (incomingStatus === "approved" || incomingStatus === "APPROVED") {
        const token = crypto.randomBytes(32).toString("hex")
        body.passwordResetToken = token
        body.passwordResetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    }

    const isLimitChange =
      body.dailyLimit !== undefined ||
      body.transactionLimit !== undefined ||
      body.dailyCountLimit !== undefined

    // Initial review requires limit permissions (not MERCHANT_APPROVE)
    if (isInitialReviewStatus || isLimitChange) {
      const canSetLimits = userHasPermission(user, "TRANSACTION_LIMIT_SET")
      const canOverrideLimits = userHasPermission(user, "TRANSACTION_LIMIT_OVERRIDE")

      if (!canSetLimits && !canOverrideLimits) {
        return NextResponse.json(
          { error: "Permission denied: You do not have permission to modify transaction limits." },
          { status: 403 }
        )
      }

      // Record maker for maker/checker enforcement on final approval.
      // Keep the first limits setter as the maker for this merchant's onboarding.
      if (!(currentMerchant as any).limitsSetBy) {
        body.limitsSetBy = user.id
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
