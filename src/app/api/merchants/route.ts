import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/rbac';
import bcrypt from 'bcryptjs';

export async function GET() {
  const merchants = await db.getMerchants();
  return NextResponse.json(merchants);
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for merchant registration permission
    const canRegister = await hasPermission('MERCHANT_REGISTER');
    if (!canRegister) {
      return NextResponse.json({ error: 'Permission denied: MERCHANT_REGISTER required' }, { status: 403 });
    }

    const data = await request.json();
    
    // Hash the password before saving
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    
    // Create merchant and corresponding user in a transaction
    const merchant = await prisma.$transaction(async (tx) => {
      // Create the merchant record
      const { documents, ...rest } = data;
      const m = await tx.merchant.create({
        data: {
          ...rest,
          createdBy: (session.user as any).id,
          status: rest.status === 'approved' ? 'APPROVED' : (rest.status === 'branch_approved' ? 'BRANCH_APPROVED' : (rest.status === 'rejected' ? 'REJECTED' : 'PENDING')),
          documents: documents ? {
            create: documents.map((doc: any) => ({
              id: doc.id,
              name: doc.name,
              type: doc.type,
              size: doc.size,
              uploadedAt: new Date(doc.uploadedAt)
            }))
          } : undefined
        }
      });
      
      // Create a user record for this merchant so they can log in
      await tx.user.create({
        data: {
          email: m.email,
          password: m.password,
          name: m.name,
          role: 'MERCHANT',
          merchantId: m.id
        }
      });
      
      return m;
    });

    return NextResponse.json(merchant, { status: 201 });
  } catch (error) {
    console.error('Error adding merchant:', error);
    return NextResponse.json({ error: 'Failed to create merchant' }, { status: 500 });
  }
}
