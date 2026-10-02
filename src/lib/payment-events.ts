import { EventEmitter } from "events"

/**
 * In-process fan-out of "payment received" events to a merchant's connected
 * sound devices (see /api/devices/payment-stream).
 *
 * This lives in memory, which is only correct while the app runs as a single
 * instance (apphosting.yaml pins maxInstances: 1). If that ever changes, the
 * instance that records a payment may not be the one holding the device's
 * stream — swap publish/subscribe here for Postgres LISTEN/NOTIFY or Redis
 * pub/sub; nothing outside this file needs to change.
 */

export type PaymentEvent = {
  /** Monotonic per-process id, used as the SSE event id for replay. */
  id: number
  type: "payment" | "test"
  merchantId: string
  transactionId: string | null
  amount: number
  currency: string
  payerName: string | null
  channel: string | null
  reference: string | null
  occurredAt: string
}

/** Replay window for devices that reconnect after a dropped stream. Anything
 * older is not announced — a payment voiced minutes late confuses the cashier
 * more than it helps; it is still on the Transactions page. */
const REPLAY_MAX_AGE_MS = 2 * 60 * 1000
const REPLAY_MAX_EVENTS = 50

type Hub = {
  emitter: EventEmitter
  nextId: number
  recent: Map<string, PaymentEvent[]>
}

const globalForHub = globalThis as unknown as { paymentEventHub?: Hub }

// globalThis rather than a module-level singleton: Next bundles route handlers
// separately, so the inbound route and the stream route would otherwise each
// get their own emitter and never see each other.
function hub(): Hub {
  if (!globalForHub.paymentEventHub) {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(0)
    globalForHub.paymentEventHub = { emitter, nextId: Date.now(), recent: new Map() }
  }
  return globalForHub.paymentEventHub
}

export function publishPaymentEvent(event: Omit<PaymentEvent, "id">): PaymentEvent {
  const h = hub()
  const full: PaymentEvent = { ...event, id: ++h.nextId }

  const cutoff = Date.now() - REPLAY_MAX_AGE_MS
  const recent = (h.recent.get(event.merchantId) ?? []).filter(
    (e) => Date.parse(e.occurredAt) >= cutoff
  )
  recent.push(full)
  h.recent.set(event.merchantId, recent.slice(-REPLAY_MAX_EVENTS))

  h.emitter.emit(event.merchantId, full)
  return full
}

export function subscribePaymentEvents(
  merchantId: string,
  listener: (event: PaymentEvent) => void
): () => void {
  const h = hub()
  h.emitter.on(merchantId, listener)
  return () => {
    h.emitter.off(merchantId, listener)
  }
}

/** Id of the latest event published so far. Sent to a device when it connects,
 * so that even a device that has not received any payment yet can ask for
 * what it missed after its connection drops. */
export function currentPaymentEventId(): number {
  return hub().nextId
}

/** Events newer than lastEventId still inside the replay window. */
export function getMissedPaymentEvents(merchantId: string, lastEventId: number): PaymentEvent[] {
  const cutoff = Date.now() - REPLAY_MAX_AGE_MS
  return (hub().recent.get(merchantId) ?? []).filter(
    (e) => e.id > lastEventId && Date.parse(e.occurredAt) >= cutoff
  )
}
