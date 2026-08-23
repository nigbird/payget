import { db, type Transaction, type TransactionStatus } from "@/app/lib/db"
import {
  mpgsAllowedAttempts,
  mpgsLinkLifetimeMs,
  nonNegativeEnvNumber,
  positiveEnvNumber,
  retrieveMpgsOrder,
} from "@/lib/mpgs-client"
import { writeAuditLog } from "@/lib/audit-log"
import { deliverMerchantCallback } from "@/lib/merchant-callback"


const TERMINAL_STATUSES = new Set<TransactionStatus>(["success", "failed"])

const LINK_LIFETIME_MS = mpgsLinkLifetimeMs()

const EXPIRY_GRACE_MS =
  nonNegativeEnvNumber(process.env.MPGS_EXPIRY_GRACE_HOURS, 24) * 3_600_000

const MAX_RECONCILE_AGE_DAYS = Math.max(
  positiveEnvNumber(process.env.MPGS_RECONCILE_MAX_AGE_DAYS, 8),
  (LINK_LIFETIME_MS + EXPIRY_GRACE_MS) / 86_400_000 + 1
)

const IN_FLIGHT_ORDER_STATUSES = new Set([
  "AUTHORIZED",
  "AUTHENTICATED",
  "AUTHENTICATION_INITIATED",
  "PENDING",
  "VERIFIED",
])


const PROVISIONAL_FAILURE_STATUSES = new Set([
  "AUTHENTICATION_UNSUCCESSFUL",
  "AUTHENTICATION_FAILED",
  "AUTHENTICATION_REJECTED",
])

export type MpgsSettlementAction =
  | "settled"
  | "expired"
  | "attempts_exhausted"
  | "gateway_failure"
  | "pending"
  | "no_op"
  | "skipped"
  | "error"

export type MpgsSettlementResult = {
  transactionId: string
  transactionReference: string
  action: MpgsSettlementAction
  /** Current status after this call (unchanged unless the action settled it). */
  status: TransactionStatus
  gatewayStatus?: string
  reason?: string
}

export function mpgsOrderIdFor(tx: Transaction): string {
  const stored = (tx.userCredentials as Record<string, any>)?.mpgs?.orderId
  return typeof stored === "string" && stored.length > 0
    ? stored
    : `ORDER-${tx.transactionReference}`
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}


export function mpgsLinkExpiryFor(tx: Transaction): Date | null {
  const mpgs = (tx.userCredentials as Record<string, any>)?.mpgs as
    | Record<string, any>
    | undefined

  const recorded = parseDate(mpgs?.expiresAt)
  if (recorded) return recorded

  const createdAt = parseDate(mpgs?.createdAt) ?? parseDate(tx.timestamp)
  if (!createdAt) return null

  return new Date(createdAt.getTime() + LINK_LIFETIME_MS)
}


const PROVISIONAL_CLOSE_REASONS = new Set([
  "ATTEMPTS_EXHAUSTED",
  "LINK_ERROR_REDIRECT",
  "GATEWAY_ATTEMPT_FAILED",
])

export function isRecoverableAttemptFailure(tx: Transaction): boolean {
  if (tx.status !== "failed") return false

  const mpgs = (tx.userCredentials as Record<string, any>)?.mpgs
  if (!PROVISIONAL_CLOSE_REASONS.has(String(mpgs?.closedReason))) return false

  const expiry = mpgsLinkExpiryFor(tx)
  return expiry === null || Date.now() < expiry.getTime() + EXPIRY_GRACE_MS
}

type FinalizeInput = {
  tx: Transaction
  orderId: string
  finalStatus: TransactionStatus
  action: Extract<MpgsSettlementAction, "settled" | "expired" | "attempts_exhausted" | "gateway_failure">
  /** Where the outcome came from, recorded on the audit entry. */
  source: "MPGS_RETRIEVE_ORDER" | "MPGS_LINK_EXPIRED" | "MPGS_ATTEMPTS_EXHAUSTED" | "MPGS_GATEWAY_FAILURE"
  /** A paid link is spent; an expired one was never used. */
  linkStatus: "PENDING" | "USED" | "EXPIRED"
  reason?: string
  /** Extra fields merged into the stored mpgs metadata. */
  extra?: Record<string, unknown>
  order?: {
    gatewayStatus?: string
    gatewayResult?: string
    receipts: string[]
    attempts?: number
    amount?: number
    currency?: string
  }
  request?: Request
  actorUserId?: string | null
}

