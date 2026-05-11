export type PasswordCheckResult = { valid: boolean; errors: string[] }

export type PasswordStrengthLabel = "Weak" | "Fair" | "Good" | "Strong"

export const PASSWORD_POLICY_TEXT =
  "Minimum 8 characters. Include uppercase, lowercase, a number, and a special character."

// Small list of common weak passwords. Extend as needed or load from a file/DB.
const commonPasswords = new Set([
  "123456",
  "password",
  "123456789",
  "12345678",
  "12345",
  "qwerty",
  "abc123",
  "111111",
  "123123",
  "password1",
  "1234",
  "iloveyou",
  "admin",
  "welcome",
  "monkey",
  "letmein",
  "dragon",
  "baseball",
  "football",
  "master",
])

const hasLower = (pw: string) => /[a-z]/.test(pw)
const hasUpper = (pw: string) => /[A-Z]/.test(pw)
const hasNumber = (pw: string) => /[0-9]/.test(pw)
const hasSpecial = (pw: string) => /[!@#$%^&*()\[\]{}\-_=+<>?/~`|\\,.;:]/.test(pw)

export function validatePassword(pw: string): PasswordCheckResult {
  const errors: string[] = []

  if (!pw || typeof pw !== "string") {
    errors.push("Password must be a string.")
    return { valid: false, errors }
  }

  if (pw.length < 8) errors.push("Password must be at least 8 characters long.")
  if (!hasLower(pw)) errors.push("Password must include a lowercase letter.")
  if (!hasUpper(pw)) errors.push("Password must include an uppercase letter.")
  if (!hasNumber(pw)) errors.push("Password must include a number.")
  if (!hasSpecial(pw)) errors.push("Password must include a special character.")
  if (commonPasswords.has(pw.toLowerCase())) errors.push("Password is too common. Choose a less predictable password.")

  return { valid: errors.length === 0, errors }
}

export function ensurePassword(pw: string) {
  const res = validatePassword(pw)
  if (!res.valid) throw new Error(res.errors.join(" "))
}

export function scorePassword(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: PasswordStrengthLabel } {
  if (!pw) return { score: 0, label: "Weak" }

  let score: 0 | 1 | 2 | 3 | 4 = 0
  if (pw.length >= 8) score = (score + 1) as any
  if (hasLower(pw) && hasUpper(pw)) score = (score + 1) as any
  if (hasNumber(pw)) score = (score + 1) as any
  if (hasSpecial(pw)) score = (score + 1) as any

  const label: PasswordStrengthLabel =
    score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : "Strong"

  return { score, label }
}

