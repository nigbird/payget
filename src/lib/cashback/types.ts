import type { CashbackMode, CashbackProcessingStatus } from "@prisma/client"

export type CashbackRuleInput = {
  percent: number
  minTransactionAmount?: number | null
  maxCashbackAmount?: number | null
  transactionThreshold?: number | null
}

export type CashbackEvaluationContext = {
  paymentAmount: number
  customerPhone: string | null
  customerAccount: string | null
}

export type CashbackEvaluationResult =
  | {
      eligible: true
      percent: number
      categoryId: string | null
      categoryName: string | null
      ruleSource: "ALL_CUSTOMERS" | "CATEGORY"
    }
  | {
      eligible: false
      reason: string
    }

export type CashbackConfigDto = {
  id: string
  merchantId: string
  enabled: boolean
  mode: CashbackMode
  subsidiaryAccountNumber: string | null
  allCustomersPercent: number | null
  allCustomersMinAmount: number | null
  allCustomersMaxCashback: number | null
  allCustomersThreshold: number | null
  categories: CashbackCategoryDto[]
  createdAt: string
  updatedAt: string
}

export type CashbackCategoryDto = {
  id: string
  name: string
  description: string | null
  percent: number
  minTransactionAmount: number
  maxCashbackAmount: number | null
  transactionThreshold: number | null
  sortOrder: number
  isActive: boolean
  eligibleCount: number
}

export type CashbackEligibleCustomerDto = {
  id: string
  phone: string
  accountNumber: string | null
  categoryId: string
  categoryName: string
  importedAt: string
}

export type CashbackTransactionDto = {
  id: string
  paymentTransactionId: string
  customerPhone: string | null
  customerAccount: string | null
  paymentAmount: number
  cashbackAmount: number
  cashbackPercent: number
  status: CashbackProcessingStatus
  skipReason: string | null
  failureReason: string | null
  categoryName: string | null
  providerDebitRef: string | null
  providerCreditRef: string | null
  processedAt: string | null
  createdAt: string
}

export type CashbackLogDto = {
  id: string
  level: string
  message: string
  metadata: unknown
  createdAt: string
}
