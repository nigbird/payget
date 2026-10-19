import webpush, { WebPushError } from "web-push"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { PaymentEvent } from "@/lib/payment-events"

/**
 * Web Push for sound devices. A browser paired as a sound device (the /speaker
 * page) subscribes to push; every payment event is then also pushed to it, and
 * its service worker (public/sw.js) shows a notification even when the phone is
 * asleep and the page itself is frozen. That notification plays the device's
 * notification sound only: speaking the amount still needs the page awake.
 *
 * Configured by VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
 * (generate a pair with `npx web-push generate-vapid-keys`). Without them push
 * is off and speakers work exactly as before.
 */

/** Matches the replay window in payment-events: a payment announced minutes
 * late confuses the cashier, so the push service drops it after this. */
const PUSH_TTL_SECONDS = 120

/**
 * The server POSTs to whatever endpoint a subscription names, so only the
 * browsers' own push services are accepted; otherwise a device token would let
 * its holder make the server call any host (SSRF).
 */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge on Android, Samsung Internet, Opera
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^([a-z0-9-]+\.)*push\.apple\.com$/, // Safari, iOS home-screen apps
  /^([a-z0-9-]+\.)*notify\.windows\.com$/, // Edge on Windows
]

const MAX_ENDPOINT_LENGTH = 1024
const MAX_KEY_LENGTH = 256

export type StoredPushSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Validates a PushSubscription.toJSON() body; null if it isn't one we can use. */
export function parsePushSubscription(body: unknown): StoredPushSubscription | null {
  if (!body || typeof body !== "object") return null
  const { endpoint, keys } = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) return null
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null
  if (!keys.p256dh || !keys.auth || keys.p256dh.length > MAX_KEY_LENGTH || keys.auth.length > MAX_KEY_LENGTH) {
    return null
  }

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return null
  if (!PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname))) return null

  return { endpoint: url.toString(), keys: { p256dh: keys.p256dh, auth: keys.auth } }
}

let configured: boolean | undefined

function configure(): boolean {
  if (configured !== undefined) return configured
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  configured = false
  if (publicKey && privateKey && subject) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey)
      configured = true
    } catch (err) {
      console.error("[SOUND-DEVICE-PUSH] Invalid VAPID configuration, push disabled:", err)
    }
  }
  return configured
}

/** The key browsers subscribe with, or null when push isn't configured. */
export function vapidPublicKey(): string | null {
  return configure() ? process.env.VAPID_PUBLIC_KEY! : null
}

/**
 * Pushes a payment event to the merchant's subscribed sound devices. Never
 * throws: a push failure must not affect recording the payment.
 */
export async function pushPaymentEvent(event: PaymentEvent): Promise<void> {
  if (!configure()) return
  try {
    const devices = await prisma.soundDevice.findMany({
      where: {
        merchantId: event.merchantId,
        revokedAt: null,
        pushSubscription: { not: Prisma.DbNull },
        merchant: { status: { in: ["ACTIVE", "APPROVED"] } },
      },
      select: { id: true, pushSubscription: true },
    })
    if (devices.length === 0) return

    // Only what the notification shows. Web Push payloads are end-to-end
    // encrypted for the subscribed browser; the push service can't read them.
    const payload = JSON.stringify({
      id: event.id,
      type: event.type,
      amount: event.amount,
      currency: event.currency,
      payerName: event.payerName,
      channel: event.channel,
      occurredAt: event.occurredAt,
    })

    await Promise.all(
      devices.map(async (device) => {
        const subscription = parsePushSubscription(device.pushSubscription)
        if (!subscription) return
        try {
          await webpush.sendNotification(subscription, payload, { TTL: PUSH_TTL_SECONDS, urgency: "high" })
        } catch (err) {
          const status = err instanceof WebPushError ? err.statusCode : undefined
          if (status === 404 || status === 410) {
            // Subscription expired or the user turned notifications off: forget it
            // (unless the browser already re-subscribed with a new endpoint).
            await prisma.soundDevice.updateMany({
              where: { id: device.id, pushSubscription: { path: ["endpoint"], equals: subscription.endpoint } },
              data: { pushSubscription: Prisma.DbNull },
            })
          } else {
            // The endpoint is a bearer capability for the subscription; don't log it.
            console.error(`[SOUND-DEVICE-PUSH] Push to device ${device.id} failed (status ${status ?? "n/a"})`)
          }
        }
      })
    )
  } catch (err) {
    console.error("[SOUND-DEVICE-PUSH] Failed to push payment event:", err)
  }
}
