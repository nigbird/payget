/**
 * Pluggable transfer provider for subsidiary debit + customer credit.
 * Replace StubCashbackTransferProvider when core banking APIs are available.
 */

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
  simulated?: boolean
}

export interface CashbackTransferProvider {
  executeTransfer(request: CashbackTransferRequest): Promise<CashbackTransferResult>
}

export class StubCashbackTransferProvider implements CashbackTransferProvider {
  async executeTransfer(request: CashbackTransferRequest): Promise<CashbackTransferResult> {
    const debitRef = `STUB-DEBIT-${request.paymentTransactionId}`
    const creditRef = `STUB-CREDIT-${request.paymentTransactionId}`

    return {
      success: true,
      debitRef,
      creditRef,
      simulated: true,
    }
  }
}

let provider: CashbackTransferProvider = new StubCashbackTransferProvider()

export function getCashbackTransferProvider(): CashbackTransferProvider {
  return provider
}

export function setCashbackTransferProvider(next: CashbackTransferProvider) {
  provider = next
}
