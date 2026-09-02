import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days — matches refresh token TTL

/**
 * Who a session belongs to. Merchant owners / staff are User rows; merchant team
 * members log in by OTP and live in MerchantTeamMember, so ActiveSession and
 * RefreshToken carry one of the two foreign keys, never both.
 */
export type SessionPrincipal =
  | { kind: "user"; id: string }
  | { kind: "teamMember"; id: string }

export function userPrincipal(userId: string): SessionPrincipal {
  return { kind: "user", id: userId }
}

export function teamMemberPrincipal(teamMemberId: string): SessionPrincipal {
  return { kind: "teamMember", id: teamMemberId }
}

/** Prisma where-clause / create-data fragment selecting the owning column. */
export function principalWhere(principal: SessionPrincipal) {
  return principal.kind === "user"
    ? { userId: principal.id }
    : { teamMemberId: principal.id }
}

function getMaxConcurrentSessions(): number {
  const raw = process.env.MAX_CONCURRENT_SESSIONS || "1"
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return isNaN(n) || n < 0 ? 0 : n
}

/**
 * Team members routinely work the same account from a till and a phone, so the
 * single-device limit that applies to User logins would be hostile here.
 * 0 disables the limit.
 */
function getMaxConcurrentTeamMemberSessions(): number {
  const raw = process.env.MAX_CONCURRENT_TEAM_MEMBER_SESSIONS || "0"
  const n = parseInt(raw, 10)
  return isNaN(n) || n < 0 ? 0 : n
}

/**
 * Within a Prisma interactive transaction, revoke the oldest sessions that exceed
 * the concurrency limit, accounting for the new session about to be created.
 * Returns the IDs of revoked sessions.
 */
export async function enforceSessionLimitTx(
  tx: Prisma.TransactionClient,
  principal: SessionPrincipal
): Promise<string[]> {
  const max =
    principal.kind === "user"
      ? getMaxConcurrentSessions()
      : getMaxConcurrentTeamMemberSessions()
  if (max <= 0) return []

  const now = new Date()
  const sessions = await tx.activeSession.findMany({
    where: { ...principalWhere(principal), revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  })

  // We're creating one new session, so we need to evict any beyond (max - 1) existing ones.
  const excess = sessions.length - (max - 1)
  if (excess <= 0) return []

  const idsToRevoke = sessions.slice(0, excess).map((s) => s.id)

  await tx.activeSession.updateMany({
    where: { id: { in: idsToRevoke } },
    data: { revokedAt: now }
  })
  await tx.refreshToken.updateMany({
    where: { sessionId: { in: idsToRevoke }, revokedAt: null },
    data: { revokedAt: now }
  })

  return idsToRevoke
}

/**
 * Create a new ActiveSession inside an existing transaction.
 * Returns the new session id (used as sid in JWT tokens).
 */
export async function createActiveSessionTx(
  tx: Prisma.TransactionClient,
  params: {
    principal: SessionPrincipal
    expiresAt: Date
    userAgent?: string | null
    ipAddress?: string | null
  }
): Promise<string> {
  const session = await tx.activeSession.create({
    data: {
      ...principalWhere(params.principal),
      expiresAt: params.expiresAt,
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null
    }
  })
  return session.id
}

/**
 * Revoke all active sessions and their refresh tokens for a principal.
 * Used on password change, team member deactivation, and administrative force-logout.
 */
export async function revokeAllSessionsFor(principal: SessionPrincipal): Promise<void> {
  const now = new Date()
  const where = principalWhere(principal)
  await prisma.$transaction([
    prisma.activeSession.updateMany({
      where: { ...where, revokedAt: null },
      data: { revokedAt: now }
    }),
    prisma.refreshToken.updateMany({
      where: { ...where, revokedAt: null },
      data: { revokedAt: now }
    })
  ])
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  return revokeAllSessionsFor(userPrincipal(userId))
}

export async function revokeAllTeamMemberSessions(teamMemberId: string): Promise<void> {
  return revokeAllSessionsFor(teamMemberPrincipal(teamMemberId))
}

/**
 * Revoke a specific session and all its associated refresh tokens.
 * Used on logout or targeted administrative revocation.
 */
export async function revokeSession(sid: string): Promise<void> {
  const now = new Date()
  await prisma.$transaction([
    prisma.activeSession.updateMany({
      where: { id: sid, revokedAt: null },
      data: { revokedAt: now }
    }),
    prisma.refreshToken.updateMany({
      where: { sessionId: sid, revokedAt: null },
      data: { revokedAt: now }
    })
  ])
}

/**
 * Check whether a session is currently valid (exists, not revoked, not expired).
 */
export async function validateSession(sid: string): Promise<boolean> {
  if (!sid) return false
  const session = await prisma.activeSession.findUnique({
    where: { id: sid },
    select: { revokedAt: true, expiresAt: true }
  })
  if (!session) return false
  if (session.revokedAt !== null) return false
  if (session.expiresAt <= new Date()) return false
  return true
}

/**
 * Update lastActivityAt on a session. Fire-and-forget; never throws.
 */
export function touchSession(sid: string): void {
  prisma.activeSession
    .updateMany({
      where: { id: sid, revokedAt: null },
      data: { lastActivityAt: new Date() }
    })
    .catch(() => {})
}

/**
 * Delete sessions that have expired or were revoked more than 30 days ago.
 * Safe to call on each login for passive cleanup.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const now = new Date()
  const staleRevokeCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.activeSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now }, revokedAt: null },
        { revokedAt: { lt: staleRevokeCutoff } }
      ]
    }
  })
  return result.count
}
