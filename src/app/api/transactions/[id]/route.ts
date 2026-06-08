import { NextResponse } from 'next/server';
import { db, sanitizeTransaction } from '@/app/lib/db';
import { requireAuthUser } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import { writeAuditLog } from '@/lib/audit-log';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const transaction = await db.getTransactionById(id);
  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }
  return NextResponse.json(sanitizeTransaction(transaction));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let actorUserId: string | null = null;

  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const authUser = await requireAuthUser(request);
    actorUserId = authUser?.id ?? null;

    if (!authUser) {
      await writeAuditLog({
        request,
        userId: null,
        action: "TRANSACTION_STATUS_UPDATE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      });

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const updated = await db.updateTransactionStatus(id, status);

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "TRANSACTION_STATUS_UPDATE",
      entityType: "TRANSACTION",
      entityId: id,
      oldValue: null,
      newValue: { result: "success", status },
    });

    return NextResponse.json(sanitizeTransaction(updated));
  } catch (error) {
    console.error('Error updating transaction:', error);

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "TRANSACTION_STATUS_UPDATE",
      entityType: "TRANSACTION",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    });

    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }
}
