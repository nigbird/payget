import { db, type Transaction, type TransactionStatus } from "@/lib/db"
import { writeAuditLog } from "@/lib/audit-log"
import { deliverMerchantCallback } from "@/lib/merchant-callback"
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
 */

export type YagoutSettlementAction =
  | "settled"
  | "already_settled"
  | "ignored_after_success"
  | "not_found"
  | "mismatch"

export type YagoutSettlementResult = {
  action: YagoutSettlementAction
  status: TransactionStatus
  transactionId?: string
  transactionReference?: string
  reason?: string
}

type SettleInput = {
  response: YagoutTxnResponse
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
  const finalStatus: TransactionStatus = succeeded ? "success" : "failed"
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
      result: "success",
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
      pgRef: response.pgRef,
      agRef: response.agRef,
      gatewayStatus: response.status,
      resCode: response.resCode,
      resMessage: response.resMessage,
    },
  })

  const merchant = await db.getMerchantById(tx.merchantId)
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
  })

  return {
    action: "settled",
    status: finalStatus,
    transactionId: tx.id,
    transactionReference: tx.transactionReference,
    reason: amountMatches ? undefined : "AMOUNT_MISMATCH",
  }
}
