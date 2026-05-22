export const ACCOUNT_NUMBER_PREFIX = "7000"
export const ACCOUNT_NUMBER_MAX_LENGTH = 13

const ACCOUNT_NUMBER_REGEX = /^7000\d{0,9}$/

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

export function validateAccountNumber(value: string): { valid: boolean; error?: string } {
  const trimmed = value.trim()

  if (!trimmed) {
    return { valid: false, error: "Account number is required." }
  }

  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: "Account number must contain digits only." }
  }

  if (trimmed.length > ACCOUNT_NUMBER_MAX_LENGTH) {
    return {
      valid: false,
      error: `Account number must not exceed ${ACCOUNT_NUMBER_MAX_LENGTH} digits.`,
    }
  }

  if (!ACCOUNT_NUMBER_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `Account number must start with ${ACCOUNT_NUMBER_PREFIX} (max ${ACCOUNT_NUMBER_MAX_LENGTH} digits).`,
    }
  }

  return { valid: true }
}

export function getAccountNumberValidationError(value: string): string | undefined {
  const result = validateAccountNumber(value)
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
