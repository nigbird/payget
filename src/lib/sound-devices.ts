import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { getBearerTokenFromHeaders } from "@/lib/token-auth"

/** Device tokens carry a fixed prefix so one pasted into a log or ticket is
 * recognisable as a sound-device credential and can be revoked. */
const TOKEN_PREFIX = "sdv_"

/** Throttle for lastSeenAt writes — a device reconnecting in a loop shouldn't
 * turn into a write per attempt. */
const LAST_SEEN_THROTTLE_MS = 60 * 1000

export const SOUND_DEVICE_NAME_MAX_LENGTH = 60

export function hashSoundDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function generateSoundDeviceToken(): { token: string; tokenHash: string } {
  const token = TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url")
  return { token, tokenHash: hashSoundDeviceToken(token) }
}

export type AuthenticatedSoundDevice = {
  id: string
  merchantId: string
  name: string
  merchantName: string
}

/**
 * Resolves the calling sound device from its Bearer token. Returns null for a
 * missing, unknown or revoked token, and for a merchant that is no longer
 * active, so deactivating a merchant silences its speakers too.
 */
export async function authenticateSoundDevice(request: Request): Promise<AuthenticatedSoundDevice | null> {
  const token = getBearerTokenFromHeaders(request.headers)
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null

  const device = await prisma.soundDevice.findUnique({
    where: { tokenHash: hashSoundDeviceToken(token) },
    include: { merchant: { select: { name: true, status: true } } },
  })
  if (!device || device.revokedAt) return null
  if (device.merchant.status !== "ACTIVE" && device.merchant.status !== "APPROVED") return null

  if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    prisma.soundDevice
      .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
      .catch((err) => console.error("[SOUND-DEVICE] Failed to update lastSeenAt:", err))
  }

  return {
    id: device.id,
    merchantId: device.merchantId,
    name: device.name,
    merchantName: device.merchant.name,
  }
}

/** Revocation check for an already-open stream, so revoking a device cuts it
 * off within one heartbeat rather than whenever it next reconnects. */
export async function isSoundDeviceStillActive(deviceId: string): Promise<boolean> {
  const device = await prisma.soundDevice.findUnique({
    where: { id: deviceId },
    select: { revokedAt: true },
  })
  return !!device && !device.revokedAt
}
