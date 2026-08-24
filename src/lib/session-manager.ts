import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days — matches refresh token TTL

function getMaxConcurrentSessions(): number {
  const raw = process.env.MAX_CONCURRENT_SESSIONS || "1"
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return isNaN(n) || n < 0 ? 0 : n
}

/**
 * Within a Prisma interactive transaction, revoke the oldest sessions that exceed
 * MAX_CONCURRENT_SESSIONS, accounting for the new session about to be created.
 * Returns the IDs of revoked sessions.
 */
export async function enforceSessionLimitTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<string[]> {
  const max = getMaxConcurrentSessions()
  if (max <= 0) return []

  const now = new Date()
  const sessions = await tx.activeSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
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
    userId: string
    expiresAt: Date
    userAgent?: string | null
    ipAddress?: string | null
  }
): Promise<string> {
  const session = await tx.activeSession.create({
    data: {
      userId: params.userId,
      expiresAt: params.expiresAt,
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null
    }
  })
  return session.id
}

/**
 * Revoke all active sessions and their refresh tokens for a user.
 * Used on password change and administrative force-logout.
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const now = new Date()
  await prisma.$transaction([
    prisma.activeSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now }
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now }
    })
  ])
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
