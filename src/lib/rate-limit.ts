import { prisma } from "@/lib/prisma"

const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export async function checkIpLockout(ipAddress: string): Promise<{ locked: boolean; until?: Date; remainingMinutes?: number }> {
  console.log(`[RateLimit] Checking IP lockout for: ${ipAddress}`)
  const lockout = await prisma.ipLockout.findUnique({
    where: { ipAddress },
  })

  if (lockout && lockout.lockoutUntil && lockout.lockoutUntil > new Date()) {
    const remainingMs = lockout.lockoutUntil.getTime() - Date.now()
    const remainingMinutes = Math.ceil(remainingMs / (60 * 1000))
    console.log(`[RateLimit] IP ${ipAddress} is locked until ${lockout.lockoutUntil} (${remainingMinutes} mins left)`)
    return { locked: true, until: lockout.lockoutUntil, remainingMinutes }
  }

  return { locked: false }
}

export async function recordIpFailure(ipAddress: string) {
  console.log(`[RateLimit] Recording IP failure for: ${ipAddress}`)
  const now = new Date()
  
  const lockout = await prisma.ipLockout.findUnique({
    where: { ipAddress },
  })

  if (!lockout) {
    await prisma.ipLockout.create({
      data: {
        ipAddress,
        attempts: 1,
      },
    })
    return
  }

  // If previous lockout expired, reset attempts to 1
  let newAttempts = lockout.attempts + 1
  if (lockout.lockoutUntil && lockout.lockoutUntil < now) {
    newAttempts = 1
  }

  const updateData: any = { attempts: newAttempts }

  if (newAttempts >= MAX_ATTEMPTS) {
    updateData.lockoutUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS)
    console.log(`[RateLimit] IP ${ipAddress} reached max attempts. Locking until ${updateData.lockoutUntil}`)
  }

  await prisma.ipLockout.update({
    where: { ipAddress },
    data: updateData,
  })
}

export async function resetIpLockout(ipAddress: string) {
  console.log(`[RateLimit] Resetting IP lockout for: ${ipAddress}`)
  await prisma.ipLockout.upsert({
    where: { ipAddress },
    create: { ipAddress, attempts: 0, lockoutUntil: null },
    update: { attempts: 0, lockoutUntil: null },
  })
}

export async function checkUserLockout(userId: string): Promise<{ locked: boolean; until?: Date; remainingMinutes?: number }> {
  console.log(`[RateLimit] Checking user lockout for: ${userId}`)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lockoutUntil: true, failedLoginAttempts: true },
  })

  if (user && user.lockoutUntil && user.lockoutUntil > new Date()) {
    const remainingMs = user.lockoutUntil.getTime() - Date.now()
    const remainingMinutes = Math.ceil(remainingMs / (60 * 1000))
    console.log(`[RateLimit] User ${userId} is locked until ${user.lockoutUntil} (${remainingMinutes} mins left)`)
    return { locked: true, until: user.lockoutUntil, remainingMinutes }
  }

  return { locked: false }
}

export async function recordUserFailure(userId: string) {
  console.log(`[RateLimit] Recording user failure for: ${userId}`)
  const now = new Date()
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginAttempts: true, lockoutUntil: true },
  })

  if (!user) return

  // If previous lockout expired, reset attempts to 1
  let newAttempts = user.failedLoginAttempts + 1
  if (user.lockoutUntil && user.lockoutUntil < now) {
    newAttempts = 1
  }

  const updateData: any = { failedLoginAttempts: newAttempts }

  if (newAttempts >= MAX_ATTEMPTS) {
    updateData.lockoutUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS)
    console.log(`[RateLimit] User ${userId} reached max attempts. Locking until ${updateData.lockoutUntil}`)
  }

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  })
}

export async function resetUserLockout(userId: string) {
  console.log(`[RateLimit] Resetting user lockout for: ${userId}`)
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
  })
}

