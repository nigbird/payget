/**
 * Classification of a provider callback into an internal payment outcome.
 *
 * The provider reports only two codes — 0 (success) and 1 (failed) — but code 1
 * covers two very different situations:
 *
 *   - a genuine decline: wrong PIN, insufficient balance, limit exceeded. No
 *     money moved and the payment is terminally failed.
 *   - a switch-level failure where CBS had already posted both legs of the
 *     transfer. The customer is debited and the merchant credited, but the
 *     provider reports failure and sends no FT.
 *
 * CBS returns a fixed description for the second case, so we key off it: those
 * transactions are held as `indeterminate` instead of being written off as
 * failed. An indeterminate payment is parked in a non-terminal state, appears
 * in the payment reconciliation queue, and is settled only when an operator
 * supplies the FT from the bank statement and a checker approves it.
 */

export type ProviderOutcome =
  /** Provider confirmed the payment. */
  | { outcome: "success" }
  /** Provider declined and no money moved. Terminal. */
  | { outcome: "failed" }
  /** Money may have moved despite the failure report. Needs manual settlement. */
  | { outcome: "indeterminate"; reason: string }
  /** Provider sent a status we cannot interpret at all. */
  | { outcome: "ambiguous" }

/**
 * Descriptions CBS returns when the transfer failed *after* both accounts were
 * moved. Matched as substrings against a whitespace-normalized, lowercased
 * description, so provider-side prefixes ("Payment failed.\n") and formatting
 * changes do not break the match.
 */
const MONEY_MOVED_DESCRIPTIONS = ["server busy"]

function normalizeDescription(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * True when the provider's failure description is one CBS uses for a transfer
 * that already posted to both accounts.
 */
export function isMoneyMovedFailure(statusDesc: unknown): boolean {
  const normalized = normalizeDescription(statusDesc)
  if (!normalized) return false
  return MONEY_MOVED_DESCRIPTIONS.some((marker) => normalized.includes(marker))
}

export function parseProviderStatusCode(raw: unknown): number {
  if (typeof raw === "number") return raw
  if (typeof raw === "string") {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : NaN
  }
  return NaN
}

/**
 * Maps a decrypted provider callback onto an internal outcome.
 *
 * `statusCode` is the primary signal; `statusString` is only consulted when the
 * code is missing or unparseable.
 */
export function classifyProviderOutcome(input: {
  statusCodeRaw: unknown
  statusDesc: unknown
  statusString: unknown
  cbsreference: unknown
}): ProviderOutcome {
  const statusCode = parseProviderStatusCode(input.statusCodeRaw)

  if (Number.isFinite(statusCode)) {
    if (statusCode === 0) return { outcome: "success" }

    if (statusCode === 1) {
      // A failure carrying an FT contradicts itself; treat it as money-moved so
      // an operator resolves it rather than silently writing the payment off.
      const hasFt = typeof input.cbsreference === "string" && input.cbsreference.trim().length > 0
      if (hasFt) {
        return {
          outcome: "indeterminate",
          reason: "PROVIDER_FAILED_WITH_FT",
        }
      }

      if (isMoneyMovedFailure(input.statusDesc)) {
        return {
          outcome: "indeterminate",
          reason: "CBS_POSTED_BUT_REPORTED_FAILED",
        }
      }

      return { outcome: "failed" }
    }
  }

  if (input.statusString) {
    const normalized = String(input.statusString).toLowerCase()
    if (normalized === "success") return { outcome: "success" }
    if (normalized === "failed" || normalized === "failure") return { outcome: "failed" }
  }

  return { outcome: "ambiguous" }
}
