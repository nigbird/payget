import { safeJsonParse } from "@/lib/json-utils"
import type { CashbackTransferProvider, CashbackTransferRequest, CashbackTransferResult } from "./transfer-provider"

export type MerchantRefundResponse = {
  status?: string
  transactionId?: string
  message?: string
  debitAmount?: string
  debitAccount?: string
  creditAccount?: string
  debitAcctNumber?: string
  creditAcctNumber?: string
  status_code?: number
  statusCode?: number
}

export type MerchantRefundProviderConfig = {
  baseUrl: string
  username: string
  password: string
}

function normalizeAccount(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const digits = value.replace(/\D/g, "")
  return digits || null
}

function resolveConfig(): MerchantRefundProviderConfig | null {
  const baseUrl = process.env.MERCHANT_REFUND_BASE_URL?.trim() || process.env.PROVIDER_BASE_URL?.trim()
  const username = process.env.MERCHANT_REFUND_USERNAME?.trim() || process.env.PROVIDER_USERNAME?.trim()
  const password = process.env.MERCHANT_REFUND_PASSWORD?.trim() || process.env.PROVIDER_PASSWORD?.trim()

  if (!baseUrl || !username || !password) return null
  return { baseUrl: baseUrl.replace(/\/$/, ""), username, password }
}

/**
 * Calls POST /api/v1/merchant/refund to debit the merchant subsidiary account
 * and credit the customer account resolved from the original push payment.
 */
export class MerchantRefundTransferProvider implements CashbackTransferProvider {
  constructor(private readonly config: MerchantRefundProviderConfig) {}

  async executeTransfer(request: CashbackTransferRequest): Promise<CashbackTransferResult> {
    const debitAccount = request.subsidiaryAccountNumber?.trim() || null
    if (!debitAccount) {
      return {
        success: false,
        error: "Subsidiary funding account is required for cashback refund.",
      }
    }

    const creditAccount = normalizeAccount(request.customerAccount)
    if (!creditAccount) {
      return {
        success: false,
        error: "Customer account is required for cashback refund.",
      }
    }

    if (!Number.isFinite(request.cashbackAmount) || request.cashbackAmount <= 0) {
      return {
        success: false,
        error: "Cashback amount must be greater than zero.",
      }
    }

    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")
    const url = `${this.config.baseUrl}/api/v1/merchant/refund`
    const body = {
      debitAcctNumber: debitAccount,
      creditAcctNumber: creditAccount,
      amount: request.cashbackAmount,
    }

    console.log("[MerchantRefundProvider] Request:", { url, body })

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(body),
      })

      const text = await response.text()
      console.log("[MerchantRefundProvider] Response:", { status: response.status, body: text })
      let data: MerchantRefundResponse
      try {
        data = safeJsonParse(text)
      } catch {
        return {
          success: false,
          error: `Invalid refund provider response (${response.status}).`,
        }
      }

      const status = String(data.status ?? "").toLowerCase()
      const providerStatusCode = data.status_code ?? data.statusCode

      if (response.ok && status === "success") {
        const transferRef = data.transactionId?.trim()
        return {
          success: true,
          debitRef: transferRef ?? data.debitAcctNumber ?? data.debitAccount ?? undefined,
          creditRef: transferRef ?? data.creditAcctNumber ?? data.creditAccount ?? undefined,
        }
      }

      const message =
        data.message?.trim() ||
        (providerStatusCode != null ? `Refund failed with status code ${providerStatusCode}` : "Refund failed.")

      return {
        success: false,
        error: message,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Refund request failed."
      return { success: false, error: message }
    }
  }
}

export function createMerchantRefundTransferProvider(): CashbackTransferProvider | null {
  const config = resolveConfig()
  if (!config) return null
  return new MerchantRefundTransferProvider(config)
}
