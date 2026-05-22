import { normalizePhoneNumber } from "@/lib/utils"

/** Normalize customer phone for eligibility matching and storage. */
export function normalizeCashbackPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null
  try {
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 9) return null
    return normalizePhoneNumber(phone)
  } catch {
    return null
  }
}