async function finalizeMpgsTransaction(
  input: FinalizeInput
): Promise<MpgsSettlementResult> {
  const { tx, orderId, finalStatus, action, source, linkStatus, reason, order } = input

  const oldStatus = tx.status
  const settledAt = new Date().toISOString()

  const existingCredentials = tx.userCredentials as Record<string, any>
  const existingMpgs = (existingCredentials?.mpgs as Record<string, any>) ?? {}

  await db.updateTransaction(tx.id, {
    status: finalStatus,
    userCredentials: {
      ...existingCredentials,
      mpgs: {
        ...existingMpgs,
        orderId,
        gatewayStatus: order?.gatewayStatus ?? null,
        gatewayResult: order?.gatewayResult ?? null,
        receipts: order?.receipts ?? [],
        gatewayAmount: order?.amount ?? null,
        gatewayCurrency: order?.currency ?? null,
        settledAt,
        attempts: order?.attempts ?? existingMpgs.attempts ?? null,
        ...(action === "settled"
          ? { closedAt: null, closedReason: null }
          : {
              closedAt: settledAt,
              closedReason: reason ?? null,
              ...(action === "expired" ? { expiredAt: settledAt } : {}),
            }),
        ...(input.extra ?? {}),
      },
      link: {
        ...((existingCredentials?.link as Record<string, any>) ?? {}),
        status: linkStatus,
        ...(linkStatus === "USED" ? { usedAt: settledAt } : {}),
        ...(linkStatus === "EXPIRED" ? { expiredAt: settledAt } : {}),
      },
    },
  })

   const merchant = await db.getMerchantById(tx.merchantId)

  await writeAuditLog({
    request: input.request,
    userId: input.actorUserId ?? null,
    action: "PAYMENT_STATUS_UPDATE",
    entityType: "TRANSACTION",
    entityId: tx.id,
    oldValue: { status: oldStatus },
    newValue: {
      result: "success",
      status: finalStatus,
      paymentMethod: "MPGS",
      source,
      ...(reason ? { reason } : {}),
      merchantId: tx.merchantId,
      merchantName: merchant?.name,
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      amount: tx.amount,
      orderId,
      gatewayStatus: order?.gatewayStatus,
      gatewayResult: order?.gatewayResult,
      receipts: order?.receipts ?? [],
      attempts: order?.attempts ?? null,
    },
  })

  if (merchant?.callbackUrl) {
    const callbackPayload = {
      statusCode: finalStatus === "success" ? 0 : 1,
      status: finalStatus,
      paymentMethod: "MPGS",
      transactionRef: orderId,
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      gatewayStatus: order?.gatewayStatus ?? null,
      ...(reason ? { reason } : {}),
      receipts: order?.receipts ?? [],
      attempts: order?.attempts ?? null,
      amount: tx.amount,
      processedAt: settledAt,
    }
    void deliverMerchantCallback(tx.id, tx.merchantId, merchant.callbackUrl, callbackPayload)
  }

  console.log(
    action === "expired"
      ? "[mpgs-settlement] Expired transaction"
      : "[mpgs-settlement] Settled transaction",
    {
      transactionId: tx.id,
      orderId,
      from: oldStatus,
      to: finalStatus,
      gatewayStatus: order?.gatewayStatus,
      ...(reason ? { reason } : {}),
    }
  )

  return {
    transactionId: tx.id,
    transactionReference: tx.transactionReference,
    action,
    status: finalStatus,
    gatewayStatus: order?.gatewayStatus,
    ...(reason ? { reason } : {}),
  }
}

/**
 * Verifies one MPGS transaction against the gateway and settles it if the
 * gateway reports a terminal outcome, or closes it out as failed if the link
 * has expired unused. Safe to call repeatedly: transactions already in a
 * terminal state are never re-settled.
 */
