import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userHasPermission } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import { writeAuditLog } from '@/lib/audit-log';
import { executeTransferForTransaction } from '@/lib/cashback/processor';

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!userHasPermission(user, 'cashback.reconciliation.view')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get('merchantId');
    const merchantName = searchParams.get('merchantName');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const download = searchParams.get('download') === 'true';
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20;
    const offset = (page - 1) * limit;

    const where: any = {
      NOT: { status: 'SKIPPED' }, // Never show skipped transactions
    };

    if (merchantId) {
      where.merchantId = merchantId;
    }

    if (merchantName) {
      where.merchant = { name: merchantName };
    }

    if (status && status !== 'ALL') {
      where.status = status;
      delete where.NOT; // Remove the NOT clause if status is explicitly set
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.OR = [
        { transactionReference: { contains: search, mode: 'insensitive' } },
        // FT / receipt numbers, so a cashback settled from a bank receipt can be
        // found again by that FT — matches how payment reconciliation searches.
        { providerCreditRef: { contains: search, mode: 'insensitive' } },
        { providerDebitRef: { contains: search, mode: 'insensitive' } },
        { requests: { some: { ftNumber: { contains: search, mode: 'insensitive' } } } },
        { customerPhone: { contains: search } },
        { customerAccount: { contains: search } }
      ];
    }

    if (download) {
      // Export needs every row matching the filters, not just the current page.
      const transactions = await prisma.cashbackTransaction.findMany({
        where,
        include: {
          merchant: { select: { id: true, name: true, accountNumber: true } },
          category: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50000
      });
      return NextResponse.json({ transactions, total: transactions.length });
    }

    const [transactions, total] = await Promise.all([
      prisma.cashbackTransaction.findMany({
        where,
        include: {
          merchant: { select: { id: true, name: true, accountNumber: true } },
          category: { select: { id: true, name: true } },
          requests: {
            orderBy: { createdAt: 'desc' },
            include: {
              maker: { select: { id: true, name: true, email: true } },
              checker: { select: { id: true, name: true, email: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.cashbackTransaction.count({ where })
    ]);

    // Get pending requests for review
    const requests = await prisma.cashbackRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        cashbackTransaction: {
          include: {
            merchant: { select: { id: true, name: true } }
          }
        },
        maker: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate stats
    const [pending, failed, completed, totalAmount] = await Promise.all([
      prisma.cashbackTransaction.count({ where: { status: 'PENDING' } }),
      prisma.cashbackTransaction.count({ where: { status: 'FAILED' } }),
      prisma.cashbackTransaction.count({ where: { status: 'COMPLETED' } }),
      prisma.cashbackTransaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { cashbackAmount: true }
      })
    ]);

    // Get top merchants with failures
    const topFailedMerchants = await prisma.cashbackTransaction.groupBy({
      by: ['merchantId'],
      where: { status: 'FAILED' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    });

    const merchantIds = topFailedMerchants.map(m => m.merchantId);
    const merchants = await prisma.merchant.findMany({
      where: { id: { in: merchantIds } },
      select: { id: true, name: true }
    });

    const merchantMap = new Map(merchants.map(m => [m.id, m.name]));
    const topMerchants = topFailedMerchants.map(m => ({
      name: merchantMap.get(m.merchantId) || m.merchantId,
      count: m._count.id
    }));

    // Get all merchants for the dropdown
    const allMerchants = await prisma.merchant.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });

    const totalPages = Math.ceil(total / limit);
    return NextResponse.json({
      transactions,
      requests,
      stats: {
        pending,
        failed,
        successful: completed,
        totalAmount: totalAmount._sum.cashbackAmount || 0,
        retrySuccessRate: 78, // Mock for now, calculate properly later
        topMerchants
      },
      merchants: allMerchants,
      total,
      totalPages,
      currentPage: page,
      itemsPerPage: limit
    });
  } catch (error) {
    console.error('Error fetching cashback reconciliation:', error);
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
        action: 'CASHBACK_RECONCILIATION_RETRY',
        entityType: 'CASHBACK_TRANSACTION',
        entityId: null,
        newValue: { result: 'failed', reason: 'UNAUTHORIZED' }
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    const body = await request.json();
    const action = body.action;

    // Create request (Maker)
    if (action === 'create_request') {
      if (!userHasPermission(user, 'cashback.reconciliation.retry')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { type, cashbackTransactionId, newTransactionReference, ftNumber, reason } = body;

      if (!type || !cashbackTransactionId || !reason) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      if (type === 'REFERENCE_UPDATE' && !newTransactionReference) {
        return NextResponse.json({ error: 'New transaction reference is required' }, { status: 400 });
      }

      if (type === 'MANUAL_SETTLE' && !ftNumber?.trim()) {
        return NextResponse.json(
          { error: 'FT number from the bank receipt is required' },
          { status: 400 }
        );
      }

      // Get the transaction to get the old reference
      const transaction = await prisma.cashbackTransaction.findUnique({
        where: { id: cashbackTransactionId }
      });

      if (!transaction) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      }

      if ((type === 'RETRY' || type === 'MANUAL_SETTLE') && transaction.status === 'COMPLETED') {
        return NextResponse.json(
          { error: 'Transaction has already been successfully processed and rewarded.' },
          { status: 400 }
        );
      }

      const cashbackRequest = await prisma.cashbackRequest.create({
        data: {
          type,
          cashbackTransactionId,
          oldTransactionReference: transaction.transactionReference,
          newTransactionReference: newTransactionReference || null,
          ftNumber: ftNumber?.trim() || null,
          reason,
          makerId: userId
        }
      });

      await writeAuditLog({
        request,
        userId,
        action: 'CASHBACK_REQUEST_CREATE',
        entityType: 'CASHBACK_REQUEST',
        entityId: cashbackRequest.id,
        oldValue: { oldTransactionReference: transaction.transactionReference },
        newValue: { type, newTransactionReference, reason }
      });

      return NextResponse.json({ request: cashbackRequest });
    }

    // Approve request (Checker)
    if (action === 'approve_request') {
      if (!userHasPermission(user, 'cashback.reconciliation.manage')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { requestId, comments } = body;

      if (!requestId) {
        return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
      }

      const cashbackRequest = await prisma.cashbackRequest.findUnique({
        where: { id: requestId },
        include: { cashbackTransaction: true }
      });

      if (!cashbackRequest) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }

      if (cashbackRequest.status !== 'PENDING') {
        return NextResponse.json({ error: 'Request is not pending' }, { status: 400 });
      }

      if (cashbackRequest.makerId === userId) {
        return NextResponse.json({ error: 'Cannot approve your own request' }, { status: 400 });
      }

      // Execute the request
      if (cashbackRequest.type === 'REFERENCE_UPDATE' && cashbackRequest.newTransactionReference) {
        await prisma.cashbackTransaction.update({
          where: { id: cashbackRequest.cashbackTransactionId },
          data: { transactionReference: cashbackRequest.newTransactionReference }
        });
      } else if (cashbackRequest.type === 'RETRY') {
        // Trigger actual execution using the refund API
        await executeTransferForTransaction(cashbackRequest.cashbackTransactionId);
      } else if (cashbackRequest.type === 'MANUAL_SETTLE') {
        // The FT on the bank receipt is the evidence that the credit landed —
        // record it and close the cashback out without calling the provider.
        await prisma.cashbackTransaction.update({
          where: { id: cashbackRequest.cashbackTransactionId },
          data: {
            status: 'COMPLETED',
            providerCreditRef: cashbackRequest.ftNumber,
            failureReason: null,
            processedAt: new Date(),
          }
        });
        await prisma.cashbackProcessingLog.create({
          data: {
            cashbackTransactionId: cashbackRequest.cashbackTransactionId,
            level: 'INFO',
            message: 'Cashback settled manually from bank receipt FT',
            metadata: {
              ftNumber: cashbackRequest.ftNumber,
              makerId: cashbackRequest.makerId,
              checkerId: userId,
              reason: cashbackRequest.reason,
            },
          }
        });
      }

      const updatedRequest = await prisma.cashbackRequest.update({
        where: { id: requestId },
        data: {
          status: 'EXECUTED',
          checkerId: userId,
          checkedAt: new Date(),
          comments
        }
      });

      await writeAuditLog({
        request,
        userId,
        action: 'CASHBACK_REQUEST_APPROVE',
        entityType: 'CASHBACK_REQUEST',
        entityId: requestId,
        newValue: { status: 'EXECUTED', comments }
      });

      return NextResponse.json({ request: updatedRequest });
    }

    // Reject request (Checker)
    if (action === 'reject_request') {
      if (!userHasPermission(user, 'cashback.reconciliation.manage')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { requestId, comments } = body;

      if (!requestId) {
        return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
      }

      const cashbackRequest = await prisma.cashbackRequest.findUnique({
        where: { id: requestId }
      });

      if (!cashbackRequest) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }

      if (cashbackRequest.status !== 'PENDING') {
        return NextResponse.json({ error: 'Request is not pending' }, { status: 400 });
      }

      if (cashbackRequest.makerId === userId) {
        return NextResponse.json({ error: 'Cannot reject your own request' }, { status: 400 });
      }

      const updatedRequest = await prisma.cashbackRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          checkerId: userId,
          checkedAt: new Date(),
          comments
        }
      });

      await writeAuditLog({
        request,
        userId,
        action: 'CASHBACK_REQUEST_REJECT',
        entityType: 'CASHBACK_REQUEST',
        entityId: requestId,
        newValue: { status: 'REJECTED', comments }
      });

      return NextResponse.json({ request: updatedRequest });
    }

    // Original actions for backwards compatibility
    if (action === 'retry') {
      if (!userHasPermission(user, 'cashback.reconciliation.retry')) {
        await writeAuditLog({
          request,
          userId,
          action: 'CASHBACK_RECONCILIATION_RETRY',
          entityType: 'CASHBACK_TRANSACTION',
          entityId: null,
          newValue: { result: 'failed', reason: 'PERMISSION_DENIED' }
        });
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { cashbackIds } = body;
      if (!cashbackIds || !Array.isArray(cashbackIds) || cashbackIds.length === 0) {
        return NextResponse.json({ error: 'No cashback transactions specified' }, { status: 400 });
      }

      // Update transactions to PENDING for retry, excluding already-rewarded ones
      const updated = await prisma.cashbackTransaction.updateMany({
        where: { id: { in: cashbackIds }, NOT: { status: 'COMPLETED' } },
        data: { status: 'PENDING' }
      });

      await writeAuditLog({
        request,
        userId,
        action: 'CASHBACK_RECONCILIATION_RETRY',
        entityType: 'CASHBACK_TRANSACTION',
        entityId: cashbackIds.join(','),
        newValue: { result: 'success', count: updated.count }
      });

      return NextResponse.json({ message: 'Retry initiated', count: updated.count });
    }

    if (action === 'mark_reconciled') {
      const { cashbackIds } = body;
      if (!cashbackIds || !Array.isArray(cashbackIds) || cashbackIds.length === 0) {
        return NextResponse.json({ error: 'No cashback transactions specified' }, { status: 400 });
      }

      if (!userHasPermission(user, 'cashback.reconciliation.manage')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const updated = await prisma.cashbackTransaction.updateMany({
        where: { id: { in: cashbackIds } },
        data: { status: 'COMPLETED' }
      });

      await writeAuditLog({
        request,
        userId,
        action: 'CASHBACK_RECONCILIATION_MARK_RECONCILED',
        entityType: 'CASHBACK_TRANSACTION',
        entityId: cashbackIds.join(','),
        newValue: { result: 'success', count: updated.count }
      });

      return NextResponse.json({ message: 'Marked as reconciled', count: updated.count });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in cashback reconciliation:', error);

    await writeAuditLog({
      request,
      userId,
      action: 'CASHBACK_RECONCILIATION_ACTION',
      entityType: 'CASHBACK_TRANSACTION',
      entityId: null,
      newValue: { result: 'failed', reason: 'INTERNAL_ERROR' }
    });

    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
