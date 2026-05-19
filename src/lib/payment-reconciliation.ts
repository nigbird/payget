
import { db, type Transaction } from "@/app/lib/db";
import { writeAuditLog } from "./audit-log";
import { prisma } from "@/lib/prisma";

/**
 * Configuration for payment reconciliation
 */
const RECONCILIATION_CONFIG = {
  /** How old an awaiting_pin transaction must be before we consider it for reconciliation (in minutes) */
  AWAITING_PIN_AGE_MINUTES: 30,
  /** Maximum age of transactions to check (in minutes) */
  MAX_TRANSACTION_AGE_MINUTES: 24 * 60, // 24 hours
};

const TERMINAL_STATUSES = new Set(["success", "failed"]);

/**
 * Reconcile old awaiting_pin transactions
 * - Finds transactions stuck in awaiting_pin
 * - Safely resolves them if possible
 */
export async function reconcileAwaitingPinTransactions(options?: {
  dryRun?: boolean;
  maxTransactions?: number;
}) {
  const { dryRun = false, maxTransactions = 100 } = options || {};

  const now = new Date();
  const minAgeMs = RECONCILIATION_CONFIG.AWAITING_PIN_AGE_MINUTES * 60 * 1000;
  const maxAgeMs = RECONCILIATION_CONFIG.MAX_TRANSACTION_AGE_MINUTES * 60 * 1000;

  const minCreatedAt = new Date(now.getTime() - maxAgeMs);
  const maxCreatedAt = new Date(now.getTime() - minAgeMs);

  const results: {
    transactionId: string;
    transactionReference: string;
    previousStatus: string;
    action: "reconciled" | "no_op" | "skipped";
    newStatus?: string;
    reason?: string;
  }[] = [];

  try {
    const allMerchantTxs = await db.getTransactions();
    const filteredTxs = allMerchantTxs.filter((tx) => {
      if (tx.status !== "awaiting_pin") return false;

      const txCreatedAt = new Date(tx.timestamp);
      return txCreatedAt >= minCreatedAt && txCreatedAt <= maxCreatedAt;
    }).slice(0, maxTransactions);

    for (const tx of filteredTxs) {
      const result = await reconcileSingleTransaction(tx, dryRun);
      results.push(result);
    }
  } catch (error) {
    console.error("[payment-reconciliation] Error during reconciliation:", error);
  }

  return results;
}

/**
 * Reconcile a single transaction
 */
async function reconcileSingleTransaction(
  tx: Transaction,
  dryRun: boolean
): Promise<{
  transactionId: string;
  transactionReference: string;
  previousStatus: string;
  action: "reconciled" | "no_op" | "skipped";
  newStatus?: string;
  reason?: string;
}> {
  // First, check if transaction is already in terminal state
  const freshTx = await db.getTransactionById(tx.id);
  if (!freshTx) {
    return {
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      previousStatus: tx.status,
      action: "skipped",
      reason: "TRANSACTION_NOT_FOUND",
    };
  }

  if (TERMINAL_STATUSES.has(freshTx.status)) {
    return {
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      previousStatus: tx.status,
      action: "no_op",
      reason: "TRANSACTION_ALREADY_TERMINAL",
    };
  }

  // For now, this is a defensive check that we can expand later
  // In a real implementation, you could:
  // 1. Query the provider's status API (if available)
  // 2. Check for any missed callbacks
  // 3. Apply business rules for timeout (e.g., mark as failed after X hours)

  // For this implementation, we'll just log and skip for now
  // (we don't want to mark as failed without provider confirmation)
  return {
    transactionId: tx.id,
    transactionReference: tx.transactionReference,
    previousStatus: tx.status,
    action: "skipped",
    reason: "AWAITING_PROVIDER_CONFIRMATION",
  };
}

/**
 * Expose reconciliation via an API endpoint if needed
 */
export async function runReconciliationJob(dryRun: boolean = false) {
  console.log("[payment-reconciliation] Starting reconciliation job...", { dryRun });

  const results = await reconcileAwaitingPinTransactions({ dryRun });

  const stats = {
    total: results.length,
    reconciled: results.filter((r) => r.action === "reconciled").length,
    noOp: results.filter((r) => r.action === "no_op").length,
    skipped: results.filter((r) => r.action === "skipped").length,
  };

  console.log("[payment-reconciliation] Reconciliation job completed", {
    dryRun,
    stats,
    results,
  });

  return { results, stats };
}
