import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { token, ...updateData } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const updateToken = await db.getMerchantUpdateToken(token);

    if (!updateToken || !updateToken.verified || updateToken.usedAt || new Date(updateToken.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Unauthorized or invalid token' }, { status: 401 });
    }

    const merchantId = updateToken.merchantId;

    // Filter allowed fields for update
    // Allowed: name, email, accountNumber, businessDescription, websiteUrl, callbackUrl, contactName, category, businessType, documents
    const allowedFields = [
      'name', 'email', 'accountNumber', 'businessDescription', 
      'websiteUrl', 'callbackUrl', 'contactName', 'contactUsername', 'category', 'businessType',
      'dailyLimit', 'transactionLimit', 'dailyCountLimit'
    ];
    
    const finalUpdate: any = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        if (['dailyLimit', 'transactionLimit', 'dailyCountLimit'].includes(field)) {
          finalUpdate[field] = Number(updateData[field]);
        } else {
          finalUpdate[field] = updateData[field];
        }
      }
    });

    // Handle documents if provided
    if (updateData.documents) {
      // For simplicity, we'll assume the frontend sends the full list of documents
      // In a real app, we might want more complex logic for adding/removing docs
      await prisma.merchantDocument.deleteMany({
        where: { merchantId }
      });
      
      await prisma.merchantDocument.createMany({
        data: updateData.documents.map((doc: any) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          size: doc.size,
          url: doc.url,
          merchantId
        }))
      });
    }

    // Update merchant status to resubmitted
    await db.updateMerchant(merchantId, {
      ...finalUpdate,
      status: 'resubmitted'
    });

    // Mark token as used
    await db.updateMerchantUpdateToken(updateToken.id, {
      usedAt: new Date()
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        action: 'MERCHANT_RESUBMIT',
        entityType: 'MERCHANT',
        entityId: merchantId,
        newValue: { status: 'resubmitted', ...finalUpdate } as any
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Application resubmitted successfully' 
    });

  } catch (error) {
    console.error('Error resubmitting application:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
