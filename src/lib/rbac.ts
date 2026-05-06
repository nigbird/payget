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

export async function hasPermission(permission: PermissionName): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  
  const permissions = (session.user as any).permissions as string[] || [];
  
  // Super Admin bypass: users with DASHBOARD_VIEW are considered to have high-level access
  // but we should still check for specific permissions if they aren't explicit Super Admins.
  // For now, let's maintain the "isSuperAdmin" logic if needed.
  if (permissions.includes('DASHBOARD_VIEW')) {
    // If the permission being checked IS DASHBOARD_VIEW, return true
    if (permission === 'DASHBOARD_VIEW') return true;
    // For other permissions, we still want to check if they have it explicitly or if they are a super admin
  }

  return permissions.includes(permission);
}

export async function isSuperAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  const permissions = (session.user as any).permissions as string[] || [];
  // For simplicity, let's assume Super Admin has all permissions, 
  // and we'll identify them by a specific role or permission if needed.
  // For now, let's keep it simple.
  return permissions.includes('DASHBOARD_VIEW') && permissions.includes('CONFIGURATION_MANAGE');
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
