import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit-log"
import { db } from "@/app/lib/db"
import { normalizeCashbackPhone } from "./phone"
import {
  calculateCashbackAmount,
  evaluateAllCustomersRule,
  evaluateCategoryRule,
} from "./rules"
import { appendCashbackLog, getOrCreateCashbackConfig } from "./service"
import { getCashbackTransferProvider } from "./transfer-provider"
import type { CashbackEvaluationResult } from "./types"

function extractCustomerFromTransaction(tx: {
  payerPhone?: string | null
  userCredentials: unknown
}): { phone: string | null; account: string | null } {
  const creds = (tx.userCredentials ?? {}) as Record<string, unknown>
  const phone =
    normalizeCashbackPhone(tx.payerPhone) ??
    normalizeCashbackPhone(typeof creds.phone === "string" ? creds.phone : null)

  const account =
    typeof creds.customerAccount === "string"
      ? creds.customerAccount.replace(/\D/g, "") || null
      : typeof creds.accountNumber === "string"
        ? creds.accountNumber.replace(/\D/g, "") || null
        : null

  return { phone, account }
}

async function evaluateEligibility(
  merchantId: string,
  config: Awaited<ReturnType<typeof getOrCreateCashbackConfig>>,
  ctx: { paymentAmount: number; customerPhone: string | null; customerAccount: string | null }
): Promise<CashbackEvaluationResult> {
  if (config.mode === "ALL_CUSTOMERS") {
    return evaluateAllCustomersRule(ctx, {
      percent: config.allCustomersPercent ?? 0,
      minTransactionAmount: config.allCustomersMinAmount,
      maxCashbackAmount: config.allCustomersMaxCashback,
      transactionThreshold: config.allCustomersThreshold,
    })
  }

  if (!ctx.customerPhone) {
    return { eligible: false, reason: "Customer phone is required for category-based cashback." }
  }

  const eligible = await prisma.cashbackEligibleCustomer.findMany({
    where: { merchantId, phone: ctx.customerPhone },
    include: { category: true },
  })

  if (eligible.length === 0) {
    return { eligible: false, reason: "Customer is not in any eligible cashback category." }
  }

  let best: CashbackEvaluationResult | null = null
  let bestAmount = 0

  for (const row of eligible) {
    const result = evaluateCategoryRule(ctx, row.category)
    if (!result.eligible) continue

    const amount = calculateCashbackAmount(ctx.paymentAmount, {
      percent: result.percent,
      minTransactionAmount: row.category.minTransactionAmount,
      maxCashbackAmount: row.category.maxCashbackAmount,
      transactionThreshold: row.category.transactionThreshold,
    })

    if (amount > bestAmount) {
      bestAmount = amount
      best = result
    }
  }

  return best ?? { eligible: false, reason: "No category rule matched this transaction." }
}

/**
 * Process cashback after provider-confirmed payment success.
 * Idempotent per payment transaction; safe to call from callback handler.
 */
