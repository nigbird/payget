import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { authenticateSoundDevice } from "@/lib/sound-devices"
import { parsePushSubscription, vapidPublicKey } from "@/lib/sound-device-push"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** A PushSubscription.toJSON() is a few hundred bytes. */
const MAX_BODY_BYTES = 4 * 1024

/**
 * Web Push registration for a sound device (see lib/sound-device-push).
 *
 *   GET    /api/devices/push-subscription  → { publicKey }  (null: push not configured)
 *   PUT    /api/devices/push-subscription  body: PushSubscription.toJSON()
 *   DELETE /api/devices/push-subscription
 *   Authorization: Bearer <device token>
 */
export async function GET(request: Request) {
  const device = await authenticateSoundDevice(request)
  if (!device) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ publicKey: vapidPublicKey() }, { headers: { "Cache-Control": "no-store" } })
}

export async function PUT(request: Request) {
  const device = await authenticateSoundDevice(request)
  if (!device) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Subscription too large" }, { status: 413 })
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const subscription = parsePushSubscription(body)
  if (!subscription) {
    return NextResponse.json({ error: "Unsupported push subscription" }, { status: 400 })
  }

  await prisma.soundDevice.update({
    where: { id: device.id },
    data: { pushSubscription: subscription },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const device = await authenticateSoundDevice(request)
  if (!device) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  await prisma.soundDevice.update({
    where: { id: device.id },
    data: { pushSubscription: Prisma.DbNull },
  })
  return NextResponse.json({ ok: true })
}
