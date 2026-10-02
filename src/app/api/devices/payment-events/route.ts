import { NextResponse } from "next/server"
import { authenticateSoundDevice } from "@/lib/sound-devices"
import { currentPaymentEventId, getMissedPaymentEvents } from "@/lib/payment-events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Polling fallback for sound devices whose network can't carry the live
 * stream (/api/devices/payment-stream). Some reverse proxies and WAFs hold a
 * response until it ends; a stream never ends, so nothing reaches the device.
 * Each poll here returns immediately, so it gets through.
 *
 *   GET /api/devices/payment-events?after=<cursor>
 *   Authorization: Bearer <device token>
 *
 * Returns the device info, the events newer than `after` (within the 2-minute
 * replay window) and a new cursor to pass on the next poll. Omit `after` on the
 * first poll to just obtain a cursor. A revoked device gets 401.
 */
export async function GET(request: Request) {
  const device = await authenticateSoundDevice(request)
  if (!device) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const after = Number(new URL(request.url).searchParams.get("after"))
  const cursor = currentPaymentEventId()
  const events = Number.isFinite(after) && after > 0 ? getMissedPaymentEvents(device.merchantId, after) : []

  return NextResponse.json(
    { deviceName: device.name, merchantName: device.merchantName, cursor, events },
    { headers: { "Cache-Control": "no-store, no-transform" } }
  )
}