export async function settleMpgsTransaction(
  transactionId: string,
  options?: { request?: Request; actorUserId?: string | null }
): Promise<MpgsSettlementResult> {
  const tx = await db.getTransactionById(transactionId)

  if (!tx) {
    return {
      transactionId,
      transactionReference: "",
      action: "skipped",
      status: "initiated",
      reason: "TRANSACTION_NOT_FOUND",
    }
  }

  const base = { transactionId: tx.id, transactionReference: tx.transactionReference }

  if (tx.paymentMethod !== "MPGS") {
    return { ...base, action: "skipped", status: tx.status, reason: "NOT_AN_MPGS_TRANSACTION" }
  }

  // Terminal-state protection — mirrors the provider callback route. The one
  // exception is a transaction we closed for attempt exhaustion whose link is
  // still live at the gateway: it must stay re-checkable.
  if (TERMINAL_STATUSES.has(tx.status) && !isRecoverableAttemptFailure(tx)) {
    return { ...base, action: "no_op", status: tx.status, reason: "TRANSACTION_ALREADY_TERMINAL" }
  }

  const orderId = mpgsOrderIdFor(tx)

  let order: Awaited<ReturnType<typeof retrieveMpgsOrder>>
  try {
    order = await retrieveMpgsOrder(orderId)
  } catch (configError) {
    return { ...base, action: "error", status: tx.status, reason: "MPGS_NOT_CONFIGURED" }
  }

  if (!order.ok) {
    return { ...base, action: "error", status: tx.status, reason: order.error }
  }

  // Customer has not paid (or not even opened the link) yet.
  if (order.outcome === "not_found" || order.outcome === "pending") {
    const expiry = mpgsLinkExpiryFor(tx)
    const pastExpiry = expiry !== null && Date.now() >= expiry.getTime() + EXPIRY_GRACE_MS

    // Never close out an order whose funds the gateway says are committed or
    // held - that needs a human, not an automatic failure. This outranks both
    // the expiry and the attempt ceiling.
    const fundsInFlight =
      order.gatewayStatus !== undefined && IN_FLIGHT_ORDER_STATUSES.has(order.gatewayStatus)

    if (fundsInFlight) {
      return {
        ...base,
        action: "pending",
        status: tx.status,
        gatewayStatus: order.gatewayStatus,
        reason: pastExpiry ? "EXPIRED_BUT_FUNDS_IN_FLIGHT" : "AWAITING_CUSTOMER_PAYMENT",
      }
    }

    if (pastExpiry) {
      return await finalizeMpgsTransaction({
        tx,
        orderId,
        finalStatus: "failed",
        action: "expired",
        source: "MPGS_LINK_EXPIRED",
        linkStatus: "EXPIRED",
        reason:
          order.outcome === "not_found" ? "LINK_EXPIRED_UNUSED" : "LINK_EXPIRED_INCOMPLETE",
        order,
        request: options?.request,
        actorUserId: options?.actorUserId,
      })
    }

    const alreadyClosed = isRecoverableAttemptFailure(tx)

    const gatewayReportsFailure =
      order.gatewayResult === "FAILURE" ||
      (order.gatewayStatus !== undefined &&
        PROVISIONAL_FAILURE_STATUSES.has(order.gatewayStatus))

    if (!alreadyClosed && gatewayReportsFailure) {
      return await finalizeMpgsTransaction({
        tx,
        orderId,
        finalStatus: "failed",
        action: "gateway_failure",
        source: "MPGS_GATEWAY_FAILURE",
        // Provisional: the link may still permit a retry that succeeds.
        linkStatus: "PENDING",
        reason: "GATEWAY_ATTEMPT_FAILED",
        extra: { failedGatewayStatus: order.gatewayStatus ?? null },
        order,
        request: options?.request,
        actorUserId: options?.actorUserId,
      })
    }

    if (!alreadyClosed && order.attempts >= mpgsAllowedAttempts()) {
      return await finalizeMpgsTransaction({
        tx,
        orderId,
        finalStatus: "failed",
        action: "attempts_exhausted",
        source: "MPGS_ATTEMPTS_EXHAUSTED",
        // Not EXPIRED: the gateway will still accept a payment on this link.
        linkStatus: "PENDING",
        reason: "ATTEMPTS_EXHAUSTED",
        order,
        request: options?.request,
        actorUserId: options?.actorUserId,
      })
    }

    return {
      ...base,
      action: "pending",
      status: tx.status,
      gatewayStatus: order.gatewayStatus,
      reason: alreadyClosed
        ? "ATTEMPTS_EXHAUSTED_AWAITING_LATE_PAYMENT"
        : order.outcome === "not_found"
          ? "ORDER_NOT_STARTED"
          : "AWAITING_CUSTOMER_PAYMENT",
    }
  }

  return await finalizeMpgsTransaction({
    tx,
    orderId,
    finalStatus: order.outcome === "success" ? "success" : "failed",
    action: "settled",
    source: "MPGS_RETRIEVE_ORDER",
    linkStatus: "USED",
    order,
    request: options?.request,
    actorUserId: options?.actorUserId,
  })
}

