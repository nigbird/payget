import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userHasPermission } from '@/lib/request-auth';
import { searchAuditLogs } from '@/lib/audit-log';

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canViewAuditLogs = userHasPermission(user, 'AUDIT_LOG_VIEW');
    if (!canViewAuditLogs) {
      return NextResponse.json({ error: 'Permission denied: AUDIT_LOG_VIEW required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const params = {
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!) : undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
      search: url.searchParams.get('search') || undefined,
      action: url.searchParams.get('action') || undefined,
      entityType: url.searchParams.get('entityType') || undefined,
      userId: url.searchParams.get('userId') || undefined,
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
    };

    const result = await searchAuditLogs(params);

    // Get distinct actions and entity types for filter options
    const [distinctActions, distinctEntityTypes] = await Promise.all([
      prisma.auditLog.findMany({
        select: { action: true },
        distinct: ['action'],
      }),
      prisma.auditLog.findMany({
        select: { entityType: true },
        distinct: ['entityType'],
      }),
    ]);

    return NextResponse.json({
      ...result,
      filterOptions: {
        actions: distinctActions.map(a => a.action),
        entityTypes: distinctEntityTypes.map(e => e.entityType),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
