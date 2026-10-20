"use client"

/**
 * Subscribes the /speaker page's browser to payment push notifications, so the
 * phone still alerts when the page is frozen (server side: lib/sound-device-push,
 * notification: public/sw.js).
 */

export type PushStatus =
  /** Subscribed: payments notify this device even while it sleeps. */
  | "enabled"
  /** The user blocked notifications for this site. */
  | "denied"
  /** Browser has no Web Push (e.g. iOS Safari outside a home-screen app). */
  | "unsupported"
  /** The server has no push keys configured. */
  | "unavailable"
  | "error"

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function sameKey(key: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (!key) return false
  const actual = new Uint8Array(key)
  return actual.length === expected.length && actual.every((byte, i) => byte === expected[i])
}

/**
 * Asks for notification permission (call from a tap) and registers this
 * browser's push subscription for the paired device. Safe to call on every
 * start: it re-sends the current subscription, which also repairs one the
 * server dropped or a browser that rotated it.
 */
export async function enablePaymentPush(deviceToken: string): Promise<PushStatus> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported"
  }

  // Ask first, before any await, so the browser still sees the tap.
  const permission =
    Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
  if (permission !== "granted") return permission === "denied" ? "denied" : "error"

  try {
    const auth = { Authorization: `Bearer ${deviceToken}` }
    const config = await fetch("/api/devices/push-subscription", { headers: auth, cache: "no-store" })
    if (!config.ok) return "error"
    const { publicKey } = (await config.json()) as { publicKey: string | null }
    if (!publicKey) return "unavailable"
    const serverKey = urlBase64ToUint8Array(publicKey)

    await navigator.serviceWorker.register("/sw.js")
    const registration = await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()
    // Made with an older server key (keys rotated): it can't receive our pushes.
    if (subscription && !sameKey(subscription.options.applicationServerKey, serverKey)) {
      await subscription.unsubscribe()
      subscription = null
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey })

    const saved = await fetch("/api/devices/push-subscription", {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    })
    return saved.ok ? "enabled" : "error"
  } catch (err) {
    console.warn("[speaker] Push subscription failed:", err)
    return "error"
  }
}

/** Stops payment notifications on this device ("Payment notifications" switched off). */
export async function disablePaymentPush(deviceToken: string): Promise<void> {
  try {
    await fetch("/api/devices/push-subscription", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${deviceToken}` },
    })
    const registration = await navigator.serviceWorker?.getRegistration("/")
    await (await registration?.pushManager.getSubscription())?.unsubscribe()
  } catch (err) {
    console.warn("[speaker] Turning off push failed:", err)
  }
}

/** Notification permission as the Setup card shows it. */
export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window) || !("PushManager" in window)) return "unsupported"
  return Notification.permission
}