export async function closeMpgsLinkError(
  transactionId: string,
  options?: {
    request?: Request
    actorUserId?: string | null
    /** Gateway errorCode from the redirect, e.g. USAGE_COUNT_EXCEEDED. */
    errorCode?: string | null
    errorDescription?: string | null
  }
): Promise<MpgsSettlementResult> {
  const tx = await db.getTransactionById(transactionId)

  if (!tx) {
    return {
      transactionId,
      transactionReference: "",
      action: "skipped",
      status: "initiated",
      reason: "TRANSACTION_NOT_FOUND",
    }
  }

  const base = { transactionId: tx.id, transactionReference: tx.transactionReference }

  if (tx.paymentMethod !== "MPGS") {
    return { ...base, action: "skipped", status: tx.status, reason: "NOT_AN_MPGS_TRANSACTION" }
  }

  if (TERMINAL_STATUSES.has(tx.status) && !isRecoverableAttemptFailure(tx)) {
    return { ...base, action: "no_op", status: tx.status, reason: "TRANSACTION_ALREADY_TERMINAL" }
  }

  const orderId = mpgsOrderIdFor(tx)

  // Ask the gateway before believing the redirect. If the customer actually
  // paid, this settles as success and the redirect is ignored.
  let order: Awaited<ReturnType<typeof retrieveMpgsOrder>>
  try {
    order = await retrieveMpgsOrder(orderId)
  } catch {
    return { ...base, action: "error", status: tx.status, reason: "MPGS_NOT_CONFIGURED" }
  }

  if (order.ok && order.outcome === "success") {
    return await finalizeMpgsTransaction({
      tx,
      orderId,
      finalStatus: "success",
      action: "settled",
      source: "MPGS_RETRIEVE_ORDER",
      linkStatus: "USED",
      order,
      request: options?.request,
      actorUserId: options?.actorUserId,
    })
  }

  if (order.ok && order.gatewayStatus && IN_FLIGHT_ORDER_STATUSES.has(order.gatewayStatus)) {
    return {
      ...base,
      action: "pending",
      status: tx.status,
      gatewayStatus: order.gatewayStatus,
      reason: "LINK_ERROR_BUT_FUNDS_IN_FLIGHT",
    }
  }

  const errorCode = options?.errorCode?.trim() || null
  const reason =
    errorCode === "USAGE_COUNT_EXCEEDED" ? "ATTEMPTS_EXHAUSTED" : "LINK_ERROR_REDIRECT"

  return await finalizeMpgsTransaction({
    tx,
    orderId,
    finalStatus: "failed",
    action: "attempts_exhausted",
    source: "MPGS_ATTEMPTS_EXHAUSTED",
    // Not EXPIRED: the gateway may still accept a payment on this link.
    linkStatus: "PENDING",
    reason,
    extra: {
      linkErrorCode: errorCode,
      linkErrorDescription: options?.errorDescription?.trim() || null,
    },
    order: order.ok ? order : undefined,
    request: options?.request,
    actorUserId: options?.actorUserId,
  })
}


export async function reconcileMpgsTransactions(options?: {
  maxTransactions?: number
  request?: Request
  actorUserId?: string | null
}) {
  const { maxTransactions = 200 } = options ?? {}

  const minTimestamp = new Date(Date.now() - MAX_RECONCILE_AGE_DAYS * 86_400_000)

  const candidates = (
    await db.getTransactions({ minTimestamp, limit: 1000 })
  )
    .filter(
      (tx) =>
        tx.paymentMethod === "MPGS" &&
        (!TERMINAL_STATUSES.has(tx.status) || isRecoverableAttemptFailure(tx))
    )
    .slice(0, maxTransactions)

  const results: MpgsSettlementResult[] = []
  for (const tx of candidates) {
    try {
      results.push(
        await settleMpgsTransaction(tx.id, {
          request: options?.request,
          actorUserId: options?.actorUserId,
        })
      )
    } catch (error) {
      console.error("[mpgs-settlement] Reconcile error for tx", tx.id, error)
      results.push({
        transactionId: tx.id,
        transactionReference: tx.transactionReference,
        action: "error",
        status: tx.status,
        reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      })
    }
  }

  return {
    results,
    stats: {
      checked: results.length,
      settled: results.filter((r) => r.action === "settled").length,
      attemptsExhausted: results.filter((r) => r.action === "attempts_exhausted").length,
      gatewayFailed: results.filter((r) => r.action === "gateway_failure").length,
      expired: results.filter((r) => r.action === "expired").length,
      pending: results.filter((r) => r.action === "pending").length,
      errors: results.filter((r) => r.action === "error").length,
    },
  }
}
