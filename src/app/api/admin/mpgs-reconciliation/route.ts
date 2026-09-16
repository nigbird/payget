import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { db } from '@/lib/db';
import { requireAuthUser, userHasPermission } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import { writeAuditLog } from '@/lib/audit-log';
import {
  isMpgsReconciliationCandidate,
  listMpgsReconciliationCandidates,
  settleMpgsTransaction,
} from '@/lib/mpgs-settlement';

/**
 * Card (MPGS) reconciliation (maker/checker).
 *
 * Mastercard checkout pages do not call back into this app, so some card
 * transactions never resolve. Unlike payment reconciliation, no evidence is
 * supplied by the maker — the maker simply flags a transaction as needing a
 * fresh look and a second user approves. Approval re-queries the gateway at
 * that moment and settles, expires, or closes the transaction according to
 * whatever it currently reports (it may still come back pending).
 */

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!userHasPermission(user, 'mpgs.reconciliation.view')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get('merchantId');
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const status = searchParams.get('status')?.trim().toLowerCase() || '';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20;

    const candidates = await listMpgsReconciliationCandidates({ limit: 500 });

    const merchantIds = Array.from(new Set(candidates.map((tx) => tx.merchantId)));
    const merchantRows = merchantIds.length
      ? await prisma.merchant.findMany({
          where: { id: { in: merchantIds } },
          select: { id: true, name: true, accountNumber: true },
        })
      : [];
    const merchantById = new Map(merchantRows.map((m) => [m.id, m]));

    const candidateIds = candidates.map((tx) => tx.id);
    const requestRows = candidateIds.length
      ? await prisma.mpgsReconciliationRequest.findMany({
          where: { transactionId: { in: candidateIds } },
          orderBy: { createdAt: 'desc' },
          include: {
            maker: { select: { id: true, name: true, email: true } },
            checker: { select: { id: true, name: true, email: true } },
          },
        })
      : [];
    const requestsByTx = new Map<string, typeof requestRows>();
    for (const r of requestRows) {
      const list = requestsByTx.get(r.transactionId) ?? [];
      list.push(r);
      requestsByTx.set(r.transactionId, list);
    }

    let filtered = candidates;
    if (merchantId) {
      filtered = filtered.filter((tx) => tx.merchantId === merchantId);
    }
    if (status) {
      filtered = filtered.filter((tx) => tx.status === status);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      filtered = filtered.filter((tx) => new Date(tx.timestamp).getTime() >= from.getTime());
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((tx) => new Date(tx.timestamp).getTime() <= to.getTime());
    }
    if (search) {
      filtered = filtered.filter((tx) => {
        const phone = tx.payerPhone || (tx.userCredentials as any)?.phone || '';
        return (
          tx.transactionReference.toLowerCase().includes(search) ||
          (tx.payerAccount || '').toLowerCase().includes(search) ||
          String(phone).toLowerCase().includes(search)
        );
      });
    }

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const pageItems = filtered.slice(offset, offset + limit);

    const transactions = pageItems.map((tx) => {
      const mpgs = (tx.userCredentials as any)?.mpgs ?? {};
      return {
        id: tx.id,
        merchantId: tx.merchantId,
        merchant: merchantById.get(tx.merchantId) ?? null,
        amount: tx.amount,
        status: tx.status,
        transactionReference: tx.transactionReference,
        payerPhone: tx.payerPhone ?? null,
        payerAccount: tx.payerAccount ?? null,
        timestamp: tx.timestamp,
        gatewayStatus: mpgs.gatewayStatus ?? null,
        closedReason: mpgs.closedReason ?? null,
        attempts: mpgs.attempts ?? null,
        reconciliationRequests: requestsByTx.get(tx.id) ?? [],
      };
    });

    // Pending requests awaiting a checker
    const requests = await prisma.mpgsReconciliationRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        transaction: {
          include: { merchant: { select: { id: true, name: true } } },
        },
        maker: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const [pendingRequests, reconciledCount] = await Promise.all([
      prisma.mpgsReconciliationRequest.count({ where: { status: 'PENDING' } }),
      prisma.mpgsReconciliationRequest.count({ where: { status: 'EXECUTED' } }),
    ]);

    // Decided requests — a transaction that settled to a non-recoverable
    // terminal state drops out of `transactions` above, so this is the only
    // place its outcome remains visible.
    const history = await prisma.mpgsReconciliationRequest.findMany({
      where: { status: { in: ['EXECUTED', 'REJECTED'] } },
      include: {
        transaction: {
          include: { merchant: { select: { id: true, name: true } } },
        },
        maker: { select: { id: true, name: true, email: true } },
        checker: { select: { id: true, name: true, email: true } },
      },
      orderBy: { checkedAt: 'desc' },
      take: 200,
    });

    const allMerchants = await prisma.merchant.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      transactions,
      requests,
      history,
      stats: { openTransactions: candidates.length, pendingRequests, reconciledCount },
      merchants: allMerchants,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      currentPage: page,
      itemsPerPage: limit,
    });
  } catch (error) {
    console.error('Error fetching MPGS reconciliation:', error);
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
        action: 'MPGS_RECONCILIATION_ACTION',
        entityType: 'TRANSACTION',
        entityId: null,
        newValue: { result: 'failed', reason: 'UNAUTHORIZED' },
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    const body = await request.json();
    const action = body.action;

    // --- Maker: flag a card transaction for a fresh gateway check ---
    if (action === 'create_request') {
      if (!userHasPermission(user, 'mpgs.reconciliation.request')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { transactionId, reason } = body;

      if (!transactionId || !reason?.trim()) {
        return NextResponse.json(
          { error: 'Transaction and reason are both required' },
          { status: 400 }
        );
      }

      const transaction = await db.getTransactionById(transactionId);
      if (!transaction) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      }

      if (!isMpgsReconciliationCandidate(transaction)) {
        return NextResponse.json(
          { error: 'This transaction is not an open card transaction eligible for reconciliation.' },
          { status: 400 }
        );
      }

      const openRequest = await prisma.mpgsReconciliationRequest.findFirst({
        where: { transactionId, status: 'PENDING' },
      });
      if (openRequest) {
        return NextResponse.json(
          { error: 'This transaction already has a reconciliation request awaiting approval.' },
          { status: 409 }
        );
      }

      const reconciliationRequest = await prisma.mpgsReconciliationRequest.create({
        data: {
          transactionId,
          previousStatus: transaction.status,
          reason: String(reason).trim(),
          makerId: userId,
        },
      });

      await writeAuditLog({
        request,
        userId,
        action: 'MPGS_RECONCILIATION_REQUEST_CREATE',
        entityType: 'MPGS_RECONCILIATION_REQUEST',
        entityId: reconciliationRequest.id,
        oldValue: { status: transaction.status },
        newValue: {
          transactionId,
          transactionReference: transaction.transactionReference,
          reason,
        },
      });

      return NextResponse.json({ request: reconciliationRequest });
    }

    // --- Checker: approve, re-checking the gateway now ---
    if (action === 'approve_request') {
      if (!userHasPermission(user, 'mpgs.reconciliation.manage')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { requestId, comments } = body;
      if (!requestId) {
        return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
      }

      const reconciliationRequest = await prisma.mpgsReconciliationRequest.findUnique({
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

      const settlement = await settleMpgsTransaction(reconciliationRequest.transactionId, {
        request,
        actorUserId: userId,
      });

      if (settlement.action === 'error') {
        await writeAuditLog({
          request,
          userId,
          action: 'MPGS_RECONCILIATION_REQUEST_APPROVE',
          entityType: 'MPGS_RECONCILIATION_REQUEST',
          entityId: requestId,
          newValue: { result: 'failed', reason: settlement.reason },
        });
        return NextResponse.json(
          { error: settlement.reason || 'Could not reach the gateway.' },
          { status: 409 }
        );
      }

      const updatedRequest = await prisma.mpgsReconciliationRequest.update({
        where: { id: requestId },
        data: {
          status: 'EXECUTED',
          checkerId: userId,
          checkedAt: new Date(),
          comments,
          resultAction: settlement.action,
        },
      });

      await writeAuditLog({
        request,
        userId,
        action: 'MPGS_RECONCILIATION_REQUEST_APPROVE',
        entityType: 'MPGS_RECONCILIATION_REQUEST',
        entityId: requestId,
        oldValue: { status: reconciliationRequest.previousStatus },
        newValue: {
          result: 'success',
          gatewayAction: settlement.action,
          status: settlement.status,
          transactionId: reconciliationRequest.transactionId,
          transactionReference: reconciliationRequest.transaction.transactionReference,
          gatewayStatus: settlement.gatewayStatus,
          reason: settlement.reason,
          comments,
        },
      });

      return NextResponse.json({ request: updatedRequest, settlement });
    }

    // --- Checker: reject ---
    if (action === 'reject_request') {
      if (!userHasPermission(user, 'mpgs.reconciliation.manage')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { requestId, comments } = body;
      if (!requestId) {
        return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
      }

      const reconciliationRequest = await prisma.mpgsReconciliationRequest.findUnique({
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

      const updatedRequest = await prisma.mpgsReconciliationRequest.update({
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
        action: 'MPGS_RECONCILIATION_REQUEST_REJECT',
        entityType: 'MPGS_RECONCILIATION_REQUEST',
        entityId: requestId,
        newValue: { status: 'REJECTED', comments },
      });

      return NextResponse.json({ request: updatedRequest });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in MPGS reconciliation:', error);

    await writeAuditLog({
      request,
      userId,
      action: 'MPGS_RECONCILIATION_ACTION',
      entityType: 'TRANSACTION',
      entityId: null,
      newValue: { result: 'failed', reason: 'INTERNAL_ERROR' },
    });

    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
