import type { CashbackRuleInput, CashbackEvaluationContext, CashbackEvaluationResult } from "./types"

export function roundCashbackAmount(amount: number): number {
  return Math.round(amount * 100) / 100
}

export function calculateCashbackAmount(
  paymentAmount: number,
  rule: CashbackRuleInput
): number {
  const percent = rule.percent
  if (percent <= 0 || paymentAmount <= 0) return 0

  let raw = (paymentAmount * percent) / 100
  if (rule.maxCashbackAmount != null && raw > rule.maxCashbackAmount) {
    raw = rule.maxCashbackAmount
  }
  return roundCashbackAmount(Math.max(0, raw))
}

export function transactionMeetsRule(
  paymentAmount: number,
  rule: CashbackRuleInput
): { ok: boolean; reason?: string } {
  const min = rule.minTransactionAmount ?? 0
  if (paymentAmount < min) {
    return { ok: false, reason: `Payment amount below minimum (${min}).` }
  }

  const threshold = rule.transactionThreshold
  if (threshold != null && paymentAmount <= threshold) {
    return { ok: false, reason: `Payment must be greater than threshold (${threshold}).` }
  }

  if (rule.percent <= 0) {
    return { ok: false, reason: "Cashback percentage is not configured." }
  }

  return { ok: true }
}

export function evaluateAllCustomersRule(
  ctx: CashbackEvaluationContext,
  rule: CashbackRuleInput | null
): CashbackEvaluationResult {
  if (!rule || rule.percent == null) {
    return { eligible: false, reason: "All-customers cashback rules are not configured." }
  }

  const check = transactionMeetsRule(ctx.paymentAmount, rule)
  if (!check.ok) {
    return { eligible: false, reason: check.reason ?? "Transaction does not meet cashback rules." }
  }

  const amount = calculateCashbackAmount(ctx.paymentAmount, rule)
  if (amount <= 0) {
    return { eligible: false, reason: "Calculated cashback amount is zero." }
  }

  return {
    eligible: true,
    percent: rule.percent,
    categoryId: null,
    categoryName: null,
    ruleSource: "ALL_CUSTOMERS",
  }
}

export function evaluateCategoryRule(
  ctx: CashbackEvaluationContext,
  category: {
    id: string
    name: string
    percent: number
    minTransactionAmount: number
    maxCashbackAmount: number | null
    transactionThreshold: number | null
    isActive: boolean
  }
): CashbackEvaluationResult {
  if (!category.isActive) {
    return { eligible: false, reason: "Category is inactive." }
  }

  const rule: CashbackRuleInput = {
    percent: category.percent,
    minTransactionAmount: category.minTransactionAmount,
    maxCashbackAmount: category.maxCashbackAmount,
    transactionThreshold: category.transactionThreshold,
  }

  const check = transactionMeetsRule(ctx.paymentAmount, rule)
  if (!check.ok) {
    return { eligible: false, reason: check.reason ?? "Transaction does not meet category rules." }
  }

  const amount = calculateCashbackAmount(ctx.paymentAmount, rule)
  if (amount <= 0) {
    return { eligible: false, reason: "Calculated cashback amount is zero." }
  }

  return {
    eligible: true,
    percent: category.percent,
    categoryId: category.id,
    categoryName: category.name,
    ruleSource: "CATEGORY",
  }
}
