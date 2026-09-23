import type { Merchant, Transaction } from "@/lib/db"

/**
 * BANK and TELEBIRR both settle through core banking, which only ever moves
 * birr — those transactions have no currency of their own to read.
 */
export const CBS_CURRENCY = "ETB"

/** Mirrors mpgs-client's DEFAULT_CURRENCY, for a merchant with no gateway currency configured. */
export const DEFAULT_MPGS_CURRENCY = "USD"

type MerchantCurrencySource = Pick<Merchant, "mpgsCurrency"> | null | undefined

const trimmedUpper = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim().toUpperCase() : null

/**
 * The currency a transaction's amount is denominated in.
 *
 * Gateway payments are whatever the merchant's MPGS account settles in, which
 * is not necessarily birr, so they're read from the payment itself: the
 * currency the gateway reported on settlement first, then the one the payment
 * link was raised in, then the merchant's configured gateway currency for
 * links that haven't been settled or were created before we recorded it.
 */
export function transactionCurrency(
  tx: Pick<Transaction, "paymentMethod" | "userCredentials">,
  merchant?: MerchantCurrencySource
): string {
  if (tx.paymentMethod !== "MPGS") return CBS_CURRENCY

  const mpgs = tx.userCredentials?.mpgs
  return (
    trimmedUpper(mpgs?.gatewayCurrency) ??
    trimmedUpper(mpgs?.currency) ??
    trimmedUpper(merchant?.mpgsCurrency) ??
    DEFAULT_MPGS_CURRENCY
  )
}

/** "1234.50 ETB" — the amount shape used across the merchant portal. */
export function formatAmount(amount: number, currency: string) {
  return `${amount.toFixed(2)} ${currency}`
}

export type CurrencyTotal = { currency: string; total: number }

/**
 * Amounts in different currencies can't be added together, so every total on
 * the transactions page is kept per currency. A merchant on a single rail gets
 * a one-entry list that reads exactly like the old single total; one taking
 * both birr and card payments sees each side rather than a meaningless sum.
 */
export function sumByCurrency<T>(
  rows: T[],
  currencyOf: (row: T) => string,
  amountOf: (row: T) => number
): CurrencyTotal[] {
  const totals = new Map<string, number>()
  rows.forEach((row) => {
    const currency = currencyOf(row)
    totals.set(currency, (totals.get(currency) ?? 0) + amountOf(row))
  })
  return toCurrencyTotals(totals)
}

/** Largest first, so the merchant's main rail leads wherever totals are listed. */
export function toCurrencyTotals(totals: Map<string, number>): CurrencyTotal[] {
  return Array.from(totals.entries())
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency))
}

/** "1234.50 ETB + 45.00 USD" — for plain-text contexts (CSV, summary lines). */
export function formatTotals(totals: CurrencyTotal[], emptyCurrency = CBS_CURRENCY) {
  if (totals.length === 0) return formatAmount(0, emptyCurrency)
  return totals.map(({ total, currency }) => formatAmount(total, currency)).join(" + ")
}
