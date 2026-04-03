import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/app/lib/db'
import { prisma } from '@/lib/prisma'
import bcrypt from "bcryptjs"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    // Find the merchant
    const merchant = await db.getMerchantById(id)

    if (!merchant) {
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
    
    if (body.phoneNumber !== undefined) {
      updateData.contactPhone = body.phoneNumber // Map to actual database field
    }

    // Handle password change
    if (body.currentPassword && body.newPassword) {
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
    
    // Map contactPhone back to phoneNumber for frontend consistency
    const response = {
      ...safeMerchantData,
      phoneNumber: (safeMerchantData as any).contactPhone
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Profile update error:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
