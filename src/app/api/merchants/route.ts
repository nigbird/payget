import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userHasPermission } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import crypto from 'crypto';
import { normalizePhoneNumber, isValidEmail, isValidPhoneNumber } from '@/lib/utils';
import { validateUrl } from '@/lib/url-validation';
import { generateJweSecret } from '@/lib/jwe';
import { encryptMerchantSecretAtRest } from '@/lib/merchant-secret';
import { writeAuditLog } from '@/lib/audit-log';
import { validateAccountNumberField } from '@/lib/account-number';

/** Defaults the public registration form has always submitted; branch review sets the real limits. */
const SELF_SERVICE_LIMITS = { dailyLimit: 10000, transactionLimit: 1000, dailyCountLimit: 100 };

const UPLOADED_DOC_ID = /^[a-zA-Z0-9-]+\.(png|jpg|webp|pdf)$/;
const DOC_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']);

function isSafeLogoUrl(value: unknown): value is string {
  return typeof value === 'string' && /^\/api\/uploads\/merchant-logos\/[a-zA-Z0-9._-]+$/.test(value);
}

function parseLimit(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Documents must be files our upload endpoint produced. The URL is rebuilt from
 * the id rather than trusted, so a registrant can't plant an arbitrary link in
 * front of the reviewer. Returns null when the input is malformed.
 */
function parseRegistrationDocuments(input: unknown) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > 10) return null;
  const docs = [];
  for (const doc of input as any[]) {
    if (!doc || typeof doc.id !== 'string' || !UPLOADED_DOC_ID.test(doc.id)) return null;
    if (typeof doc.type !== 'string' || !DOC_MIME_TYPES.has(doc.type)) return null;
    const size = Number(doc.size);
    const uploadedAt = new Date(doc.uploadedAt);
    docs.push({
      id: doc.id,
      name: typeof doc.name === 'string' ? doc.name.slice(0, 255) : doc.id,
      type: doc.type,
      size: Number.isFinite(size) && size >= 0 ? size : 0,
      url: `/api/uploads/compliance-docs/${doc.id}`,
      uploadedAt: Number.isNaN(uploadedAt.getTime()) ? new Date() : uploadedAt,
    });
  }
  return docs;
}

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

    // Server-generated — a caller-chosen id could collide with lookups that
    // match merchants by id (e.g. findMerchantByIdentifier at login/reset).
    const merchantId = `m${crypto.randomBytes(6).toString('hex')}`;

    const documents = parseRegistrationDocuments(data.documents);
    if (documents === null) {
      return NextResponse.json({ error: 'Validation failed', errors: { documents: 'Invalid documents' } }, { status: 400 });
    }

    // Build the row from an explicit allowlist. This route is open to the public,
    // so anything else in the body (passwordResetToken, status, qrEnabled,
    // approvedBy, gateway URLs, secrets, ...) must never reach the database —
    // a self-chosen passwordResetToken let a registrant activate their own
    // merchant through setup-password without approval.
    const merchantData = {
      name: String(data.name).trim(),
      email: String(data.email).trim(),
      accountNumber: data.accountNumber,
      contactName: String(data.contactName).trim(),
      contactUsername: String(data.contactUsername).trim(),
      category: String(data.category),
      businessType: String(data.businessType),
      businessDescription: typeof data.businessDescription === 'string' ? data.businessDescription.trim() : null,
      websiteUrl: typeof data.websiteUrl === 'string' && data.websiteUrl.trim() ? data.websiteUrl.trim() : null,
      callbackUrl: typeof data.callbackUrl === 'string' && data.callbackUrl.trim() ? data.callbackUrl.trim() : null,
      logoUrl: isSafeLogoUrl(data.logoUrl) ? data.logoUrl : null,
      riskFactors: Array.isArray(data.riskFactors)
        ? data.riskFactors.filter((r: unknown): r is string => typeof r === 'string').slice(0, 20).map((r: string) => r.slice(0, 200))
        : [],
      // Branch and limits are bank-side decisions: staff onboarding may set them,
      // a public self-registration always gets the self-service defaults.
      ...(sessionUser
        ? {
            branchName: typeof data.branchName === 'string' && data.branchName.trim() ? data.branchName.trim() : 'Head Office',
            district: typeof data.district === 'string' && data.district.trim() ? data.district.trim() : 'Head Office',
            dailyLimit: parseLimit(data.dailyLimit, SELF_SERVICE_LIMITS.dailyLimit),
            transactionLimit: parseLimit(data.transactionLimit, SELF_SERVICE_LIMITS.transactionLimit),
            dailyCountLimit: parseLimit(data.dailyCountLimit, SELF_SERVICE_LIMITS.dailyCountLimit),
          }
        : {
            branchName: 'Self-Service',
            district: 'Self-Service',
            ...SELF_SERVICE_LIMITS,
          }),
    };

    // Create merchant record in a transaction
    const merchant = await prisma.$transaction(async (tx) => {
      const encryptedSecret = encryptMerchantSecretAtRest(generateJweSecret());

      const m = await tx.merchant.create({
        data: {
          ...merchantData,
          id: merchantId,
          jweSecret: encryptedSecret.ciphertext,
          createdBy: sessionUser?.id ?? null,
          status: 'PENDING', // Always start as pending
          documents: documents.length > 0 ? { create: documents } : undefined
        }
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
