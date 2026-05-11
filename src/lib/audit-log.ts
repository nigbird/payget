import { prisma } from "@/lib/prisma";

export type AuditLogAction = string;
export type AuditLogEntityType = string;

export type AuditLogPayload = {
  request?: Request;
  userId?: string | null;
  action: AuditLogAction;
  entityType: AuditLogEntityType;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

export type AuditLogSearchParams = {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
};

function getClientIp(request?: Request): string | null {
  if (!request) return null;
  const xForwardedFor = request.headers.get("x-forwarded-for");
  const xRealIp = request.headers.get("x-real-ip");
  const forwarded = xForwardedFor?.split(",")[0]?.trim();
  return (forwarded || xRealIp || null) as string | null;
}

export async function writeAuditLog(payload: AuditLogPayload) {
  const userAgent = payload.request?.headers.get("user-agent") || null;
  const ipAddress = getClientIp(payload.request);

  // Don't block the request if audit logging fails
  try {
    await prisma.auditLog.create({
      data: {
        userId: payload.userId ?? null,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId ?? null,
        oldValue: payload.oldValue === undefined ? undefined : (payload.oldValue as any),
        newValue: payload.newValue === undefined ? undefined : (payload.newValue as any),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });
  } catch {
    // Intentionally ignore audit log write failures
  }
}

export async function searchAuditLogs(params: AuditLogSearchParams = {}) {
  const {
    page = 1,
    limit = 50,
    search,
    action,
    entityType,
    userId,
    startDate,
    endDate,
  } = params;

  const where: any = {};

  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { entityType: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (action) {
    where.action = action;
  }

  if (entityType) {
    where.entityType = entityType;
  }

  if (userId) {
    where.userId = userId;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate);
    }
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function exportAuditLogs(params: AuditLogSearchParams = {}) {
  const {
    search,
    action,
    entityType,
    userId,
    startDate,
    endDate,
  } = params;

  const where: any = {};

  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { entityType: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (action) {
    where.action = action;
  }

  if (entityType) {
    where.entityType = entityType;
  }

  if (userId) {
    where.userId = userId;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate);
    }
  }

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return logs;
}
