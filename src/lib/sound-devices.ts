import crypto from "crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getBearerTokenFromHeaders } from "@/lib/token-auth"

/** Device tokens carry a fixed prefix so one pasted into a log or ticket is
 * recognisable as a sound-device credential and can be revoked. */
const TOKEN_PREFIX = "sdv_"

/**
 * The device token is held in this httpOnly cookie, not in JS-readable
 * localStorage, so a cross-site-scripting flaw cannot read the credential (the
 * VA-008 concern). It is scoped to the device API path so it is never sent to
 * the merchant or admin portals, and marked SameSite=Strict/Secure. The DB
 * still stores only the hash; this cookie carries the raw opaque token the same
 * way a session id would. The long lifetime suits an unattended till device
 * that must survive restarts without re-pairing. Browsers cap persistent
 * cookies at ~400 days, so that is the ceiling here.
 */
export const SOUND_DEVICE_COOKIE = "sound_device_token"
const SOUND_DEVICE_COOKIE_PATH = "/api/devices"
const SOUND_DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60

function readSoundDeviceCookie(request: Request): string | null {
  const header = request.headers.get("cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === SOUND_DEVICE_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}

export function setSoundDeviceCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: SOUND_DEVICE_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: SOUND_DEVICE_COOKIE_PATH,
    maxAge: SOUND_DEVICE_COOKIE_MAX_AGE,
  })
}

export function clearSoundDeviceCookie(res: NextResponse): void {
  res.cookies.set({
    name: SOUND_DEVICE_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: SOUND_DEVICE_COOKIE_PATH,
    expires: new Date(0),
  })
}

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
 * Resolves the calling sound device. The token is read from the httpOnly
 * session cookie first, falling back to a Bearer header so a device paired by
 * an older client (token still in localStorage) keeps working until it
 * migrates to the cookie. Returns null for a missing, unknown or revoked
 * token, and for a merchant that is no longer active, so deactivating a
 * merchant silences its speakers too.
 */
export async function authenticateSoundDevice(request: Request): Promise<AuthenticatedSoundDevice | null> {
  const token = readSoundDeviceCookie(request) ?? getBearerTokenFromHeaders(request.headers)
  return authenticateSoundDeviceByToken(token)
}

/** Resolves a device straight from a raw token (used by the session endpoint,
 * where the token arrives in the request body to establish the cookie). */
export async function authenticateSoundDeviceByToken(
  token: string | null | undefined
): Promise<AuthenticatedSoundDevice | null> {
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
