import { prisma } from "@/lib/prisma";

export type AuditLogAction = string;
export type AuditLogEntityType = string;

export type AuditLogPayload = {
  request: Request;
  userId?: string | null;
  action: AuditLogAction;
  entityType: AuditLogEntityType;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

function getClientIp(request: Request): string | null {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  const xRealIp = request.headers.get("x-real-ip");
  const forwarded = xForwardedFor?.split(",")[0]?.trim();
  return (forwarded || xRealIp || null) as string | null;
}

export async function writeAuditLog(payload: AuditLogPayload) {
  const userAgent = payload.request.headers.get("user-agent");
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
