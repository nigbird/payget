import { prisma } from "@/lib/prisma"

// Max immediate attempts before giving up and writing to the queue
const IMMEDIATE_ATTEMPTS = 3
// Per-attempt timeout in ms
const ATTEMPT_TIMEOUT_MS = 10_000
// Base delay between immediate attempts in ms (doubles each retry: 1s → 2s)
const IMMEDIATE_BASE_DELAY_MS = 1_000

// Retry schedule for queued callbacks (delay in minutes after each queue attempt)
const QUEUE_RETRY_DELAYS_MINUTES = [5, 30, 120] // attempt 4: +5m, attempt 5: +30m, attempt 6: +2h
const MAX_QUEUE_ATTEMPTS = QUEUE_RETRY_DELAYS_MINUTES.length

export type MerchantCallbackPayload = Record<string, unknown>

type DeliveryResult =
  | { ok: true }
  | { ok: false; error: string; queued: boolean }

/**
 * Attempts to deliver a merchant webhook with immediate retries + exponential backoff.
 * If all immediate attempts fail, the delivery is persisted in MerchantCallbackQueue
 * for later manual retry via POST /api/admin/retry-callbacks.
 */
export async function deliverMerchantCallback(
  transactionId: string,
  merchantId: string,
  callbackUrl: string,
  payload: MerchantCallbackPayload
): Promise<DeliveryResult> {
  // Layer 1: immediate retries (in-process)
  let lastError = ""
  for (let attempt = 0; attempt < IMMEDIATE_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await delay(IMMEDIATE_BASE_DELAY_MS * 2 ** (attempt - 1))
    }
    const result = await attemptDelivery(callbackUrl, payload)
    if (result.ok) return { ok: true }
    lastError = result.error
    console.warn(
      `[merchant-callback] Delivery attempt ${attempt + 1}/${IMMEDIATE_ATTEMPTS} failed for tx ${transactionId}: ${lastError}`
    )
  }

  // Layer 2: queue for manual retry
  try {
    await prisma.merchantCallbackQueue.create({
      data: {
        transactionId,
        merchantId,
        callbackUrl,
        payload: payload as object,
        attempts: IMMEDIATE_ATTEMPTS,
        lastError,
        lastAttemptAt: new Date(),
        // First queue retry is schedulable after QUEUE_RETRY_DELAYS_MINUTES[0]
        nextRetryAt: minutesFromNow(QUEUE_RETRY_DELAYS_MINUTES[0]),
        status: "PENDING",
      },
    })
    console.error(
      `[merchant-callback] All ${IMMEDIATE_ATTEMPTS} attempts failed for tx ${transactionId}. Queued for manual retry. Last error: ${lastError}`
    )
  } catch (queueErr) {
    console.error(
      `[merchant-callback] Failed to queue callback for tx ${transactionId}:`,
      queueErr
    )
  }

  return { ok: false, error: lastError, queued: true }
}

/**
 * Processes all PENDING entries in the queue whose nextRetryAt is in the past.
 * Called by POST /api/admin/retry-callbacks.
 * Returns counts of delivered, failed, and exhausted entries.
 */
export async function processCallbackQueue(): Promise<{
  delivered: number
  failed: number
  exhausted: number
}> {
  const due = await prisma.merchantCallbackQueue.findMany({
    where: {
      status: "PENDING",
      nextRetryAt: { lte: new Date() },
    },
    orderBy: { nextRetryAt: "asc" },
  })

  let delivered = 0
  let failed = 0
  let exhausted = 0

  for (const entry of due) {
    const result = await attemptDelivery(entry.callbackUrl, entry.payload as MerchantCallbackPayload)
    const now = new Date()
    // attempts stored includes all previous tries (immediate + queue rounds)
    const totalAttempts = entry.attempts + 1
    // Queue attempt index (0-based): how many times we've tried from the queue
    const queueAttemptIndex = totalAttempts - IMMEDIATE_ATTEMPTS

    if (result.ok) {
      await prisma.merchantCallbackQueue.update({
        where: { id: entry.id },
        data: { status: "DELIVERED", attempts: totalAttempts, lastAttemptAt: now },
      })
      delivered++
    } else {
      // Check if we've used all queue retry slots
      const nextSlotIndex = queueAttemptIndex // index into QUEUE_RETRY_DELAYS_MINUTES
      const hasMoreSlots = nextSlotIndex < MAX_QUEUE_ATTEMPTS

      if (hasMoreSlots) {
        const nextRetryAt = minutesFromNow(QUEUE_RETRY_DELAYS_MINUTES[nextSlotIndex])
        await prisma.merchantCallbackQueue.update({
          where: { id: entry.id },
          data: {
            attempts: totalAttempts,
            lastError: result.error,
            lastAttemptAt: now,
            nextRetryAt,
          },
        })
        failed++
      } else {
        await prisma.merchantCallbackQueue.update({
          where: { id: entry.id },
          data: {
            status: "EXHAUSTED",
            attempts: totalAttempts,
            lastError: result.error,
            lastAttemptAt: now,
          },
        })
        exhausted++
        console.error(
          `[merchant-callback] Exhausted all retries for tx ${entry.transactionId} (${entry.callbackUrl}). Last error: ${result.error}`
        )
      }
    }
  }

  return { delivered, failed, exhausted }
}

// --- internals ---

async function attemptDelivery(
  url: string,
  payload: MerchantCallbackPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}` }
    }
    return { ok: true }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError"
    return {
      ok: false,
      error: isTimeout ? "Request timed out after 10s" : (err instanceof Error ? err.message : String(err)),
    }
  } finally {
    clearTimeout(timer)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000)
}
