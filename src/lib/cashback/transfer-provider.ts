/**
 * Transfer provider for subsidiary debit + customer credit via the merchant refund API.
 */

import { createMerchantRefundTransferProvider } from "./merchant-refund-provider"

export type CashbackTransferRequest = {
  merchantId: string
  paymentTransactionId: string
  subsidiaryAccountNumber: string
  customerAccount: string | null
  customerPhone: string | null
  cashbackAmount: number
  currency?: string
}

export type CashbackTransferResult = {
  success: boolean
  debitRef?: string
  creditRef?: string
  error?: string
}

export interface CashbackTransferProvider {
  executeTransfer(request: CashbackTransferRequest): Promise<CashbackTransferResult>
}

class UnconfiguredRefundTransferProvider implements CashbackTransferProvider {
  async executeTransfer(): Promise<CashbackTransferResult> {
    return {
      success: false,
      error:
        "Merchant refund API is not configured. Set MERCHANT_REFUND_BASE_URL, MERCHANT_REFUND_USERNAME, and MERCHANT_REFUND_PASSWORD.",
    }
  }
}

let provider: CashbackTransferProvider =
  createMerchantRefundTransferProvider() ?? new UnconfiguredRefundTransferProvider()

export function getCashbackTransferProvider(): CashbackTransferProvider {
  return provider
}

export function setCashbackTransferProvider(next: CashbackTransferProvider) {
  provider = next
}
