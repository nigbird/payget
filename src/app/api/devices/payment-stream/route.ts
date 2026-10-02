import { NextResponse } from "next/server"
import { authenticateSoundDevice, isSoundDeviceStillActive } from "@/lib/sound-devices"
import {
  currentPaymentEventId,
  getMissedPaymentEvents,
  subscribePaymentEvents,
  type PaymentEvent,
} from "@/lib/payment-events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Keeps proxies from closing an idle stream, and doubles as the revocation check interval. */
const HEARTBEAT_MS = 20 * 1000

/**
 * Server-Sent Events stream of a merchant's incoming payments, for sound
 * devices (the /speaker page, or a hardware soundbox).
 *
 *   GET /api/devices/payment-stream
 *   Authorization: Bearer <device token>
 *   Last-Event-ID: <id of the last event received>   (optional, on reconnect)
 *
 * Events:
 *   event: ready    data: { deviceName, merchantName, cursor }
 *                   cursor = latest event id; send it back as Last-Event-ID on
 *                   reconnect to receive anything published in between
 *   event: payment  data: PaymentEvent       (also "test", from the portal's test button)
 *   event: revoked  — the device was unpaired; the client should stop reconnecting.
 */
export async function GET(request: Request) {
  const device = await authenticateSoundDevice(request)
  if (!device) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const lastEventId = Number(request.headers.get("last-event-id"))
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }
      const sendEvent = (event: PaymentEvent) => {
        write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      }

      write(`retry: 5000\n`)
      write(
        `event: ready\ndata: ${JSON.stringify({
          deviceName: device.name,
          merchantName: device.merchantName,
          cursor: currentPaymentEventId(),
        })}\n\n`
      )

      if (Number.isFinite(lastEventId) && lastEventId > 0) {
        for (const missed of getMissedPaymentEvents(device.merchantId, lastEventId)) sendEvent(missed)
      }

      const unsubscribe = subscribePaymentEvents(device.merchantId, sendEvent)

      const heartbeat = setInterval(async () => {
        write(`: ping\n\n`)
        try {
          if (!(await isSoundDeviceStillActive(device.id))) {
            write(`event: revoked\ndata: {}\n\n`)
            cleanup()
          }
        } catch (err) {
          // A transient DB error shouldn't drop a live speaker; check again next beat.
          console.error("[PAYMENT-STREAM] Revocation check failed:", err)
        }
      }, HEARTBEAT_MS)

      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed by the client
        }
      }

      request.signal.addEventListener("abort", () => cleanup())
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx-style proxies buffering the stream (which would delay every announcement).
      "X-Accel-Buffering": "no",
    },
  })
}
