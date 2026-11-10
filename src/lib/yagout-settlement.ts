import { db, type Transaction, type TransactionStatus } from "@/lib/db"
import { writeAuditLog } from "@/lib/audit-log"
import { deliverMerchantCallback } from "@/lib/merchant-callback"
import { runPostSettlementEffects } from "@/lib/payment-settlement"
import { resolveYagoutConfigForMerchant } from "@/lib/yagout-client"
import {
  isSuccessfulTxnResponse,
  type YagoutResponsePgDetails,
  type YagoutTxnResponse,
} from "@/lib/yagout-request"

/**
 * Applies a YagoutPay return POST to the transaction it belongs to.
 *
 * Yagout documents no status-enquiry API, so unlike the card rail there is
 * nothing to re-query: this return is the only outcome signal the platform
 * gets. That makes two properties load-bearing.
 *
 * First, idempotency. The customer's browser performs the POST, so it can
 * arrive twice — a refresh, a retry, a double-submit. A second application
 * must not re-fire the merchant callback or overwrite the first result.
 *
 * Second, never downgrading a settled payment. Once a transaction is recorded
 * as successful, a later failure post cannot flip it: money that has moved
 * stays recorded as moved, and the discrepancy goes to reconciliation instead.
 *
 * Third, authenticity without a MAC. Yagout's protocol is AES-CBC with a fixed
 * IV and no authentication tag (VA-010/VA-011), and a merchant with their own
 * Yagout profile holds their own key, so "it decrypted" only proves which key
 * produced it, not that Yagout did. So a response is applied only when:
 *  - it was decrypted with the key of the Yagout account the transaction was
 *    raised under, so a merchant's key can never settle another merchant's order;
 *  - its amount and currency match what we raised. A "successful" response
 *    that disagrees is held in `processing` for reconciliation, never marked
 *    successful, and fires no cashback or merchant callback.
 */

export type YagoutSettlementAction =
  | "settled"
  | "already_settled"
  | "ignored_after_success"
  | "not_found"
  | "mismatch"
  | "held_for_review"

export type YagoutSettlementResult = {
  action: YagoutSettlementAction
  status: TransactionStatus
  transactionId?: string
  transactionReference?: string
  reason?: string
}

type SettleInput = {
  response: YagoutTxnResponse
  /** me_id of the Yagout account whose key decrypted this response. */
  decryptedWithMeId: string
  pgDetails?: YagoutResponsePgDetails | null
  /** Raw decrypted sections, recorded verbatim for support and reconciliation. */
  raw?: Record<string, string>
  request?: Request
}

/**
 * The gateway echoes the amount it actually charged. If that disagrees with
 * what we raised, the payment still happened but not for the amount we expect,
 * so it is recorded and flagged rather than quietly accepted.
 */
function amountsAgree(expected: number, reported: string): boolean {
  const parsed = Number(reported)
  if (!Number.isFinite(parsed)) return false
  return Math.abs(parsed - expected) < 0.005
}

