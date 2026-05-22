import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit-log';
import { requireCsrf } from '@/lib/request-security';
import { validateUrl } from '@/lib/url-validation';
import { validateAccountNumberField } from '@/lib/account-number';

export async function PATCH(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const body = await request.json();
    const { token, ...updateData } = body;

    // Server-side URL validation
    const errors: Record<string, string> = {};

    // Website URL validation
    const websiteUrlValidation = validateUrl(updateData.websiteUrl, 'website');
    if (!websiteUrlValidation.valid) {
      errors.websiteUrl = websiteUrlValidation.error;
    }

    // Callback URL validation
    const callbackUrlValidation = validateUrl(updateData.callbackUrl, 'callback');
    if (!callbackUrlValidation.valid) {
      errors.callbackUrl = callbackUrlValidation.error;
    }

    if (updateData.accountNumber !== undefined) {
      const normalizedAccountNumber = validateAccountNumberField(
        updateData.accountNumber,
        errors,
        { required: true }
      );
      if (normalizedAccountNumber) {
        updateData.accountNumber = normalizedAccountNumber;
      }
    }

    if (Object.keys(errors).length > 0) {
      await writeAuditLog({
        request,
        userId: null,
        action: "MERCHANT_RESUBMIT",
        entityType: "MERCHANT",
        entityId: null,
        newValue: { result: "failed", reason: "VALIDATION_FAILED", errors },
      });
      return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    const actorUserId: string | null = null;

    if (!token) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_RESUBMIT",
        entityType: "MERCHANT",
        entityId: null,
        newValue: { result: "failed", reason: "TOKEN_REQUIRED" },
      });

      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const updateToken = await db.getMerchantUpdateToken(token);

    if (!updateToken || !updateToken.verified || updateToken.usedAt || new Date(updateToken.expiresAt) < new Date()) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MERCHANT_RESUBMIT",
        entityType: "MERCHANT",
        entityId: null,
        newValue: { result: "failed", reason: "INVALID_OR_EXPIRED_TOKEN" },
      });

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

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "MERCHANT_RESUBMIT",
      entityType: "MERCHANT",
      entityId: merchantId,
      oldValue: null,
      newValue: { result: "success", status: "resubmitted" },
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Application resubmitted successfully' 
    });

  } catch (error) {
    console.error('Error resubmitting application:', error);

    await writeAuditLog({
      request,
      userId: null,
      action: "MERCHANT_RESUBMIT",
      entityType: "MERCHANT",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    });

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
