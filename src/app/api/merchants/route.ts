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
    // Allow public registration if no session, or check for permission if session exists
    if (session?.user) {
      const canRegister = await hasPermission('MERCHANT_REGISTER');
      if (!canRegister) {
        return NextResponse.json({ error: 'Permission denied: MERCHANT_REGISTER required' }, { status: 403 });
      }
    }

    const data = await request.json();

    // Generate a unique merchant ID if not provided (e.g., m12345)
    const merchantId = data.id || `m${Math.random().toString(36).substring(2, 9)}`;
    
    // Hash the password before saving (if any provided, though we usually won't at this stage)
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    
    // Create merchant record in a transaction
    const merchant = await prisma.$transaction(async (tx) => {
      // Create the merchant record
      const { documents, id, ...rest } = data;
      const m = await tx.merchant.create({
        data: {
          ...rest,
          id: merchantId,
          jweSecret: rest.jweSecret || Math.random().toString(36).substring(2, 15),
          createdBy: session?.user ? (session.user as any).id : null,
          status: 'PENDING', // Always start as pending
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
      
      // We do NOT create a user record at this stage. 
      // User records are only created after approval and password setup.
      
      return m;
    });

    return NextResponse.json(merchant, { status: 201 });
  } catch (error) {
    console.error('Error adding merchant:', error);
    return NextResponse.json({ error: 'Failed to create merchant' }, { status: 500 });
  }
}
