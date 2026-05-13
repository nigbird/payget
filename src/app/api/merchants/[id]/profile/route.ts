import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/app/lib/db'
import { prisma } from '@/lib/prisma'
import bcrypt from "bcryptjs"
import { requireAuthUser, canAccessMerchant } from '@/lib/request-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { requireCsrf } from '@/lib/request-security';
import { validatePassword } from '@/lib/password-policy';
import { getPwnedCount } from '@/lib/pwned-password.server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const user = await requireAuthUser(request);
    const actorUserId = user?.id ?? null;
    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: "MERCHANT_PROFILE_UPDATE",
        entityType: "MERCHANT",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      });

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params
    if (!canAccessMerchant(user, id)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_PROFILE_UPDATE",
        entityType: "MERCHANT",
        entityId: id,
        newValue: { result: "failed", reason: "FORBIDDEN" },
      });

      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json()
    
    // Find the merchant
    const merchant = await db.getMerchantById(id)

    if (!merchant) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_PROFILE_UPDATE",
        entityType: "MERCHANT",
        entityId: id,
        newValue: { result: "failed", reason: "MERCHANT_NOT_FOUND" },
      });

      return NextResponse.json(
        { error: 'Merchant not found' },
        { status: 404 }
      )
    }

    // Update only allowed fields
    const updateData: any = {}
    const userUpdateData: any = {}
    
    if (body.email !== undefined) {
      updateData.email = body.email
      userUpdateData.email = body.email
    }
    
    if (body.contactUsername !== undefined) {
      updateData.contactUsername = body.contactUsername // Map to actual database field
    }

    // Handle password change
    if (body.currentPassword && body.newPassword) {
      // Validate password policy
      const policy = validatePassword(body.newPassword);
      if (!policy.valid) {
        return NextResponse.json(
          { error: policy.errors[0] ?? 'Password does not meet policy requirements' },
          { status: 400 }
        );
      }

      // Check if password is pwned
      const pwnedCount = await getPwnedCount(body.newPassword);
      if (pwnedCount > 0) {
        return NextResponse.json(
          { error: `For your security, this password isn’t safe to use. Please choose a different one.` },
          { status: 400 }
        );
      }

      // Verify current password
      const currentHashed = merchant.password
      if (currentHashed) {
        const isValid = await bcrypt.compare(body.currentPassword, currentHashed)
        if (!isValid) {
          return NextResponse.json(
            { error: 'Invalid current password' },
            { status: 401 }
          )
        }
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(body.newPassword, 10)
      updateData.password = hashedNewPassword
      userUpdateData.password = hashedNewPassword
    }

    // Update the merchant and related users in a transaction
    const [updatedMerchant] = await prisma.$transaction([
      prisma.merchant.update({
        where: { id },
        data: updateData
      }),
      ...(Object.keys(userUpdateData).length > 0 ? [
        prisma.user.updateMany({
          where: { merchantId: id },
          data: userUpdateData
        })
      ] : [])
    ])

    // Return updated data without sensitive fields
    const { password, ...safeMerchantData } = updatedMerchant
    
    // Map contactUsername back to phoneNumber for frontend consistency
    const response = {
      ...safeMerchantData,
      phoneNumber: (safeMerchantData as any).contactUsername
    }

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "MERCHANT_PROFILE_UPDATE",
      entityType: "MERCHANT",
      entityId: id,
      oldValue: null,
      newValue: { result: "success" },
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('Profile update error:', error)

    await writeAuditLog({
      request,
      userId: null,
      action: "MERCHANT_PROFILE_UPDATE",
      entityType: "MERCHANT",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })

    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
