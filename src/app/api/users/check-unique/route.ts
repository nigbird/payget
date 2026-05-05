import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db'; // Assuming you have a db utility
import { writeAuditLog } from '@/lib/audit-log';
import { requireCsrf } from '@/lib/request-security';

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const { username } = await request.json();

    if (!username) {
      await writeAuditLog({
        request,
        userId: null,
        action: "USER_CHECK_UNIQUE",
        entityType: "USER",
        entityId: null,
        newValue: { result: "failed", reason: "USERNAME_REQUIRED" },
      });

      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Check if a user with this email or phone already exists
    const existingUser = await db.getUserByEmailOrPhone(username); // You'll need to implement this in your db utility

    if (existingUser) {
      await writeAuditLog({
        request,
        userId: null,
        action: "USER_CHECK_UNIQUE",
        entityType: "USER",
        entityId: null,
        newValue: { result: "success", isUnique: false, username },
      });

      return NextResponse.json({ isUnique: false, message: 'Invalid username' }, { status: 200 });
    } else {
      await writeAuditLog({
        request,
        userId: null,
        action: "USER_CHECK_UNIQUE",
        entityType: "USER",
        entityId: null,
        newValue: { result: "success", isUnique: true, username },
      });

      return NextResponse.json({ isUnique: true, message: 'This email or phone number is available.' }, { status: 200 });
    }
  } catch (error) {
    console.error('Error checking username uniqueness:', error);

    await writeAuditLog({
      request,
      userId: null,
      action: "USER_CHECK_UNIQUE",
      entityType: "USER",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    });

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
