import { NextResponse } from "next/server"
import {
  authenticateSoundDevice,
  authenticateSoundDeviceByToken,
  setSoundDeviceCookie,
  clearSoundDeviceCookie,
} from "@/lib/sound-devices"

export const runtime = "nodejs"

/**
 * Establishes (or inspects) the speaker's device session.
 *
 * The pairing link carries the raw device token in its URL fragment. The
 * speaker page posts it here once; on success the token is stored in an
 * httpOnly cookie (see lib/sound-devices) and never kept in JS-readable
 * storage, so a cross-site-scripting flaw cannot read the credential. Every
 * other /api/devices call then authenticates from that cookie.
 *
 * No CSRF token is required: the request authenticates with the opaque device
 * token itself, which an attacker cannot know, and the endpoint only ever
 * pairs the caller's own browser with a device the token already identifies.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const token = typeof body?.token === "string" ? body.token : null
  const checkOnly = body?.mode === "check"

  const device = await authenticateSoundDeviceByToken(token)
  if (!device) {
    return NextResponse.json({ error: "Invalid or revoked device token" }, { status: 401 })
  }

  // deviceId is not a secret: it is returned only to a caller that already
  // holds the token, and lets the page tell "same device re-paired" from
  // "a different pairing link" without reading the httpOnly cookie in JS.
  const res = NextResponse.json({
    deviceId: device.id,
    deviceName: device.name,
    merchantName: device.merchantName,
  })
  if (!checkOnly) setSoundDeviceCookie(res, token!)
  return res
}

/** Current device session from the cookie, for the page to know it is paired. */
export async function GET(request: Request) {
  const device = await authenticateSoundDevice(request)
  if (!device) {
    return NextResponse.json({ error: "No active device session" }, { status: 401 })
  }
  return NextResponse.json({
    deviceId: device.id,
    deviceName: device.name,
    merchantName: device.merchantName,
  })
}

/** Ends the device session on this browser (unpair / forget). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  clearSoundDeviceCookie(res)
  return res
}
