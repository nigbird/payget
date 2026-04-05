import { auth } from "@/auth";

export type PermissionName = 
  | 'DASHBOARD_GLOBAL_VIEW'
  | 'DASHBOARD_USER_VIEW'
  | 'MERCHANT_REGISTER'
  | 'MERCHANT_APPROVE'
  | 'USER_CREATE'
  | 'ROLE_CREATE'
  | 'ROLE_EDIT'
  | 'ROLE_DELETE'
  | 'TRANSACTION_LIMIT_SET'
  | 'TRANSACTION_LIMIT_OVERRIDE';

export async function hasPermission(permission: PermissionName): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  
  const permissions = (session.user as any).permissions as string[] || [];
  
  // Super Admin bypass: users with DASHBOARD_GLOBAL_VIEW are considered Super Admins
  if (permissions.includes('DASHBOARD_GLOBAL_VIEW')) {
    return true;
  }

  return permissions.includes(permission);
}

export async function isSuperAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  const permissions = (session.user as any).permissions as string[] || [];
  return permissions.includes('DASHBOARD_GLOBAL_VIEW');
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
