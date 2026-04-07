export type MerchantOnboardingAssistantInput = {
  name?: string
  description?: string
  businessDescription?: string
  websiteUrl?: string
}

export type MerchantOnboardingAssistantResult = {
  suggestedCategory?: string
  suggestedBusinessType?: string
  refinedDescription?: string
  potentialRiskFactors?: string[]
  prefilledFields: {
    companyName?: string
    businessType?: string
  }
  suggestedCategories: string[]
  riskFactors: string[]
}

function safeLower(value: string | undefined) {
  return (value ?? "").toLowerCase()
}

function pickCategory(text: string): string | undefined {
  if (/(game|gaming|casino|bet|wager)/.test(text)) return "Gaming"
  if (/(school|course|tuition|academy|education)/.test(text)) return "Education"
  if (/(shop|store|retail|pos|inventory)/.test(text)) return "Retail"
  if (/(service|consult|agency|logistics|delivery)/.test(text)) return "Services"
  if (/(e-?commerce|online|marketplace|checkout)/.test(text)) return "E-commerce"
  return undefined
}

function pickBusinessType(text: string): string | undefined {
  if (/(sole|proprietor)/.test(text)) return "Sole Proprietorship"
  if (/(partnership|llp)/.test(text)) return "Partnership"
  if (/(public limited|plc)/.test(text)) return "Public Limited"
  if (/(private limited|ltd)/.test(text)) return "Private Limited"
  return undefined
}

function inferRiskFactors(text: string): string[] {
  const risks: string[] = []
  if (/(adult|porn|xxx)/.test(text)) risks.push("Adult content")
  if (/(crypto|bitcoin|blockchain|token)/.test(text)) risks.push("Crypto-related")
  if (/(casino|bet|wager|gambl)/.test(text)) risks.push("Gambling")
  if (/(chargeback|refund)/.test(text)) risks.push("High refund / chargeback mention")
  return risks
}

/**
 * Lightweight, deterministic “assistant” used when no AI backend is configured.
 * Keeps UX intact while avoiding build-time missing symbol errors.
 */
export async function aiMerchantOnboardingAssistant(
  input: MerchantOnboardingAssistantInput
): Promise<MerchantOnboardingAssistantResult> {
  const raw = [
    input.name,
    input.description,
    input.businessDescription,
    input.websiteUrl,
  ]
    .filter(Boolean)
    .join(" ")

  const text = safeLower(raw)

  const category = pickCategory(text)
  const businessType = pickBusinessType(text)
  const risks = inferRiskFactors(text)

  return {
    suggestedCategory: category,
    suggestedBusinessType: businessType,
    refinedDescription: input.businessDescription || input.description,
    potentialRiskFactors: risks,
    prefilledFields: {
      companyName: input.name,
      businessType,
    },
    suggestedCategories: category ? [category] : [],
    riskFactors: risks,
  }
}

