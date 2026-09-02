import { getAccessTokenFromCookie, getAccessTokenFromServerCookies } from "@/lib/access-token-cookie"
import { getBearerTokenFromHeaders, verifyAccessToken } from "@/lib/token-auth"
import { validateSession, touchSession } from "@/lib/session-manager"
import { prisma } from "@/lib/prisma"

export type ResolvedAuthUser = {
  id: string
  sid?: string
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
  /** Actual MerchantTeamMember role (account_admin/sales_admin/payment_initiator) for OTP-based SALES sessions. */
  teamRole?: string | null
  teamMemberId?: string | null
}

export async function requireAuthUser(request: Request): Promise<ResolvedAuthUser | null> {
  const token =
    getBearerTokenFromHeaders(request.headers) ??
    (await getAccessTokenFromCookie(request))
  if (!token) return null

  try {
    const payload = await verifyAccessToken(token)
    const userId = typeof payload.sub === "string" ? payload.sub : null
    if (!userId) return null

    const sid = typeof (payload as any).sid === "string" ? (payload as any).sid as string : undefined
    const isSales = userId.startsWith("sales-")

    if (sid) {
      // SALES sessions are backed by an ActiveSession keyed by teamMemberId, so
      // this check now applies to team members too.
      const valid = await validateSession(sid)
      if (!valid) return null
      touchSession(sid)
    } else if (!isSales) {
      // Backward compat: tokens without sid (pre-migration) — verify sessionVersion.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { sessionVersion: true }
      })
      if (!user) return null
      if (payload.sessionVersion !== undefined && user.sessionVersion !== payload.sessionVersion) {
        return null
      }
    }

    let email: string | null = null
    let name: string | null = null
    if (!isSales) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true }
      })
      if (!user) return null
      email = user.email
      name = user.name
    }

    return {
      id: userId,
      sid,
      email,
      name,
      role: typeof payload.role === "string" ? payload.role : null,
      merchantId: typeof payload.merchantId === "string" ? payload.merchantId : null,
      permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [],
      isHeadOffice: typeof payload.isHeadOffice === "boolean" ? payload.isHeadOffice : false,
      district: typeof payload.district === "string" ? payload.district : null,
      branch: typeof payload.branch === "string" ? payload.branch : null,
      assignedMerchantIds: Array.isArray((payload as any).assignedMerchantIds)
        ? ((payload as any).assignedMerchantIds as string[])
        : [],
      assignedMerchants: Array.isArray((payload as any).assignedMerchants)
        ? ((payload as any).assignedMerchants as { id: string; name: string }[])
        : [],
      teamRole: typeof (payload as any).teamRole === "string" ? (payload as any).teamRole : null,
      teamMemberId: typeof (payload as any).teamMemberId === "string" ? (payload as any).teamMemberId : null
    }
  } catch {
    return null
  }
}

export async function requireAuthUserFromContext(): Promise<ResolvedAuthUser | null> {
  const token = await getAccessTokenFromServerCookies()
  if (!token) return null

  try {
    const payload = await verifyAccessToken(token)
    const userId = typeof payload.sub === "string" ? payload.sub : null
    if (!userId) return null

    const sid = typeof (payload as any).sid === "string" ? (payload as any).sid as string : undefined
    const isSales = userId.startsWith("sales-")

    if (sid) {
      const valid = await validateSession(sid)
      if (!valid) return null
      touchSession(sid)
    } else if (!isSales) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } })
      if (!user) return null
      if (payload.sessionVersion !== undefined && user.sessionVersion !== payload.sessionVersion) return null
    }

    let email: string | null = null
    let name: string | null = null
    if (!isSales) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } })
      if (!user) return null
      email = user.email
      name = user.name
    }

    return {
      id: userId, sid, email, name,
      role: typeof payload.role === "string" ? payload.role : null,
      merchantId: typeof payload.merchantId === "string" ? payload.merchantId : null,
      permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [],
      isHeadOffice: typeof payload.isHeadOffice === "boolean" ? payload.isHeadOffice : false,
      district: typeof payload.district === "string" ? payload.district : null,
      branch: typeof payload.branch === "string" ? payload.branch : null,
      assignedMerchantIds: Array.isArray((payload as any).assignedMerchantIds) ? ((payload as any).assignedMerchantIds as string[]) : [],
      assignedMerchants: Array.isArray((payload as any).assignedMerchants) ? ((payload as any).assignedMerchants as { id: string; name: string }[]) : [],
      teamRole: typeof (payload as any).teamRole === "string" ? (payload as any).teamRole : null,
      teamMemberId: typeof (payload as any).teamMemberId === "string" ? (payload as any).teamMemberId : null
    }
  } catch {
    return null
  }
}

export function userHasPermission(user: ResolvedAuthUser | null, permission: string) {
  if (!user) return false
  return (user.permissions ?? []).includes(permission)
}

export function userHasAnyPermission(user: ResolvedAuthUser | null, permissions: string[]) {
  if (!user) return false
  const perms = user.permissions ?? []
  return permissions.some((p) => perms.includes(p))
}

export function userCanAssignPermissions(user: ResolvedAuthUser | null, targetPermissions: string[]) {
  if (!user) return false
  const perms = user.permissions ?? []
  return targetPermissions.every((p) => perms.includes(p))
}

export function canAccessMerchant(user: ResolvedAuthUser | null, targetMerchantId: string) {
  if (!user) return false
  if (["ADMIN", "MAKER", "CHECKER", "HEAD_OFFICE"].includes(user.role || "")) return true
  if (user.role === "MERCHANT") return user.merchantId === targetMerchantId
  if (user.role === "SALES") return user.assignedMerchantIds?.includes(targetMerchantId) ?? false
  return false
}

/**
 * Whether this session has Account Admin-level control over its merchant:
 * the merchant's own password login, or an OTP session for a team member
 * whose MerchantTeamMember.role is account_admin.
 */
export function isMerchantAccountAdmin(user: ResolvedAuthUser | null) {
  if (!user) return false
  if (user.role === "MERCHANT") return true
  if (user.role === "SALES") return user.teamRole === "account_admin"
  return false
}
