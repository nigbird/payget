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

function normalizeAccount(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const digits = value.replace(/\D/g, "")
  return digits || null
}

function extractCustomerFromTransaction(tx: {
  payerPhone?: string | null
  payerAccount?: string | null
  userCredentials: unknown
}): { phone: string | null; account: string | null } {
  const creds = (tx.userCredentials ?? {}) as Record<string, unknown>
  const providerCallback = creds.providerCallback as Record<string, unknown> | undefined

  const phone =
    normalizeCashbackPhone(tx.payerPhone) ??
    normalizeCashbackPhone(typeof creds.phone === "string" ? creds.phone : null)

  const account =
    normalizeAccount(tx.payerAccount) ??
    normalizeAccount(typeof providerCallback?.payerAccount === "string" ? providerCallback.payerAccount : null) ??
    normalizeAccount(typeof creds.customerAccount === "string" ? creds.customerAccount : null) ??
    normalizeAccount(typeof creds.accountNumber === "string" ? creds.accountNumber : null)

  return { phone, account }
}

async function resolveCustomerAccount(
  merchantId: string,
  tx: {
    payerPhone?: string | null
    payerAccount?: string | null
    userCredentials: unknown
  }
): Promise<{ phone: string | null; account: string | null }> {
  const customer = extractCustomerFromTransaction(tx)
  if (customer.account) return customer

  if (!customer.phone) return customer

  const eligible = await prisma.cashbackEligibleCustomer.findFirst({
    where: { merchantId, phone: customer.phone, accountNumber: { not: null } },
    select: { accountNumber: true },
  })

  return {
    phone: customer.phone,
    account: normalizeAccount(eligible?.accountNumber),
  }
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
      maxTransactionAmount: config.allCustomersMaxAmount,
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
      maxTransactionAmount: row.category.maxTransactionAmount,
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
    console.warn('[cashback] Payment transaction not found: %s', paymentTransactionId)
    return
  }

  if (tx.status !== "success") {
    console.warn('[cashback] Skip — payment not successful: %s (%s)', paymentTransactionId, tx.status)
    return
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
        transactionReference: tx.transactionReference || `default_${tx.id}`,
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
        transactionReference: tx.transactionReference || `default_${tx.id}`,
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

  const customer = await resolveCustomerAccount(tx.merchantId, tx)
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
        transactionReference: tx.transactionReference || `default_${tx.id}`,
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
    maxTransactionAmount:
      evaluation.ruleSource === "ALL_CUSTOMERS"
        ? config.allCustomersMaxAmount
        : undefined,
  }

  if (evaluation.categoryId) {
    const cat = config.categories.find((c: { id: string }) => c.id === evaluation.categoryId)
    if (cat) {
      rule.minTransactionAmount = cat.minTransactionAmount
      rule.maxTransactionAmount = cat.maxTransactionAmount
    }
  }

  const cashbackAmount = calculateCashbackAmount(tx.amount, {
    percent: evaluation.percent,
    minTransactionAmount: rule.minTransactionAmount ?? 0,
    maxTransactionAmount: rule.maxTransactionAmount ?? null,
  })

  if (!customer.account) {
    const failed = await prisma.cashbackTransaction.create({
      data: {
        merchantId: tx.merchantId,
        paymentTransactionId: tx.id,
        transactionReference: tx.transactionReference,
        configId: config.id,
        categoryId: evaluation.categoryId,
        customerPhone: customer.phone,
        customerAccount: null,
        paymentAmount: tx.amount,
        cashbackAmount,
        cashbackPercent: evaluation.percent,
        status: "FAILED",
        failureReason: "Customer account not available from payment callback.",
        subsidiaryAccount: config.subsidiaryAccountNumber,
        idempotencyKey: `cb-${tx.id}`,
        processedAt: new Date(),
      },
    })
    await appendCashbackLog(failed.id, "ERROR", "Cashback failed — no customer account", {
      customerPhone: customer.phone,
    })
    return failed
  }

  const cashbackTx = await prisma.cashbackTransaction.create({
    data: {
      merchantId: tx.merchantId,
      paymentTransactionId: tx.id,
      transactionReference: tx.transactionReference,
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
    debitAcctNumber: config.subsidiaryAccountNumber,
    creditAcctNumber: customer.account,
  })

  return executeTransferForTransaction(cashbackTx.id)
}

/**
 * Execute the actual transfer for an existing cashback transaction record.
 * Used for both initial processing and retries.
 */
export async function executeTransferForTransaction(cashbackTransactionId: string) {
  const cashbackTx = await prisma.cashbackTransaction.findUnique({
    where: { id: cashbackTransactionId },
  })

  if (!cashbackTx) {
    throw new Error(`Cashback transaction not found: ${cashbackTransactionId}`)
  }

  if (cashbackTx.status === "COMPLETED") {
    return cashbackTx
  }

  if (!cashbackTx.customerAccount) {
    const failed = await prisma.cashbackTransaction.update({
      where: { id: cashbackTx.id },
      data: {
        status: "FAILED",
        failureReason: "Customer account is missing.",
        processedAt: new Date(),
      },
    })
    await appendCashbackLog(cashbackTx.id, "ERROR", "Cashback transfer failed — no customer account")
    return failed
  }

  try {
    const transfer = await getCashbackTransferProvider().executeTransfer({
      merchantId: cashbackTx.merchantId,
      paymentTransactionId: cashbackTx.paymentTransactionId,
      subsidiaryAccountNumber: cashbackTx.subsidiaryAccount || "",
      customerAccount: cashbackTx.customerAccount,
      customerPhone: cashbackTx.customerPhone,
      cashbackAmount: cashbackTx.cashbackAmount,
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
        newValue: { paymentTransactionId: cashbackTx.paymentTransactionId, failureReason: transfer.error },
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
    })

    await writeAuditLog({
      request: new Request("http://localhost/internal/cashback"),
      userId: null,
      action: "CASHBACK_COMPLETED",
      entityType: "CASHBACK_TRANSACTION",
      entityId: completed.id,
      newValue: {
        paymentTransactionId: cashbackTx.paymentTransactionId,
        cashbackAmount: cashbackTx.cashbackAmount,
        customerPhone: cashbackTx.customerPhone,
        categoryId: cashbackTx.categoryId,
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
