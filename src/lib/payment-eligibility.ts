import { prisma } from "@/lib/prisma"
import { normalizeCashbackPhone } from "@/lib/cashback/phone"

export type PaymentEligibilityResult =
  | { eligible: true }
  | { eligible: false; error: string }

/**
 * Opt-in gate: a merchant with zero approved PaymentEligibleCustomer rows has
 * never used this feature, so everyone remains payable (no behavior change).
 * Once a merchant has at least one approved entry, only listed phones qualify.
 */
export async function checkPaymentEligibility(
  merchantId: string,
  rawPhone: string
): Promise<PaymentEligibilityResult> {
  const total = await prisma.paymentEligibleCustomer.count({ where: { merchantId } })
  if (total === 0) return { eligible: true }

  const phone = normalizeCashbackPhone(rawPhone)
  if (!phone) {
    return { eligible: false, error: "This customer is not on your approved eligible customers list." }
  }

  const match = await prisma.paymentEligibleCustomer.findUnique({
    where: { merchantId_phone: { merchantId, phone } },
  })

  if (!match) {
    return { eligible: false, error: "This customer is not on your approved eligible customers list." }
  }

  return { eligible: true }
}
