import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userHasPermission } from '@/lib/request-auth';
import { searchAuditLogs, exportAuditLogs } from '@/lib/audit-log';

const SENSITIVE_VALUE_KEYS = new Set([
  'merchantId', 'transactionId', 'transactionReference',
  'token', 'resetToken', 'authToken', 'secret', 'password',
])

function sanitizeJsonValue(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !SENSITIVE_VALUE_KEYS.has(k))
  )
}

function sanitizeLog<T extends { ipAddress?: unknown; userAgent?: unknown; oldValue?: unknown; newValue?: unknown }>(log: T) {
  const { ipAddress: _ip, userAgent: _ua, ...rest } = log as any
  return {
    ...rest,
    oldValue: sanitizeJsonValue(rest.oldValue),
    newValue: sanitizeJsonValue(rest.newValue),
  }
}

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
    const isExport = url.searchParams.get('export') === 'true';
    
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

    if (isExport) {
      const logs = await exportAuditLogs(params);

      // Convert to CSV
      const headers = [
        'Timestamp',
        'User Name',
        'User Email',
        'Action',
        'Entity Type',
        'Entity ID',
        'Old Value',
        'New Value'
      ];

      const csvContent = [
        headers.join(','),
        ...logs.map(log => {
          const s = sanitizeLog(log)
          return [
            `"${new Date(log.createdAt).toISOString()}"`,
            `"${log.user?.name || 'System'}"`,
            `"${log.user?.email || ''}"`,
            `"${log.action}"`,
            `"${log.entityType}"`,
            `"${log.entityId || ''}"`,
            `"${JSON.stringify(s.oldValue || '').replace(/"/g, '""')}"`,
            `"${JSON.stringify(s.newValue || '').replace(/"/g, '""')}"`
          ].join(',')
        })
      ].join('\n');
      
      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

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
      logs: result.logs.map(sanitizeLog),
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