export async function settleYagoutFromReturn(
  input: SettleInput,
): Promise<YagoutSettlementResult> {
  const { response } = input
  const orderNo = response.orderNo?.trim()

  if (!orderNo) {
    return { action: "not_found", status: "initiated", reason: "NO_ORDER_NUMBER" }
  }

  // order_no is the transactionReference we sent; Yagout's return URLs cannot
  // carry a query string, so this is the only correlation key available.
  const tx = await db.getTransactionByReference(orderNo)
  if (!tx) {
    return { action: "not_found", status: "initiated", reason: "TRANSACTION_NOT_FOUND" }
  }

  if (tx.paymentMethod !== "YAGOUT") {
    return {
      action: "mismatch",
      status: tx.status,
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      reason: "NOT_A_YAGOUT_TRANSACTION",
    }
  }

  const succeeded = isSuccessfulTxnResponse(response)
  const existing = (tx.userCredentials?.yagout ?? {}) as NonNullable<
    Transaction["userCredentials"]["yagout"]
  >

  // The account this order was raised under is recorded at hand-off. Older
  // transactions predate that, so fall back to the merchant's current config.
  let expectedMeId = typeof existing.meId === "string" ? existing.meId.trim() : ""
  if (!expectedMeId) {
    try {
      expectedMeId = (await resolveYagoutConfigForMerchant(tx.merchantId)).meId.trim()
    } catch {
      expectedMeId = ""
    }
  }
  if (!expectedMeId || expectedMeId !== input.decryptedWithMeId.trim()) {
    console.error("[YAGOUT] Return post decrypted under a different account than the order", {
      transactionReference: tx.transactionReference,
      expectedMeId: expectedMeId || null,
      decryptedWithMeId: input.decryptedWithMeId,
    })
    await writeAuditLog({
      request: input.request,
      userId: null,
      action: "PAYMENT_STATUS_UPDATE",
      entityType: "TRANSACTION",
      entityId: tx.id,
      oldValue: { status: tx.status },
      newValue: {
        result: "rejected",
        reason: "YAGOUT_ACCOUNT_MISMATCH",
        source: "YAGOUT_RETURN_POST",
        merchantId: tx.merchantId,
        transactionReference: tx.transactionReference,
        expectedMeId: expectedMeId || null,
        decryptedWithMeId: input.decryptedWithMeId,
      },
    })
    return {
      action: "mismatch",
      status: tx.status,
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      reason: "YAGOUT_ACCOUNT_MISMATCH",
    }
  }

  // Already applied: report what we recorded the first time and do nothing.
  if (existing.settledAt) {
    return {
      action: "already_settled",
      status: tx.status,
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      reason: "RETURN_ALREADY_APPLIED",
    }
  }

  if (tx.status === "success" && !succeeded) {
    return {
      action: "ignored_after_success",
      status: tx.status,
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      reason: "FAILURE_POST_AFTER_SUCCESS",
    }
  }

  const amountMatches = amountsAgree(tx.amount, response.amount)
  const expectedCurrency =
    typeof existing.currency === "string" ? existing.currency.trim().toUpperCase() : ""
  const currencyMatches =
    !expectedCurrency || response.currency.trim().toUpperCase() === expectedCurrency
  // A success that disagrees with what we raised is never settled automatically.
  const held = succeeded && (!amountMatches || !currencyMatches)
  const finalStatus: TransactionStatus = held ? "processing" : succeeded ? "success" : "failed"
  const holdReason = !amountMatches
    ? "AMOUNT_MISMATCH"
    : !currencyMatches
      ? "CURRENCY_MISMATCH"
      : undefined
  const settledAt = new Date().toISOString()

  await db.updateTransaction(tx.id, {
    status: finalStatus,
    userCredentials: {
      ...tx.userCredentials,
      yagout: {
        ...existing,
        orderNo,
        pgRef: response.pgRef || null,
        agRef: response.agRef || null,
        status: response.status,
        resCode: response.resCode,
        resMessage: response.resMessage,
        gatewayAmount: response.amount,
        gatewayCurrency: response.currency,
        amountMismatch: !amountMatches,
        currencyMismatch: !currencyMatches,
        heldForReview: held,
        pgId: input.pgDetails?.pgId ?? null,
        pgName: input.pgDetails?.pgName ?? null,
        paymode: input.pgDetails?.paymode ?? null,
        settledAt,
        raw: input.raw ?? null,
      },
      link: {
        ...(tx.userCredentials?.link ?? { expiresAt: settledAt, status: "PENDING" as const }),
        status: "USED" as const,
        usedAt: settledAt,
      },
    },
  })

  await writeAuditLog({
    request: input.request,
    userId: null,
    action: "PAYMENT_STATUS_UPDATE",
    entityType: "TRANSACTION",
    entityId: tx.id,
    oldValue: { status: tx.status },
    newValue: {
      result: held ? "held_for_review" : "success",
      reason: held ? holdReason : undefined,
      status: finalStatus,
      paymentMethod: "YAGOUT",
      source: "YAGOUT_RETURN_POST",
      merchantId: tx.merchantId,
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      orderNo,
      amount: tx.amount,
      gatewayAmount: response.amount,
      amountMismatch: !amountMatches,
      currencyMismatch: !currencyMatches,
      pgRef: response.pgRef,
      agRef: response.agRef,
      gatewayStatus: response.status,
      resCode: response.resCode,
      resMessage: response.resMessage,
    },
  })

  // Cashback is worked out on the amount we raised (tx.amount), never the
  // gateway's figure, so Yagout's own fees do not change it. Eligibility and
  // the customer's account come from the phone on the merchant's cashback list.
  if (finalStatus === "success") {
    await runPostSettlementEffects(tx.id, "yagout_return")
  }

  // A held payment is not an outcome yet; the merchant hears once it is resolved.
  const merchant = held ? null : await db.getMerchantById(tx.merchantId)
  if (merchant?.callbackUrl) {
    // Fire-and-forget: the customer's browser is waiting on this redirect and
    // must not be held up by the merchant's own endpoint being slow.
    void deliverMerchantCallback(tx.id, tx.merchantId, merchant.callbackUrl, {
      statusCode: succeeded ? 0 : 1,
      status: finalStatus,
      paymentMethod: "YAGOUT",
      transactionRef: orderNo,
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      amount: tx.amount,
      gatewayAmount: response.amount,
      currency: response.currency,
      pgRef: response.pgRef,
      agRef: response.agRef,
      gatewayStatus: response.status,
      resCode: response.resCode,
      resMessage: response.resMessage,
      processedAt: settledAt,
    })
  }

  console.log("[YAGOUT] Settled transaction:", {
    transactionReference: tx.transactionReference,
    orderNo,
    status: finalStatus,
    pgRef: response.pgRef,
    amountMismatch: !amountMatches,
    currencyMismatch: !currencyMatches,
    heldForReview: held,
  })

  return {
    action: held ? "held_for_review" : "settled",
    status: finalStatus,
    transactionId: tx.id,
    transactionReference: tx.transactionReference,
    reason: holdReason,
  }
}