export async function processCashbackForSettlement(paymentTransactionId: string) {
  const tx = await db.getTransactionById(paymentTransactionId)
  if (!tx) {
    console.warn(`[cashback] Payment transaction not found: ${paymentTransactionId}`)
    return null
  }

  if (tx.status !== "success") {
    console.warn(`[cashback] Skip — payment not successful: ${paymentTransactionId} (${tx.status})`)
    return null
  }

  const existing = await prisma.cashbackTransaction.findUnique({
    where: { paymentTransactionId },
  })
  if (existing) {
    return existing
  }

  const config = await getOrCreateCashbackConfig(tx.merchantId)

  if (!config.enabled) {
    return prisma.cashbackTransaction.create({
      data: {
        merchantId: tx.merchantId,
        paymentTransactionId: tx.id,
        configId: config.id,
        customerPhone: extractCustomerFromTransaction(tx).phone,
        customerAccount: extractCustomerFromTransaction(tx).account,
        paymentAmount: tx.amount,
        cashbackAmount: 0,
        cashbackPercent: 0,
        status: "SKIPPED",
        skipReason: "Cashback is disabled for this merchant.",
        idempotencyKey: `cb-${tx.id}`,
      },
    })
  }

  if (!config.subsidiaryAccountNumber?.trim()) {
    return prisma.cashbackTransaction.create({
      data: {
        merchantId: tx.merchantId,
        paymentTransactionId: tx.id,
        configId: config.id,
        customerPhone: extractCustomerFromTransaction(tx).phone,
        customerAccount: extractCustomerFromTransaction(tx).account,
        paymentAmount: tx.amount,
        cashbackAmount: 0,
        cashbackPercent: 0,
        status: "SKIPPED",
        skipReason: "Subsidiary funding account is not configured.",
        idempotencyKey: `cb-${tx.id}`,
      },
    })
  }

  const customer = extractCustomerFromTransaction(tx)
  const evaluation = await evaluateEligibility(tx.merchantId, config, {
    paymentAmount: tx.amount,
    customerPhone: customer.phone,
    customerAccount: customer.account,
  })

  if (!evaluation.eligible) {
    const skipped = await prisma.cashbackTransaction.create({
      data: {
        merchantId: tx.merchantId,
        paymentTransactionId: tx.id,
        configId: config.id,
        customerPhone: customer.phone,
        customerAccount: customer.account,
        paymentAmount: tx.amount,
        cashbackAmount: 0,
        cashbackPercent: 0,
        status: "SKIPPED",
        skipReason: evaluation.reason,
        idempotencyKey: `cb-${tx.id}`,
      },
    })
    await appendCashbackLog(skipped.id, "INFO", "Cashback skipped", { reason: evaluation.reason })
    return skipped
  }

  const rule = {
    percent: evaluation.percent,
    minTransactionAmount:
      evaluation.ruleSource === "ALL_CUSTOMERS"
        ? config.allCustomersMinAmount
        : undefined,
    maxCashbackAmount:
      evaluation.ruleSource === "ALL_CUSTOMERS"
        ? config.allCustomersMaxCashback
        : undefined,
    transactionThreshold:
      evaluation.ruleSource === "ALL_CUSTOMERS"
        ? config.allCustomersThreshold
        : undefined,
  }

  if (evaluation.categoryId) {
    const cat = config.categories.find((c: { id: string }) => c.id === evaluation.categoryId)
    if (cat) {
      rule.minTransactionAmount = cat.minTransactionAmount
      rule.maxCashbackAmount = cat.maxCashbackAmount
      rule.transactionThreshold = cat.transactionThreshold
    }
  }

  const cashbackAmount = calculateCashbackAmount(tx.amount, {
    percent: evaluation.percent,
    minTransactionAmount: rule.minTransactionAmount ?? 0,
    maxCashbackAmount: rule.maxCashbackAmount ?? null,
    transactionThreshold: rule.transactionThreshold ?? null,
  })

  const cashbackTx = await prisma.cashbackTransaction.create({
    data: {
      merchantId: tx.merchantId,
      paymentTransactionId: tx.id,
      configId: config.id,
      categoryId: evaluation.categoryId,
      customerPhone: customer.phone,
      customerAccount: customer.account,
      paymentAmount: tx.amount,
      cashbackAmount,
      cashbackPercent: evaluation.percent,
      status: "PROCESSING",
      subsidiaryAccount: config.subsidiaryAccountNumber,
      idempotencyKey: `cb-${tx.id}`,
    },
  })

  await appendCashbackLog(cashbackTx.id, "INFO", "Cashback processing started", {
    evaluation,
    paymentAmount: tx.amount,
    cashbackAmount,
  })

  try {
    const transfer = await getCashbackTransferProvider().executeTransfer({
      merchantId: tx.merchantId,
      paymentTransactionId: tx.id,
      subsidiaryAccountNumber: config.subsidiaryAccountNumber,
      customerAccount: customer.account,
      customerPhone: customer.phone,
      cashbackAmount,
    })

    if (!transfer.success) {
      const failed = await prisma.cashbackTransaction.update({
        where: { id: cashbackTx.id },
        data: {
          status: "FAILED",
          failureReason: transfer.error ?? "Transfer failed",
          processedAt: new Date(),
        },
      })
      await appendCashbackLog(cashbackTx.id, "ERROR", "Cashback transfer failed", {
        error: transfer.error,
      })
      await writeAuditLog({
        request: new Request("http://localhost/internal/cashback"),
        userId: null,
        action: "CASHBACK_FAILED",
        entityType: "CASHBACK_TRANSACTION",
        entityId: failed.id,
        newValue: { paymentTransactionId: tx.id, failureReason: transfer.error },
      })
      return failed
    }

    const completed = await prisma.cashbackTransaction.update({
      where: { id: cashbackTx.id },
      data: {
        status: "COMPLETED",
        providerDebitRef: transfer.debitRef ?? null,
        providerCreditRef: transfer.creditRef ?? null,
        processedAt: new Date(),
      },
    })

    await appendCashbackLog(cashbackTx.id, "INFO", "Cashback completed", {
      debitRef: transfer.debitRef,
      creditRef: transfer.creditRef,
      simulated: transfer.simulated ?? false,
    })

    await writeAuditLog({
      request: new Request("http://localhost/internal/cashback"),
      userId: null,
      action: "CASHBACK_COMPLETED",
      entityType: "CASHBACK_TRANSACTION",
      entityId: completed.id,
      newValue: {
        paymentTransactionId: tx.id,
        cashbackAmount,
        customerPhone: customer.phone,
        categoryId: evaluation.categoryId,
        providerDebitRef: transfer.debitRef,
        providerCreditRef: transfer.creditRef,
      },
    })

    return completed
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    const failed = await prisma.cashbackTransaction.update({
      where: { id: cashbackTx.id },
      data: {
        status: "FAILED",
        failureReason: message,
        processedAt: new Date(),
      },
    })
    await appendCashbackLog(cashbackTx.id, "ERROR", "Cashback processing exception", { message })
    return failed
  }
}
