import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userHasPermission } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import { writeAuditLog } from '@/lib/audit-log';

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!userHasPermission(user, 'cashback.reconciliation.view') && 
        !(userHasPermission(user, 'DASHBOARD_VIEW') && userHasPermission(user, 'CONFIGURATION_MANAGE'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get('merchantId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const where: any = {};
    
    if (merchantId) {
      where.merchantId = merchantId;
    }
    
    if (status) {
      where.status = status;
    }
    
    if (search) {
      where.OR = [
        { transactionReference: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
        { customerAccount: { contains: search } }
      ];
    }

    const transactions = await prisma.cashbackTransaction.findMany({
      where,
      include: {
        merchant: { select: { id: true, name: true } },
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
      take: limit ? parseInt(limit) : 50,
      skip: offset ? parseInt(offset) : 0
    });

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
      merchants: allMerchants
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
      if (!userHasPermission(user, 'cashback.reconciliation.retry') && 
          !(userHasPermission(user, 'DASHBOARD_VIEW') && userHasPermission(user, 'CONFIGURATION_MANAGE'))) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }

      const { type, cashbackTransactionId, newTransactionReference, reason } = body;

      if (!type || !cashbackTransactionId || !reason) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      if (type === 'REFERENCE_UPDATE' && !newTransactionReference) {
        return NextResponse.json({ error: 'New transaction reference is required' }, { status: 400 });
      }

      // Get the transaction to get the old reference
      const transaction = await prisma.cashbackTransaction.findUnique({
        where: { id: cashbackTransactionId }
      });

      if (!transaction) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      }

      const request = await prisma.cashbackRequest.create({
        data: {
          type,
          cashbackTransactionId,
          oldTransactionReference: transaction.transactionReference,
          newTransactionReference: newTransactionReference || null,
          reason,
          makerId: userId
        }
      });

      await writeAuditLog({
        request,
        userId,
        action: 'CASHBACK_REQUEST_CREATE',
        entityType: 'CASHBACK_REQUEST',
        entityId: request.id,
        oldValue: { oldTransactionReference: transaction.transactionReference },
        newValue: { type, newTransactionReference, reason }
      });

      return NextResponse.json({ request });
    }

    // Approve request (Checker)
    if (action === 'approve_request') {
      if (!userHasPermission(user, 'cashback.reconciliation.manage') && 
          !(userHasPermission(user, 'DASHBOARD_VIEW') && userHasPermission(user, 'CONFIGURATION_MANAGE'))) {
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
        await prisma.cashbackTransaction.update({
          where: { id: cashbackRequest.cashbackTransactionId },
          data: { status: 'PENDING' }
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
      if (!userHasPermission(user, 'cashback.reconciliation.manage') && 
          !(userHasPermission(user, 'DASHBOARD_VIEW') && userHasPermission(user, 'CONFIGURATION_MANAGE'))) {
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
      if (!userHasPermission(user, 'cashback.reconciliation.retry') && 
          !(userHasPermission(user, 'DASHBOARD_VIEW') && userHasPermission(user, 'CONFIGURATION_MANAGE'))) {
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

      // Update transactions to PENDING for retry
      const updated = await prisma.cashbackTransaction.updateMany({
        where: { id: { in: cashbackIds } },
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

      if (!userHasPermission(user, 'cashback.reconciliation.manage') && 
          !(userHasPermission(user, 'DASHBOARD_VIEW') && userHasPermission(user, 'CONFIGURATION_MANAGE'))) {
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
