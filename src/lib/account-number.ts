export const ACCOUNT_NUMBER_PREFIX = "7000"
export const ACCOUNT_NUMBER_MAX_LENGTH = 13

export const SUBSIDIARY_ACCOUNT_PREFIX_LENGTH = 3
export const SUBSIDIARY_ACCOUNT_NUMERIC_MAX_LENGTH = 13
export const SUBSIDIARY_ACCOUNT_MAX_LENGTH =
  SUBSIDIARY_ACCOUNT_PREFIX_LENGTH + SUBSIDIARY_ACCOUNT_NUMERIC_MAX_LENGTH

const ACCOUNT_NUMBER_REGEX = /^7000\d{9}$/
const SUBSIDIARY_ACCOUNT_REGEX = /^[A-Za-z0-9]{3}\d{0,13}$/

/** Strip non-digits, enforce 7000 prefix while typing, cap at 13 digits. */
export function sanitizeAccountNumberInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, ACCOUNT_NUMBER_MAX_LENGTH)
  if (digits.length === 0) return ""

  // Only enforce the 7000 prefix on the first 4 digits; allow any digit after that.
  for (let i = 0; i < digits.length && i < ACCOUNT_NUMBER_PREFIX.length; i++) {
    if (digits[i] !== ACCOUNT_NUMBER_PREFIX[i]) {
      return digits.slice(0, i)
    }
  }

  return digits
}

/** First 3 alphanumeric, then up to 13 digits (16 total). */
export function sanitizeSubsidiaryAccountNumberInput(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").slice(0, SUBSIDIARY_ACCOUNT_MAX_LENGTH)
  if (cleaned.length <= SUBSIDIARY_ACCOUNT_PREFIX_LENGTH) {
    return cleaned
  }

  const prefix = cleaned.slice(0, SUBSIDIARY_ACCOUNT_PREFIX_LENGTH)
  const numericPart = cleaned
    .slice(SUBSIDIARY_ACCOUNT_PREFIX_LENGTH)
    .replace(/\D/g, "")
    .slice(0, SUBSIDIARY_ACCOUNT_NUMERIC_MAX_LENGTH)

  return prefix + numericPart
}

export function validateAccountNumber(value: string): { valid: boolean; error?: string } {
  const trimmed = value.trim()

  if (!trimmed) {
    return { valid: false, error: "Account number is required." }
  }

  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: "Account number must contain digits only." }
  }

  if (trimmed.length !== ACCOUNT_NUMBER_MAX_LENGTH) {
    return {
      valid: false,
      error: `Account number must be exactly ${ACCOUNT_NUMBER_MAX_LENGTH} digits.`,
    }
  }

  if (!ACCOUNT_NUMBER_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `Account number must start with ${ACCOUNT_NUMBER_PREFIX} and be exactly ${ACCOUNT_NUMBER_MAX_LENGTH} digits.`,
    }
  }

  return { valid: true }
}

export function validateSubsidiaryAccountNumber(value: string): { valid: boolean; error?: string } {
  const trimmed = value.trim()

  if (!trimmed) {
    return { valid: false, error: "Subsidiary account number is required." }
  }

  if (trimmed.length > SUBSIDIARY_ACCOUNT_MAX_LENGTH) {
    return {
      valid: false,
      error: `Subsidiary account number must not exceed ${SUBSIDIARY_ACCOUNT_MAX_LENGTH} characters.`,
    }
  }

  const prefix = trimmed.slice(0, SUBSIDIARY_ACCOUNT_PREFIX_LENGTH)
  const numericPart = trimmed.slice(SUBSIDIARY_ACCOUNT_PREFIX_LENGTH)

  if (!/^[A-Za-z0-9]{3}$/.test(prefix)) {
    return {
      valid: false,
      error: "First 3 characters must be letters or numbers.",
    }
  }

  if (numericPart.length > SUBSIDIARY_ACCOUNT_NUMERIC_MAX_LENGTH) {
    return {
      valid: false,
      error: `Numeric portion must not exceed ${SUBSIDIARY_ACCOUNT_NUMERIC_MAX_LENGTH} digits.`,
    }
  }

  if (numericPart.length > 0 && !/^\d+$/.test(numericPart)) {
    return {
      valid: false,
      error: "Characters after the first 3 must be digits only.",
    }
  }

  if (!SUBSIDIARY_ACCOUNT_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `Subsidiary account must have 3 alphanumeric characters followed by up to ${SUBSIDIARY_ACCOUNT_NUMERIC_MAX_LENGTH} digits.`,
    }
  }

  return { valid: true }
}

export function getAccountNumberValidationError(value: string): string | undefined {
  const result = validateAccountNumber(value)
  return result.valid ? undefined : result.error
}

export function getSubsidiaryAccountNumberValidationError(value: string): string | undefined {
  const result = validateSubsidiaryAccountNumber(value)
  return result.valid ? undefined : result.error
}

/** Use in API routes; returns normalized value or records an error. */
export function validateAccountNumberField(
  value: unknown,
  errors: Record<string, string>,
  options?: { required?: boolean }
): string | undefined {
  const trimmed = value == null ? "" : String(value).trim()

  if (!trimmed) {
    if (options?.required === false) return undefined
    errors.accountNumber = "Account number is required."
    return undefined
  }

  const result = validateAccountNumber(trimmed)
  if (!result.valid && result.error) {
    errors.accountNumber = result.error
    return undefined
  }

  return trimmed
}

/** Use in API routes for subsidiary funding accounts. */
export function validateSubsidiaryAccountNumberField(
  value: unknown,
  errors: Record<string, string>,
  options?: { required?: boolean; fieldKey?: string }
): string | undefined {
  const fieldKey = options?.fieldKey ?? "subsidiaryAccountNumber"
  const trimmed = value == null ? "" : String(value).trim()

  if (!trimmed) {
    if (options?.required === false) return undefined
    errors[fieldKey] = "Subsidiary account number is required."
    return undefined
  }

  const result = validateSubsidiaryAccountNumber(trimmed)
  if (!result.valid && result.error) {
    errors[fieldKey] = result.error
    return undefined
  }

  return trimmed
}
