import { requireAuthUserFromContext } from "@/lib/request-auth";

export type PermissionName =
  | 'DASHBOARD_VIEW'
  | 'CONFIGURATION_MANAGE'
  | 'MERCHANT_REGISTER'
  | 'MERCHANT_APPROVE'
  | 'USER_CREATE'
  | 'ROLE_CREATE'
  | 'ROLE_EDIT'
  | 'ROLE_DELETE'
  | 'TRANSACTION_LIMIT_SET'
  | 'TRANSACTION_LIMIT_OVERRIDE'
  | 'AUDIT_LOG_VIEW';

export async function isSuperAdmin(): Promise<boolean> {
  const user = await requireAuthUserFromContext();
  return user?.role === 'ADMIN';
}

export async function hasPermission(permission: PermissionName): Promise<boolean> {
  const user = await requireAuthUserFromContext();
  if (!user) return false;
  return (user.permissions ?? []).includes(permission);
}

export async function hasAllPermissions(perms: PermissionName[]): Promise<boolean> {
  const user = await requireAuthUserFromContext();
  if (!user) return false;
  const userPermissions = user.permissions ?? [];
  return perms.every(p => userPermissions.includes(p));
}

export async function hasAnyPermission(perms: PermissionName[]): Promise<boolean> {
  const user = await requireAuthUserFromContext();
  if (!user) return false;
  const userPermissions = user.permissions ?? [];
  return perms.some(p => userPermissions.includes(p));
}

export async function canAssignPermissions(targetPermissions: string[]): Promise<boolean> {
  const user = await requireAuthUserFromContext();
  if (!user) return false;
  const userPermissions = user.permissions ?? [];
  return targetPermissions.every(p => userPermissions.includes(p));
}
