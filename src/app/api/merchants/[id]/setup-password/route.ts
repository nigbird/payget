import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { requireCsrf } from '@/lib/request-security';

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

    const merchant = await prisma.merchant.findUnique({
      where: { id },
      include: {
        users: true
      }
    });

    if (!merchant || merchant.passwordResetToken !== token) {
      return NextResponse.json({ error: 'Invalid or expired setup link' }, { status: 400 });
    }

    if (merchant.passwordResetExpires && new Date() > merchant.passwordResetExpires) {
      return NextResponse.json({ error: 'Setup link has expired' }, { status: 400 });
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

    return NextResponse.json({ success: true, message: 'Password set successfully. You can now log in.' });
  } catch (error) {
    console.error('Error setting password:', error);
    return NextResponse.json({ error: 'Failed to set password' }, { status: 500 });
  }
}
