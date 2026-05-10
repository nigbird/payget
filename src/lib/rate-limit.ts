import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

function logRateLimitDbError(context: string, e: unknown) {
  console.error(`[rate-limit] ${context}`, e)
}

/** Failed logins from one IP across all identifiers before full IP block */
const IP_MAX_ATTEMPTS = 20
const IP_LOCKOUT_MS = 15 * 60 * 1000

/** Failed logins for one normalized identifier before short cooldown */
const IDENTIFIER_MAX_ATTEMPTS = 5
const IDENTIFIER_LOCKOUT_MS = 60 * 1000

function retryAfterSecondsFromUntil(until: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000))
}

export type ActiveLockout =
  | { locked: false }
  | { locked: true; until: Date; retryAfterSeconds: number }

export { normalizeLoginIdentifierForLockout } from "@/lib/login-identifier-normalize"

export async function checkIpLockout(ipAddress: string): Promise<ActiveLockout> {
  const lockout = await prisma.ipLockout.findUnique({
    where: { ipAddress },
  })

  if (!lockout?.lockoutUntil) {
    return { locked: false }
  }

  const now = new Date()
  if (lockout.lockoutUntil <= now) {
    await prisma.ipLockout.update({
      where: { ipAddress },
      data: { attempts: 0, lockoutUntil: null },
    })
    return { locked: false }
  }

  return {
    locked: true,
    until: lockout.lockoutUntil,
    retryAfterSeconds: retryAfterSecondsFromUntil(lockout.lockoutUntil),
  }
}

export async function checkLoginIdentifierLockout(normalizedKey: string): Promise<ActiveLockout> {
  if (!normalizedKey) return { locked: false }

  try {
    const row = await prisma.loginIdentifierLockout.findUnique({
      where: { normalizedKey },
    })

    if (!row?.lockoutUntil) {
      return { locked: false }
    }

    const now = new Date()
    if (row.lockoutUntil <= now) {
      await prisma.loginIdentifierLockout.update({
        where: { normalizedKey },
        data: { failedAttempts: 0, lockoutUntil: null },
      })
      return { locked: false }
    }

    return {
      locked: true,
      until: row.lockoutUntil,
      retryAfterSeconds: retryAfterSecondsFromUntil(row.lockoutUntil),
    }
  } catch (e) {
    logRateLimitDbError("checkLoginIdentifierLockout", e)
    return { locked: false }
  }
}

/**
 * Increments failed-attempt count for an IP under row lock.
 * Does not increment while an active IP lockout is in effect (caller should gate before auth).
 */
export async function recordIpFailure(ipAddress: string): Promise<void> {
  const now = new Date()

  try {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; attempts: number; lockoutUntil: Date | null }[]
    >(
      Prisma.sql`SELECT "id", "attempts", "lockoutUntil" FROM "IpLockout" WHERE "ipAddress" = ${ipAddress} FOR UPDATE`
    )

    if (rows.length === 0) {
      await tx.ipLockout.create({
        data: { ipAddress, attempts: 1, lockoutUntil: null },
      })
      return
    }

    const row = rows[0]
    if (row.lockoutUntil && row.lockoutUntil > now) {
      return
    }

    const nextAttempts =
      row.lockoutUntil && row.lockoutUntil <= now ? 1 : row.attempts + 1

    await tx.ipLockout.update({
      where: { ipAddress },
      data: {
        attempts: nextAttempts,
        lockoutUntil:
          nextAttempts >= IP_MAX_ATTEMPTS ? new Date(now.getTime() + IP_LOCKOUT_MS) : null,
      },
    })
  })
  } catch (e) {
    logRateLimitDbError("recordIpFailure", e)
  }
}

export async function resetIpLockout(ipAddress: string): Promise<void> {
  try {
    await prisma.ipLockout.upsert({
      where: { ipAddress },
      create: { ipAddress, attempts: 0, lockoutUntil: null },
      update: { attempts: 0, lockoutUntil: null },
    })
  } catch (e) {
    logRateLimitDbError("resetIpLockout", e)
  }
}

export async function recordLoginIdentifierFailure(normalizedKey: string): Promise<void> {
  if (!normalizedKey) return

  const now = new Date()

  try {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { normalizedKey: string; failedAttempts: number; lockoutUntil: Date | null }[]
    >(
      Prisma.sql`SELECT "normalizedKey", "failedAttempts", "lockoutUntil" FROM "LoginIdentifierLockout" WHERE "normalizedKey" = ${normalizedKey} FOR UPDATE`
    )

    if (rows.length === 0) {
      await tx.loginIdentifierLockout.create({
        data: { normalizedKey, failedAttempts: 1, lockoutUntil: null },
      })
      return
    }

    const row = rows[0]
    if (row.lockoutUntil && row.lockoutUntil > now) {
      return
    }

    const nextFailed =
      row.lockoutUntil && row.lockoutUntil <= now ? 1 : row.failedAttempts + 1

    await tx.loginIdentifierLockout.update({
      where: { normalizedKey },
      data: {
        failedAttempts: nextFailed,
        lockoutUntil:
          nextFailed >= IDENTIFIER_MAX_ATTEMPTS
            ? new Date(now.getTime() + IDENTIFIER_LOCKOUT_MS)
            : null,
      },
    })
  })
  } catch (e) {
    logRateLimitDbError("recordLoginIdentifierFailure", e)
  }
}

export async function resetLoginIdentifierLockout(normalizedKey: string): Promise<void> {
  if (!normalizedKey) return
  try {
    await prisma.loginIdentifierLockout.delete({ where: { normalizedKey } })
  } catch {
    /* row may not exist or table missing */
  }
}

/** Records one failed attempt for identifier and IP, then returns current lockout state. */
export async function recordFailedLoginAttempt(
  ipAddress: string,
  normalizedKey: string
): Promise<{ ip: ActiveLockout; identifier: ActiveLockout }> {
  await recordLoginIdentifierFailure(normalizedKey)
  await recordIpFailure(ipAddress)
  const ip = await checkIpLockout(ipAddress)
  const identifier = await checkLoginIdentifierLockout(normalizedKey)
  return { ip, identifier }
}

export async function resetUserLockout(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    })
  } catch (e) {
    logRateLimitDbError("resetUserLockout", e)
  }
}
