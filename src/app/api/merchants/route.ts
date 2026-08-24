import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userHasPermission } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import bcrypt from 'bcryptjs';
import { normalizePhoneNumber, isValidEmail, isValidPhoneNumber } from '@/lib/utils';
import { validateUrl } from '@/lib/url-validation';
import { generateJweSecret } from '@/lib/jwe';
import { encryptMerchantSecretAtRest } from '@/lib/merchant-secret';
import { writeAuditLog } from '@/lib/audit-log';
import { validateAccountNumberField } from '@/lib/account-number';

export async function GET(request: Request) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let merchants = await db.getMerchants();

  if (user.role === 'MERCHANT' && user.merchantId) {
    merchants = merchants.filter(m => m.id === user.merchantId);
  } else if (user.role === 'SALES') {
    merchants = merchants.filter(m => user.assignedMerchantIds?.includes(m.id));
  }

  return NextResponse.json(merchants);
}

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const sessionUser = await requireAuthUser(request);
    // Allow public registration if no auth, or check for permission if auth exists
    if (sessionUser) {
      const canRegister = userHasPermission(sessionUser, 'MERCHANT_REGISTER');
      if (!canRegister) {
        await writeAuditLog({
          request,
          userId: sessionUser.id,
          action: "MERCHANT_REGISTER",
          entityType: "MERCHANT",
          entityId: null,
          newValue: {
            result: "failed",
            reason: "PERMISSION_DENIED",
          },
        });
        return NextResponse.json({ error: 'Permission denied: MERCHANT_REGISTER required' }, { status: 403 });
      }
    }

    const data = await request.json();

    // Server-side validation
    const errors: Record<string, string> = {};
    
    if (!data.name?.trim()) errors.name = 'Business name is required';
    if (!data.email?.trim()) {
      errors.email = 'Business email is required';
    } else if (!isValidEmail(data.email)) {
      errors.email = 'Invalid email format';
    }
    
    if (!data.contactName?.trim()) errors.contactName = 'Contact name is required';
    if (!data.contactUsername?.trim()) {
      errors.contactUsername = 'Contact username (email or phone) is required';
    } else {
      const isEmail = isValidEmail(data.contactUsername);
      const isPhone = isValidPhoneNumber(data.contactUsername);
      
      if (!isEmail && !isPhone) {
        errors.contactUsername = 'Please enter a valid email or phone number';
      } else if (isPhone) {
        // Normalize phone number if it's a phone
        data.contactUsername = normalizePhoneNumber(data.contactUsername);
      }
    }

    if (!data.category) errors.category = 'Industry category is required';
    if (!data.businessType) errors.businessType = 'Business type is required';
    const normalizedAccountNumber = validateAccountNumberField(data.accountNumber, errors);
    if (normalizedAccountNumber) {
      data.accountNumber = normalizedAccountNumber;
    }

    // Website URL validation
    const websiteUrlValidation = validateUrl(data.websiteUrl, 'website');
    if (!websiteUrlValidation.valid) {
      errors.websiteUrl = websiteUrlValidation.error;
    }

    // Callback URL validation
    const callbackUrlValidation = validateUrl(data.callbackUrl, 'callback');
    if (!callbackUrlValidation.valid) {
      errors.callbackUrl = callbackUrlValidation.error;
    }

    // Business description word count validation (max 50 words)
    if (data.businessDescription) {
      const wordCount = data.businessDescription.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount > 50) {
        errors.businessDescription = 'Business description cannot exceed 50 words';
      }
    }

    if (Object.keys(errors).length > 0) {
      await writeAuditLog({
        request,
        userId: sessionUser?.id ?? null,
        action: "MERCHANT_REGISTER",
        entityType: "MERCHANT",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "VALIDATION_FAILED",
          errors,
          merchantName: data.name,
        },
      });
      return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 });
    }

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
      const rawSecret = rest.jweSecret || generateJweSecret();
      const encryptedSecret = encryptMerchantSecretAtRest(rawSecret);

      const m = await tx.merchant.create({
        data: {
          ...rest,
          id: merchantId,
          jweSecret: encryptedSecret.ciphertext,
          createdBy: sessionUser?.id ?? null,
          status: 'PENDING', // Always start as pending
          documents: documents ? {
            create: documents.map((doc: any) => ({
              id: doc.id,
              name: doc.name,
              type: doc.type,
              size: doc.size,
              url: doc.url,
              uploadedAt: new Date(doc.uploadedAt)
            }))
          } : undefined
        } as any
      });
      
      // We do NOT create a user record at this stage. 
      // User records are only created after approval and password setup.
      
      return m;
    });

    await writeAuditLog({
      request,
      userId: sessionUser?.id ?? null,
      action: "MERCHANT_REGISTER",
      entityType: "MERCHANT",
      entityId: merchant.id,
      newValue: {
        result: "success",
        merchantId: merchant.id,
        merchantName: merchant.name,
        merchantEmail: merchant.email,
        category: merchant.category,
        businessType: merchant.businessType,
        status: merchant.status,
      },
    });

    const safeMerchant = await db.getMerchantById(merchant.id);

    return NextResponse.json(safeMerchant, { status: 201 });
  } catch (error) {
    console.error('Error adding merchant:', error);
    await writeAuditLog({
      request,
      userId: null,
      action: "MERCHANT_REGISTER",
      entityType: "MERCHANT",
      entityId: null,
      newValue: {
        result: "failed",
        reason: "INTERNAL_ERROR",
      },
    });
    return NextResponse.json({ error: 'Failed to create merchant' }, { status: 500 });
  }
}
