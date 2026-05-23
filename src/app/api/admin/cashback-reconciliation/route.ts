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
        category: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit) : 50,
      skip: offset ? parseInt(offset) : 0
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

    const { action, cashbackIds } = await request.json();

    if (action === 'retry') {
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
