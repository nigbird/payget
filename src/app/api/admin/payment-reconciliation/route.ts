import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userHasPermission } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import { writeAuditLog } from '@/lib/audit-log';
import { settleTransaction } from '@/lib/payment-settlement';

/**
 * Manual payment reconciliation (maker/checker).
 *
 * Used when a customer's payment succeeded at the bank but the provider
 * callback never resolved it here. An operator reads the FT off an internal
 * bank receipt, submits it with a reason, and a second user approves. On
 * approval the transaction is forced to success, the FT is recorded, and
 * cashback processing runs.
 *
 * The FT is the evidence — no provider call is made.
 */

/** Statuses that are stuck and therefore reconcilable. */
const UNRESOLVED_STATUSES = ['AWAITING_PIN', 'INITIATED', 'PENDING', 'PROCESSING'] as const;

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!userHasPermission(user, 'payment.reconciliation.view')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get('merchantId');
    const search = searchParams.get('search');
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20;
    const offset = (page - 1) * limit;

    const where: any = { status: { in: [...UNRESOLVED_STATUSES] } };

    if (merchantId) {
      where.merchantId = merchantId;
    }

    if (search) {
      where.OR = [
        { transactionReference: { contains: search, mode: 'insensitive' } },
        { cbsreference: { contains: search, mode: 'insensitive' } },
        { payerPhone: { contains: search } },
        { payerAccount: { contains: search } },
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          merchant: { select: { id: true, name: true, accountNumber: true } },
          reconciliationRequests: {
            orderBy: { createdAt: 'desc' },
            include: {
              maker: { select: { id: true, name: true, email: true } },
              checker: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.transaction.count({ where }),
    ]);

    // Pending requests awaiting a checker
    const requests = await prisma.paymentReconciliationRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        transaction: {
          include: { merchant: { select: { id: true, name: true } } },
        },
        maker: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const [unresolved, settledByFt, pendingRequests] = await Promise.all([
      prisma.transaction.count({ where: { status: { in: [...UNRESOLVED_STATUSES] } } }),
      prisma.paymentReconciliationRequest.count({ where: { status: 'EXECUTED' } }),
      prisma.paymentReconciliationRequest.count({ where: { status: 'PENDING' } }),
    ]);

    const allMerchants = await prisma.merchant.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    // Strip secrets before returning transactions to the client
    const safeTransactions = transactions.map((tx) => {
      const { userCredentials, ...rest } = tx as any;
      const { providerSharedSecret, authToken, ...safeCredentials } = (userCredentials || {}) as any;
      return { ...rest, userCredentials: safeCredentials };
    });

    return NextResponse.json({
      transactions: safeTransactions,
      requests,
      stats: { unresolved, settledByFt, pendingRequests },
      merchants: allMerchants,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      itemsPerPage: limit,
    });
  } catch (error) {
    console.error('Error fetching payment reconciliation:', error);
    return NextResponse.json({ error: 'Failed to fetch reconciliation data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let userId: string | null = null;
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const user = await requireAuthUser(request);
    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: 'PAYMENT_RECONCILIATION_ACTION',
        entityType: 'TRANSACTION',
        entityId: null,
        newValue: { result: 'failed', reason: 'UNAUTHORIZED' },
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    const body = await request.json();
    const action = body.action;

    // --- Maker: submit an FT for approval ---
    if (action === 'create_request') {
      if (!userHasPermission(user, 'payment.reconciliation.request')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { transactionId, ftNumber, reason } = body;

      if (!transactionId || !ftNumber?.trim() || !reason?.trim()) {
        return NextResponse.json(
          { error: 'Transaction, FT number and reason are all required' },
          { status: 400 }
        );
      }

      const ft = String(ftNumber).trim();

      const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
      if (!transaction) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      }

      if (transaction.status === 'SUCCESS' || transaction.status === 'FAILED') {
        return NextResponse.json(
          { error: `Transaction is already ${transaction.status.toLowerCase()} and cannot be reconciled.` },
          { status: 400 }
        );
      }

      // One receipt cannot settle two payments — reject early rather than at approval
      const ftHolder = await prisma.transaction.findUnique({
        where: { cbsreference: ft },
        select: { id: true, transactionReference: true },
      });
      if (ftHolder && ftHolder.id !== transactionId) {
        return NextResponse.json(
          { error: `FT ${ft} is already recorded on transaction ${ftHolder.transactionReference}.` },
          { status: 409 }
        );
      }

      const openRequest = await prisma.paymentReconciliationRequest.findFirst({
        where: { transactionId, status: 'PENDING' },
      });
      if (openRequest) {
        return NextResponse.json(
          { error: 'This transaction already has a reconciliation request awaiting approval.' },
          { status: 409 }
        );
      }

      const reconciliationRequest = await prisma.paymentReconciliationRequest.create({
        data: {
          transactionId,
          ftNumber: ft,
          previousStatus: transaction.status,
          reason: String(reason).trim(),
          makerId: userId,
        },
      });

      await writeAuditLog({
        request,
        userId,
        action: 'PAYMENT_RECONCILIATION_REQUEST_CREATE',
        entityType: 'PAYMENT_RECONCILIATION_REQUEST',
        entityId: reconciliationRequest.id,
        oldValue: { status: transaction.status },
        newValue: {
          transactionId,
          transactionReference: transaction.transactionReference,
          ftNumber: ft,
          reason,
        },
      });

      return NextResponse.json({ request: reconciliationRequest });
    }

    // --- Checker: approve, settling the payment ---
    if (action === 'approve_request') {
      if (!userHasPermission(user, 'payment.reconciliation.manage')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { requestId, comments } = body;
      if (!requestId) {
        return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
      }

      const reconciliationRequest = await prisma.paymentReconciliationRequest.findUnique({
        where: { id: requestId },
        include: { transaction: true },
      });

      if (!reconciliationRequest) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }

      if (reconciliationRequest.status !== 'PENDING') {
        return NextResponse.json({ error: 'Request is not pending' }, { status: 400 });
      }

      if (reconciliationRequest.makerId === userId) {
        return NextResponse.json({ error: 'Cannot approve your own request' }, { status: 400 });
      }

      // Settles the payment, records the FT, and triggers cashback
      const settlement = await settleTransaction({
        transactionId: reconciliationRequest.transactionId,
        status: 'success',
        ftNumber: reconciliationRequest.ftNumber,
        source: 'manual_ft_reconciliation',
      });

      if (!settlement.ok) {
        await writeAuditLog({
          request,
          userId,
          action: 'PAYMENT_RECONCILIATION_REQUEST_APPROVE',
          entityType: 'PAYMENT_RECONCILIATION_REQUEST',
          entityId: requestId,
          newValue: { result: 'failed', reason: settlement.code, error: settlement.error },
        });
        return NextResponse.json({ error: settlement.error }, { status: 409 });
      }

      const updatedRequest = await prisma.paymentReconciliationRequest.update({
        where: { id: requestId },
        data: {
          status: 'EXECUTED',
          checkerId: userId,
          checkedAt: new Date(),
          comments,
        },
      });

      await writeAuditLog({
        request,
        userId,
        action: 'PAYMENT_RECONCILIATION_REQUEST_APPROVE',
        entityType: 'PAYMENT_RECONCILIATION_REQUEST',
        entityId: requestId,
        oldValue: { status: reconciliationRequest.previousStatus },
        newValue: {
          result: 'success',
          status: 'success',
          transactionId: reconciliationRequest.transactionId,
          transactionReference: reconciliationRequest.transaction.transactionReference,
          ftNumber: reconciliationRequest.ftNumber,
          settledBy: 'manual_ft_reconciliation',
          comments,
        },
      });

      return NextResponse.json({ request: updatedRequest });
    }

    // --- Checker: reject ---
    if (action === 'reject_request') {
      if (!userHasPermission(user, 'payment.reconciliation.manage')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { requestId, comments } = body;
      if (!requestId) {
        return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
      }

      const reconciliationRequest = await prisma.paymentReconciliationRequest.findUnique({
        where: { id: requestId },
      });

      if (!reconciliationRequest) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }

      if (reconciliationRequest.status !== 'PENDING') {
        return NextResponse.json({ error: 'Request is not pending' }, { status: 400 });
      }

      if (reconciliationRequest.makerId === userId) {
        return NextResponse.json({ error: 'Cannot reject your own request' }, { status: 400 });
      }

      const updatedRequest = await prisma.paymentReconciliationRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          checkerId: userId,
          checkedAt: new Date(),
          comments,
        },
      });

      await writeAuditLog({
        request,
        userId,
        action: 'PAYMENT_RECONCILIATION_REQUEST_REJECT',
        entityType: 'PAYMENT_RECONCILIATION_REQUEST',
        entityId: requestId,
        newValue: { status: 'REJECTED', comments },
      });

      return NextResponse.json({ request: updatedRequest });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in payment reconciliation:', error);

    await writeAuditLog({
      request,
      userId,
      action: 'PAYMENT_RECONCILIATION_ACTION',
      entityType: 'TRANSACTION',
      entityId: null,
      newValue: { result: 'failed', reason: 'INTERNAL_ERROR' },
    });

    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
