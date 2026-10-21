import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userHasPermission, userHasAnyPermission, canAccessMerchant, isMerchantAccountAdmin } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import { sendNotification, generatePasswordSetupLink, generateMerchantRegisterLink } from '@/lib/notifications';
import crypto from 'crypto';
import { validateAccountNumberField } from '@/lib/account-number';
import { validateUrl } from '@/lib/url-validation';
import { isValidEmail, isValidPhoneNumber, normalizePhoneNumber } from '@/lib/utils';

const STAFF_ROLES = ['ADMIN', 'MAKER', 'CHECKER', 'HEAD_OFFICE'];

/** What the merchant portal's configuration page edits. */
const MERCHANT_EDITABLE_FIELDS = ['name', 'callbackUrl', 'logoUrl'];

/** The onboarding form fields plus the review actions (status/limits, checked separately below). */
const STAFF_EDITABLE_FIELDS = [
  'name', 'email', 'accountNumber', 'businessDescription', 'logoUrl', 'websiteUrl', 'callbackUrl',
  'contactName', 'contactUsername', 'branchName', 'district', 'category', 'businessType', 'riskFactors',
  'dailyLimit', 'transactionLimit', 'dailyCountLimit', 'status', 'rejectionReason',
];

const STATUS_AND_LIMIT_FIELDS = new Set(['status', 'rejectionReason', 'dailyLimit', 'transactionLimit', 'dailyCountLimit']);

/**
 * Review actions only. pending / rejected_with_update / resubmitted are set by
 * their own flows (registration, request-update, resubmit), never through here.
 */
const PATCHABLE_STATUSES = new Set(['branch_approved', 'approved', 'rejected', 'active']);

