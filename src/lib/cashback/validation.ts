/** Shared limits and sanitizers for cashback configuration UI + APIs. */
import { hasAnyDangerousExtension } from "@/lib/file-validation";

export const CASHBACK_LIMITS = {
  categoryNameMax: 50,
  percentMin: 0.01,
  percentMax: 100,
  percentMaxInputLength: 6,
  amountMax: 999_999_999.99,
  amountMaxInputLength: 15,
  amountDecimalPlaces: 2,
  importMaxBytes: 5 * 1024 * 1024,
  importMaxRows: 10_000,
  allowedImportExtensions: ["csv", "txt", "xlsx", "xls"] as const,
  allowedImportMimeTypes: [
    "text/csv",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
} as const

/** Cashback % — digits and one decimal; capped at 100 while typing. */
export function sanitizePercentInput(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "")
  if (!v) return ""

  const firstDot = v.indexOf(".")
  if (firstDot >= 0) {
    const intPart = v.slice(0, firstDot).replace(/\./g, "").slice(0, 3)
    const decPart = v
      .slice(firstDot + 1)
      .replace(/\./g, "")
      .slice(0, CASHBACK_LIMITS.amountDecimalPlaces)
    if (intPart === "100") return "100"
    v = decPart.length > 0 || raw.endsWith(".") ? `${intPart}.${decPart}` : intPart
  } else {
    v = v.slice(0, 3)
  }

  const num = parseFloat(v)
  if (!Number.isNaN(num) && num > CASHBACK_LIMITS.percentMax) {
    return String(CASHBACK_LIMITS.percentMax)
  }

  return v.slice(0, CASHBACK_LIMITS.percentMaxInputLength)
}

/** Currency / amount fields — digits, optional decimal, bounded length and max value. */
export function sanitizeAmountInput(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "")
  if (!v) return ""

  const firstDot = v.indexOf(".")
  if (firstDot >= 0) {
    const intPart = v.slice(0, firstDot).replace(/\./g, "").slice(0, 9)
    const decPart = v
      .slice(firstDot + 1)
      .replace(/\./g, "")
      .slice(0, CASHBACK_LIMITS.amountDecimalPlaces)
    v =
      decPart.length > 0 || raw.endsWith(".")
        ? `${intPart}.${decPart}`
        : intPart
  } else {
    v = v.slice(0, 9)
  }

  const num = parseFloat(v)
  if (!Number.isNaN(num) && num > CASHBACK_LIMITS.amountMax) {
    return String(CASHBACK_LIMITS.amountMax)
  }

  return v.slice(0, CASHBACK_LIMITS.amountMaxInputLength)
}

