import { auth } from "@/auth"
import { getBearerTokenFromHeaders, verifyAccessToken } from "@/lib/token-auth"
import { prisma } from "@/lib/prisma"

export type ResolvedAuthUser = {
  id: string
  email?: string | null
  name?: string | null
  role?: string | null
  merchantId?: string | null
  permissions?: string[]
  isHeadOffice?: boolean
  district?: string | null
  branch?: string | null
  assignedMerchantIds?: string[]
  assignedMerchants?: { id: string; name: string }[]
}

async function resolveFromAccessToken(request: Request): Promise<ResolvedAuthUser | null> {
  const bearer = getBearerTokenFromHeaders(request.headers)
  if (!bearer) return null

  try {
    const payload = await verifyAccessToken(bearer)
    const userId = typeof payload.sub === "string" ? payload.sub : null
    if (!userId) return null

    // Keep this lightweight; only fetch email/name if needed for downstream logs/UI.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true }
    })
    if (!user) return null

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: typeof payload.role === "string" ? payload.role : null,
      merchantId: typeof payload.merchantId === "string" ? payload.merchantId : null,
      permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [],
      isHeadOffice: typeof payload.isHeadOffice === "boolean" ? payload.isHeadOffice : false,
      district: typeof payload.district === "string" ? payload.district : null,
      branch: typeof payload.branch === "string" ? payload.branch : null,
      assignedMerchantIds: Array.isArray((payload as any).assignedMerchantIds)
        ? ((payload as any).assignedMerchantIds as string[])
        : []
    }
  } catch {
    return null
  }
}

async function resolveFromNextAuth(): Promise<ResolvedAuthUser | null> {
  const session = await auth()
  if (!session?.user) return null

  const u: any = session.user
  return {
    id: String(u.id),
    email: u.email ?? null,
    name: u.name ?? null,
    role: u.role ?? null,
    merchantId: u.merchantId ?? null,
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
    isHeadOffice: !!u.isHeadOffice,
    district: u.district ?? null,
    branch: u.branch ?? null,
    assignedMerchantIds: Array.isArray(u.assignedMerchantIds) ? u.assignedMerchantIds : [],
    assignedMerchants: Array.isArray(u.assignedMerchants) ? u.assignedMerchants : []
  }
}

export async function requireAuthUser(request: Request): Promise<ResolvedAuthUser | null> {
  return (await resolveFromAccessToken(request)) ?? (await resolveFromNextAuth())
}

export function userHasPermission(user: ResolvedAuthUser | null, permission: string) {
  if (!user) return false
  const perms = user.permissions ?? []
  // Maintain the Super Admin bypass logic for now, using DASHBOARD_VIEW as the indicator
  if (perms.includes("DASHBOARD_VIEW") && perms.includes("CONFIGURATION_MANAGE")) return true
  return perms.includes(permission)
}

export function userHasAnyPermission(user: ResolvedAuthUser | null, permissions: string[]) {
  if (!user) return false
  const perms = user.permissions ?? []
  if (perms.includes("DASHBOARD_VIEW") && perms.includes("CONFIGURATION_MANAGE")) return true
  return permissions.some((p) => perms.includes(p))
}

export function userCanAssignPermissions(user: ResolvedAuthUser | null, targetPermissions: string[]) {
  if (!user) return false
  const perms = user.permissions ?? []
  if (perms.includes("DASHBOARD_VIEW") && perms.includes("CONFIGURATION_MANAGE")) return true
  return targetPermissions.every((p) => perms.includes(p))
}

export function canAccessMerchant(user: ResolvedAuthUser | null, targetMerchantId: string) {
  if (!user) return false
  if (["ADMIN", "MAKER", "CHECKER", "HEAD_OFFICE"].includes(user.role || "")) {
    return true
  }
  if (user.role === "MERCHANT") {
    return user.merchantId === targetMerchantId
  }
  if (user.role === "SALES") {
    return user.assignedMerchantIds?.includes(targetMerchantId) ?? false
  }
  return false
}

