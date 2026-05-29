import { auth } from "@/auth";

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
  const session = await auth();
  if (!session?.user) return false;
  const role = (session.user as any).role;
  return role === 'ADMIN';
}

export async function hasPermission(permission: PermissionName): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  
  if (await isSuperAdmin()) return true;
  
  const permissions = (session.user as any).permissions as string[] || [];
  return permissions.includes(permission);
}

export async function hasAllPermissions(perms: PermissionName[]): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  
  if (await isSuperAdmin()) return true;

  const userPermissions = (session.user as any).permissions as string[] || [];
  return perms.every(p => userPermissions.includes(p));
}

export async function hasAnyPermission(perms: PermissionName[]): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  
  if (await isSuperAdmin()) return true;

  const userPermissions = (session.user as any).permissions as string[] || [];
  return perms.some(p => userPermissions.includes(p));
}

/**
 * Validates that the current user can assign a set of permissions.
 * Prevents vertical privilege escalation: users can only assign permissions they themselves have.
 * Super Admin bypasses this check.
 */
export async function canAssignPermissions(targetPermissions: string[]): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  
  if (await isSuperAdmin()) return true;

  const userPermissions = (session.user as any).permissions as string[] || [];
  
  // Every target permission must be within the user's own permissions
  return targetPermissions.every(p => userPermissions.includes(p));
}
