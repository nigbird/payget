import { db } from "@/lib/db"
import { prisma } from "@/lib/prisma"

/**
 * Single place where a payment transaction reaches a terminal state.
 *
 * Every path that resolves a payment — the provider callback, the customer
 * status poll, the admin status check, and manual FT reconciliation — should
 * go through here so the FT is persisted consistently and the downstream
 * effects of a successful payment fire exactly once.
 *
 * Merchant notification is deliberately NOT fired here yet; see notifyMerchant
 * below for the hook.
 */

export type SettlementSource =
  | "provider_callback"
  | "status_poll"
  | "admin_status_check"
  | "manual_ft_reconciliation"

export type SettlementResult =
  | { ok: true; alreadyTerminal: boolean }
  | { ok: false; error: string; code: "ALREADY_TERMINAL" | "FT_IN_USE" | "NOT_FOUND" }

const TERMINAL_STATUSES = new Set(["success", "failed"])

/**
 * Resolves a transaction to a terminal status and records its FT.
 *
 * - Refuses to move a transaction that is already terminal.
 * - Refuses an FT already claimed by a different transaction, so one bank
 *   receipt can never settle two payments.
 * - On success, spawns cashback processing (idempotent, guarded internally by
 *   the unique paymentTransactionId on CashbackTransaction).
 */
export async function settleTransaction(options: {
  transactionId: string
  status: "success" | "failed"
  ftNumber?: string | null
  source: SettlementSource
  /** Extra fields to merge into userCredentials (e.g. provider callback detail). */
  userCredentialsPatch?: Record<string, unknown>
  /** Set when the provider callback supplies the payer account. */
  payerAccount?: string | null
}): Promise<SettlementResult> {
  const { transactionId, status, source, userCredentialsPatch, payerAccount } = options
  const ftNumber = options.ftNumber?.trim() || null

  const tx = await db.getTransactionById(transactionId)
  if (!tx) return { ok: false, error: "Transaction not found", code: "NOT_FOUND" }

  if (TERMINAL_STATUSES.has(tx.status)) {
    return { ok: false, error: `Transaction is already ${tx.status}`, code: "ALREADY_TERMINAL" }
  }

  if (ftNumber) {
    const holder = await prisma.transaction.findUnique({
      where: { cbsreference: ftNumber },
      select: { id: true, transactionReference: true },
    })
    if (holder && holder.id !== transactionId) {
      return {
        ok: false,
        error: `FT ${ftNumber} is already recorded on transaction ${holder.transactionReference}`,
        code: "FT_IN_USE",
      }
    }
  }

  // Keep the FT inside userCredentials too — receipt generation and older code
  // paths still read it from there.
  const userCredentials = {
    ...tx.userCredentials,
    ...(userCredentialsPatch ?? {}),
    ...(ftNumber ? { cbsreference: ftNumber } : {}),
  }

  await db.updateTransaction(transactionId, {
    status,
    userCredentials,
    ...(ftNumber ? { cbsreference: ftNumber } : {}),
    ...(payerAccount !== undefined ? { payerAccount } : {}),
  })

  if (status === "success") {
    await runPostSettlementEffects(transactionId, source)
  }

  return { ok: true, alreadyTerminal: false }
}

/**
 * Downstream effects of a payment becoming successful.
 *
 * Cashback runs for every settlement source, so a payment recovered by manual
 * FT reconciliation still pays the customer the cashback they earned.
 *
 * Merchant notification is not wired in yet — when it is, call
 * deliverMerchantCallback here and every settlement path picks it up at once.
 */
async function runPostSettlementEffects(transactionId: string, source: SettlementSource) {
  const { processCashbackForSettlement } = await import("@/lib/cashback/processor")
  void processCashbackForSettlement(transactionId).catch((err) => {
    console.error(
      `[settlement] Cashback processing failed for tx ${transactionId} (source: ${source}):`,
      err
    )
  })
}
