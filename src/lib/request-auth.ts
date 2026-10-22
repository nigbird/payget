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
  assignedMerchants?: { id: string; name: string; role?: string }[]
  /** Actual MerchantTeamMember role (account_admin/sales_admin/payment_initiator) for OTP-based SALES sessions. */
  teamRole?: string | null
  teamMemberId?: string | null
  /** Staff member still on an admin-issued temporary password: no permissions until changed. */
  passwordChangeRequired?: boolean
}

export async function requireAuthUser(request: Request): Promise<ResolvedAuthUser | null> {
  const token =
    getBearerTokenFromHeaders(request.headers) ??
    (await getAccessTokenFromCookie(request))
  if (!token) return null
  return resolveAuthUserFromToken(token)
}

export async function requireAuthUserFromContext(): Promise<ResolvedAuthUser | null> {
  const token = await getAccessTokenFromServerCookies()
  if (!token) return null
  return resolveAuthUserFromToken(token)
}

/**
 * Verifies the access token and its server-side session, then resolves the
 * user from the database rather than trusting the token alone:
 * - a deactivated user is rejected immediately (not when the token expires);
 * - staff permissions and role come from the database, so a revoked
 *   permission stops working on the next request;
 * - a staff member who must still replace their temporary password gets no
 *   permissions and no merchant access until they do (the change-password
 *   flow itself only needs a session). Returning null instead would make the
 *   browser treat it as an expired session and sign them out.
 */
async function resolveAuthUserFromToken(token: string): Promise<ResolvedAuthUser | null> {
  try {
    const payload = await verifyAccessToken(token)
    const userId = typeof payload.sub === "string" ? payload.sub : null
    if (!userId) return null

    const sid = typeof (payload as any).sid === "string" ? (payload as any).sid as string : undefined
    const isSales = userId.startsWith("sales-")

    if (sid) {
      // SALES sessions are backed by an ActiveSession keyed by teamMemberId, so
      // this check applies to team members too.
      const valid = await validateSession(sid)
      if (!valid) return null
      touchSession(sid)
    }

    const base: ResolvedAuthUser = {
      id: userId,
      sid,
      email: null,
      name: null,
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
        ? ((payload as any).assignedMerchants as { id: string; name: string; role?: string }[])
        : [],
      teamRole: typeof (payload as any).teamRole === "string" ? (payload as any).teamRole : null,
      teamMemberId: typeof (payload as any).teamMemberId === "string" ? (payload as any).teamMemberId : null,
    }

    if (isSales) return base

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        role: true,
        status: true,
        firstLogin: true,
        merchantId: true,
        sessionVersion: true,
        customRole: { select: { permissions: { select: { permission: { select: { name: true } } } } } },
      },
    })
    if (!user) return null
    if (user.status !== "ACTIVE") return null
    // Backward compat: tokens without sid (pre-migration) — verify sessionVersion.
    if (!sid && payload.sessionVersion !== undefined && user.sessionVersion !== payload.sessionVersion) return null

    const isStaff = user.role !== "MERCHANT"
    const mustChangePassword = isStaff && user.firstLogin
    return {
      ...base,
      email: user.email,
      name: user.name,
      role: user.role,
      merchantId: user.merchantId,
      permissions: mustChangePassword
        ? []
        : isStaff
          ? (user.customRole?.permissions ?? []).map((p) => p.permission.name)
          : base.permissions,
      passwordChangeRequired: mustChangePassword,
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
  if (!user || user.passwordChangeRequired) return false
  if (["ADMIN", "MAKER", "CHECKER", "HEAD_OFFICE"].includes(user.role || "")) return true
  if (user.role === "MERCHANT") return user.merchantId === targetMerchantId
  if (user.role === "SALES") return user.assignedMerchantIds?.includes(targetMerchantId) ?? false
  return false
}

/**
 * Whether this session has Account Admin-level control over `merchantId`:
 * that merchant's own password login, or an OTP session whose person holds an
 * ACTIVE account_admin membership in *that* merchant.
 *
 * A team member's session spans every merchant their phone belongs to, but the
 * token's single `teamRole` only describes the membership they logged in with.
 * Checking it here would let an account admin of merchant A act as one in
 * merchant B where they are only a payment initiator, so the role is looked up
 * per merchant instead (which also makes role changes take effect immediately).
 */
export async function isMerchantAccountAdmin(user: ResolvedAuthUser | null, merchantId: string) {
  if (!user) return false
  if (user.role === "MERCHANT") return user.merchantId === merchantId
  if (user.role !== "SALES" || !user.teamMemberId) return false

  const self = await prisma.merchantTeamMember.findUnique({
    where: { id: user.teamMemberId },
    select: { phone: true },
  })
  if (!self) return false

  const membership = await prisma.merchantTeamMember.findFirst({
    where: {
      merchantId,
      role: "ACCOUNT_ADMIN",
      status: "ACTIVE",
      merchant: { status: "ACTIVE" },
      OR: [{ id: user.teamMemberId }, ...(self.phone ? [{ phone: self.phone }] : [])],
    },
    select: { id: true },
  })
  return !!membership
}