function isSafeLogoUrl(value: unknown) {
  if (typeof value !== "string") return false
  // Only allow logos served by our API (prevents injecting arbitrary remote URLs)
  return /^\/api\/uploads\/merchant-logos\/[a-zA-Z0-9._-]+$/.test(value)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  if (!canAccessMerchant(user, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const merchant = await db.getMerchantById(id);
  if (!merchant) {
    return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
  }

  // Calculate maker-checker permissions for the UI
  const userPermissions = (user as any).permissions || [];
  const isCreator = merchant.createdBy === user.id;
  const isLimitSetter = (merchant as any).limitsSetBy === user.id;
  
  const priorEditBySameUser = await prisma.auditLog.findFirst({
    where: {
      userId: user.id,
      entityType: "MERCHANT",
      entityId: id,
      action: {
        in: ["MERCHANT_FORM_EDIT", "MERCHANT_RESUBMIT"]
      }
    }
  });

  const canApprove = userHasPermission(user, "MERCHANT_APPROVE") && !isCreator && !isLimitSetter && !priorEditBySameUser;
  const canSetLimits = (userHasPermission(user, "TRANSACTION_LIMIT_SET") || userHasPermission(user, "TRANSACTION_LIMIT_OVERRIDE")) && !isCreator;

  return NextResponse.json({
    ...merchant,
    _permissions: {
      canApprove,
      canSetLimits,
      isCreator,
      isLimitSetter,
      hasEdited: !!priorEditBySameUser
    }
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!canAccessMerchant(user, id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rawBody = await request.json().catch(() => ({}));

    // Allowlist. Everything else on the row is either a secret (written only by
    // the encrypt-on-write endpoints), a gateway setting (admin config endpoints),
    // QR state (the /qr endpoint), or server-owned: the setup token and the
    // maker-checker markers are set further down by this route itself.
    const isStaff = STAFF_ROLES.includes(user.role || '');
    const allowedFields = isStaff ? STAFF_EDITABLE_FIELDS : MERCHANT_EDITABLE_FIELDS;
    const body: Record<string, any> = {};
    for (const key of allowedFields) {
      if (rawBody?.[key] !== undefined) body[key] = rawBody[key];
    }

    const profileFields = Object.keys(body).filter((k) => !STATUS_AND_LIMIT_FIELDS.has(k));
    if (profileFields.length > 0) {
      const canEditProfile = isStaff
        ? userHasAnyPermission(user, ["MERCHANT_REGISTER", "MERCHANT_APPROVE"])
        : await isMerchantAccountAdmin(user, id);
      if (!canEditProfile) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    if (body.status !== undefined && !PATCHABLE_STATUSES.has(String(body.status).toLowerCase())) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const fieldErrors: Record<string, string> = {};
    for (const [key, type] of [['callbackUrl', 'callback'], ['websiteUrl', 'website']] as const) {
      if (body[key] === undefined) continue;
      if (body[key] !== null && typeof body[key] !== 'string') {
        fieldErrors[key] = 'Invalid URL';
        continue;
      }
      const result = validateUrl(body[key] ?? '', type);
      if (!result.valid) fieldErrors[key] = result.error;
      else body[key] = body[key]?.trim() ? body[key].trim() : null;
    }
    if (body.email !== undefined && (typeof body.email !== 'string' || !isValidEmail(body.email))) {
      fieldErrors.email = 'Invalid email format';
    }
    if (body.contactUsername !== undefined) {
      const cu = typeof body.contactUsername === 'string' ? body.contactUsername.trim() : '';
      if (isValidEmail(cu)) body.contactUsername = cu;
      else if (isValidPhoneNumber(cu)) body.contactUsername = normalizePhoneNumber(cu);
      else fieldErrors.contactUsername = 'Please enter a valid email or phone number';
    }
    for (const key of ['dailyLimit', 'transactionLimit', 'dailyCountLimit']) {
      if (body[key] === undefined) continue;
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0) fieldErrors[key] = 'Must be a non-negative number';
      else body[key] = n;
    }
    if (body.riskFactors !== undefined) {
      body.riskFactors = Array.isArray(body.riskFactors)
        ? body.riskFactors.filter((r: unknown): r is string => typeof r === 'string').slice(0, 20)
        : [];
    }
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json({ error: 'Validation failed', errors: fieldErrors }, { status: 400 });
    }

    const currentMerchant = await db.getMerchantById(id);
    if (!currentMerchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    if (body.accountNumber !== undefined) {
      // Account number is fixed after onboarding; merchants cannot change it themselves.
      if ((user as any).role === "MERCHANT") {
        return NextResponse.json(
          { error: "Account number cannot be changed from the merchant portal." },
          { status: 403 }
        );
      }

      const accountErrors: Record<string, string> = {};
      const normalizedAccountNumber = validateAccountNumberField(
        body.accountNumber,
        accountErrors,
        { required: true }
      );
      if (Object.keys(accountErrors).length > 0) {
        return NextResponse.json({ error: "Validation failed", errors: accountErrors }, { status: 400 });
      }
      body.accountNumber = normalizedAccountNumber;
    }

    // Restrict logo updates:
    // - merchant can update their own logo
    // - staff can update if they have merchant permissions
    if (body.logoUrl === "" || body.logoUrl === null) {
      body.logoUrl = null
    } else if (body.logoUrl !== undefined) {
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

      // Validate rejection reason if status is rejected
      if ((incomingStatus === "rejected" || incomingStatus === "REJECTED")) {
        if (!body.rejectionReason?.trim()) {
          return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 })
        }
        if (body.rejectionReason.length > 500) {
          return NextResponse.json({ error: "Rejection reason must not exceed 500 characters" }, { status: 400 })
        }
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

      // Maker-Checker principle: application editor cannot perform final approval actions
      const priorEditBySameUser = await prisma.auditLog.findFirst({
        where: {
          userId: user.id,
          entityType: "MERCHANT",
          entityId: id,
          action: {
            in: ["MERCHANT_FORM_EDIT", "MERCHANT_RESUBMIT"]
          }
        }
      })
      if (priorEditBySameUser) {
        return NextResponse.json(
          { error: "Maker-Checker violation: The user who edited this application cannot perform final approval actions." },
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

    // Audit Log
    if (updated) {
      const nonStatusFieldsUpdated = Object.keys(body).some((key) =>
        !["status", "approvedBy", "passwordResetToken", "passwordResetExpires", "rejectionReason"].includes(key)
      )

      // Team-member (SALES) sessions have a virtual id with no User row, so it
      // can't go in the userId foreign key; record who acted in newValue instead.
      const isTeamMemberActor = user.role === 'SALES';
      await prisma.auditLog.create({
        data: {
          userId: isTeamMemberActor ? null : user.id,
          action: body.status
            ? `MERCHANT_STATUS_${String(body.status).toUpperCase()}`
            : nonStatusFieldsUpdated
              ? 'MERCHANT_FORM_EDIT'
              : 'MERCHANT_UPDATE',
          entityType: 'MERCHANT',
          entityId: id,
          oldValue: currentMerchant as any,
          // The setup token is a live credential (it activates the merchant) — never persist it in the log.
          newValue: {
            ...body,
            passwordResetToken: undefined,
            passwordResetExpires: undefined,
            ...(isTeamMemberActor ? { actorTeamMemberId: user.teamMemberId } : {}),
          } as any
        }
      });
    }

    // Trigger notification if approved or rejected
    if (updated) {
      if (body.status === 'approved' || body.status === 'APPROVED') {
        const setupLink = await generatePasswordSetupLink(id, body.passwordResetToken);
        await sendNotification({
          to: updated.contactUsername,
          subject: 'Merchant Account Approved',
          message: `Congratulations! Your merchant account for ${updated.name} has been approved. Please set up your password here: ${setupLink}`
        });
      } else if (body.status === 'rejected' || body.status === 'REJECTED') {
        const registerLink = generateMerchantRegisterLink();
        await sendNotification({
          to: updated.contactUsername,
          subject: 'Merchant Account Rejected',
          message: `We regret to inform you that your merchant account application for ${updated.name} has been rejected.\n\nReason: ${body.rejectionReason}\n\nIf you would like to try again, you can start a new application using this link: ${registerLink}`
        });
      }
    }

    // Re-calculate permissions for the updated merchant
    const isCreator = updated.createdBy === user.id;
    const isLimitSetter = (updated as any).limitsSetBy === user.id;
    const priorEditBySameUser = await prisma.auditLog.findFirst({
      where: {
        userId: user.id,
        entityType: "MERCHANT",
        entityId: id,
        action: {
          in: ["MERCHANT_FORM_EDIT", "MERCHANT_RESUBMIT"]
        }
      }
    });

    const canApprove = userHasPermission(user, "MERCHANT_APPROVE") && !isCreator && !isLimitSetter && !priorEditBySameUser;
    const canSetLimits = (userHasPermission(user, "TRANSACTION_LIMIT_SET") || userHasPermission(user, "TRANSACTION_LIMIT_OVERRIDE")) && !isCreator;

    return NextResponse.json({
      ...updated,
      _permissions: {
        canApprove,
        canSetLimits,
        isCreator,
        isLimitSetter,
        hasEdited: !!priorEditBySameUser
      }
    });
  } catch (error) {
    console.error('Error updating merchant:', error);
    return NextResponse.json({ error: 'Failed to update merchant' }, { status: 500 });
  }
}