export function sanitizeCategoryNameInput(raw: string): string {
  return raw
    .replace(/[^\w\s\-&'.]/g, "")
    .slice(0, CASHBACK_LIMITS.categoryNameMax)
}

export function validatePercent(
  value: string,
  required = false
): { valid: boolean; error?: string; parsed: number | null } {
  const trimmed = value.trim()
  if (!trimmed) {
    return required
      ? { valid: false, error: "Cashback percentage is required.", parsed: null }
      : { valid: true, parsed: null }
  }

  const num = Number(trimmed)
  if (!Number.isFinite(num)) {
    return { valid: false, error: "Enter a valid percentage.", parsed: null }
  }
  if (num <= 0 || num > CASHBACK_LIMITS.percentMax) {
    return {
      valid: false,
      error: `Percentage must be between ${CASHBACK_LIMITS.percentMin} and ${CASHBACK_LIMITS.percentMax}.`,
      parsed: null,
    }
  }

  return { valid: true, parsed: num }
}

export function validateAmount(
  value: string,
  label: string,
  required = false
): { valid: boolean; error?: string; parsed: number | null } {
  const trimmed = value.trim()
  if (!trimmed) {
    return required
      ? { valid: false, error: `${label} is required.`, parsed: null }
      : { valid: true, parsed: null }
  }

  const num = Number(trimmed)
  if (!Number.isFinite(num) || num < 0) {
    return { valid: false, error: `${label} must be a valid amount.`, parsed: null }
  }
  if (num > CASHBACK_LIMITS.amountMax) {
    return {
      valid: false,
      error: `${label} cannot exceed ${CASHBACK_LIMITS.amountMax.toLocaleString()}.`,
      parsed: null,
    }
  }

  return { valid: true, parsed: num }
}

export function validateCategoryName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim()
  if (!trimmed) {
    return { valid: false, error: "Category name is required." }
  }
  if (trimmed.length > CASHBACK_LIMITS.categoryNameMax) {
    return {
      valid: false,
      error: `Category name cannot exceed ${CASHBACK_LIMITS.categoryNameMax} characters.`,
    }
  }
  return { valid: true }
}

export function validateMinMaxAmounts(
  minStr: string,
  maxStr: string
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const min = validateAmount(minStr, "Min transaction amount")
  const max = validateAmount(maxStr, "Max transaction amount")

  if (!min.valid && min.error) errors.minTransactionAmount = min.error
  if (!max.valid && max.error) errors.maxTransactionAmount = max.error

  if (
    min.parsed != null &&
    max.parsed != null &&
    max.parsed < min.parsed
  ) {
    errors.maxTransactionAmount = "Max amount must be greater than or equal to min amount."
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

export function validateCashbackConfigBody(
  body: Record<string, unknown>,
  enabled: boolean
): Record<string, string> {
  const errors: Record<string, string> = {}

  if (body.allCustomersPercent !== undefined && body.allCustomersPercent !== null && body.allCustomersPercent !== "") {
    const p = validatePercent(String(body.allCustomersPercent))
    if (!p.valid && p.error) errors.allCustomersPercent = p.error
  } else if (enabled && body.mode === "ALL_CUSTOMERS") {
    const p = validatePercent("", true)
    if (!p.valid && p.error) errors.allCustomersPercent = p.error
  }

  for (const [key, label] of [
    ["allCustomersMinAmount", "Min transaction amount"],
    ["allCustomersMaxAmount", "Max transaction amount"],
  ] as const) {
    const val = body[key]
    if (val !== undefined && val !== null && val !== "") {
      const a = validateAmount(String(val), label)
      if (!a.valid && a.error) errors[key] = a.error
    }
  }

  const min = body.allCustomersMinAmount
  const max = body.allCustomersMaxAmount
  if (min != null && min !== "" && max != null && max !== "") {
    const mm = validateMinMaxAmounts(String(min), String(max))
    Object.assign(errors, mm.errors)
  }

  return errors
}

export function validateCategoryBody(body: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}

  const nameCheck = validateCategoryName(String(body.name ?? ""))
  if (!nameCheck.valid && nameCheck.error) errors.name = nameCheck.error

  const p = validatePercent(String(body.percent ?? ""), true)
  if (!p.valid && p.error) errors.percent = p.error

  const mm = validateMinMaxAmounts(
    String(body.minTransactionAmount ?? ""),
    String(body.maxTransactionAmount ?? "")
  )
  Object.assign(errors, mm.errors)

  return errors
}

export function validateImportFile(file: File): { valid: boolean; error?: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (!CASHBACK_LIMITS.allowedImportExtensions.includes(ext as (typeof CASHBACK_LIMITS.allowedImportExtensions)[number])) {
    return { valid: false, error: "Only CSV, TXT, XLS, or XLSX files are allowed." }
  }

  // Check for ANY dangerous extension anywhere in filename (double/triple extension check)
  if (hasAnyDangerousExtension(file.name)) {
    return { valid: false, error: "File contains dangerous extensions." }
  }

  if (file.size > CASHBACK_LIMITS.importMaxBytes) {
    const mb = CASHBACK_LIMITS.importMaxBytes / (1024 * 1024)
    return { valid: false, error: `File size must not exceed ${mb} MB.` }
  }

  if (file.size === 0) {
    return { valid: false, error: "File is empty." }
  }

  return { valid: true }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
