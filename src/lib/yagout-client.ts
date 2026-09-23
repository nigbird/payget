import { db } from "@/lib/db"
import { withMerchantSecret } from "@/lib/merchant-secret"
import { YAGOUT_AGGREGATOR_ID } from "@/lib/yagout-request"

/**
 * Resolves which YagoutPay account a payment is raised against.
 *
 * Unlike the card rail there is no client that calls out to the gateway: Yagout
 * rejects REST entirely for the hosted flow and accepts only a browser form
 * POST, so "the client" is just credentials plus the URL the form targets.
 */

const DEFAULT_UAT_POST_URL =
  "https://uatcheckout.yagoutpay.com/ms-transaction-core-1-0/paymentRedirection/checksumGatewayPage"

export type YagoutConfig = {
  aggregatorId: string
  meId: string
  /** Base64 AES-256 key, decrypted and ready to use. */
  encryptionKey: string
  postUrl: string
}

/** The platform-wide Yagout account, for merchants without their own. */
export function resolveYagoutConfig(): YagoutConfig {
  const meId = process.env.YAGOUTPAY_MERCHANT_ID?.trim()
  const encryptionKey = process.env.YAGOUTPAY_ENCRYPTION_KEY?.trim()

  if (!meId || !encryptionKey) {
    throw new Error(
      "Yagout credentials not configured (YAGOUTPAY_MERCHANT_ID, YAGOUTPAY_ENCRYPTION_KEY)",
    )
  }

  return {
    aggregatorId: process.env.YAGOUTPAY_AGGREGATOR_ID?.trim() || YAGOUT_AGGREGATOR_ID,
    meId,
    encryptionKey,
    postUrl: process.env.YAGOUTPAY_POST_URL?.trim() || DEFAULT_UAT_POST_URL,
  }
}

/**
 * This merchant's own Yagout profile if they have one, otherwise the
 * platform-wide account. Throws when neither is configured, which callers
 * surface as a 503 rather than letting an unconfigured merchant reach the
 * gateway and fail there.
 */
export async function resolveYagoutConfigForMerchant(
  merchantId: string,
): Promise<YagoutConfig> {
  const stored = await db.getMerchantYagoutCredentials(merchantId)

  if (stored?.yagoutMeId && stored?.yagoutEncryptionKey) {
    const encryptionKey = withMerchantSecret(
      stored.yagoutEncryptionKey,
      (plaintext) => plaintext,
    )

    return {
      aggregatorId: process.env.YAGOUTPAY_AGGREGATOR_ID?.trim() || YAGOUT_AGGREGATOR_ID,
      meId: stored.yagoutMeId.trim(),
      encryptionKey,
      postUrl:
        stored.yagoutPostUrl?.trim() ||
        process.env.YAGOUTPAY_POST_URL?.trim() ||
        DEFAULT_UAT_POST_URL,
    }
  }

  return resolveYagoutConfig()
}

/**
 * Finds the key that decrypts a return post, given only the me_id it arrived
 * with — the one field Yagout sends in plain text.
 *
 * Both directions have to work. A merchant with their own Yagout profile posts
 * back under their own me_id; a merchant falling back to the platform account
 * posts back under the platform's, and no Merchant row carries that value, so
 * looking only in the database would reject every payment made through the
 * shared account.
 */
export async function resolveYagoutKeyForMeId(
  meId: string,
): Promise<{ encryptionKey: string; merchantId: string | null } | null> {
  const trimmed = meId.trim()
  if (!trimmed) return null

  const platformMeId = process.env.YAGOUTPAY_MERCHANT_ID?.trim()
  const platformKey = process.env.YAGOUTPAY_ENCRYPTION_KEY?.trim()

  if (platformMeId && platformKey && trimmed === platformMeId) {
    return { encryptionKey: platformKey, merchantId: null }
  }

  const merchant = await db.findMerchantByYagoutMeId(trimmed)
  if (!merchant?.yagoutEncryptionKey) return null

  return {
    encryptionKey: withMerchantSecret(merchant.yagoutEncryptionKey, (plaintext) => plaintext),
    merchantId: merchant.id,
  }
}

/**
 * Yagout restricts return URLs to letters, digits, "/" and "_" (document page
 * 5), so they cannot carry a query string and cannot carry the opaque token the
 * card rail appends. Both outcomes therefore post to fixed paths and are
 * correlated by the order_no inside the response instead.
 */
export function yagoutReturnUrls(baseUrl: string): { successUrl: string; failureUrl: string } {
  const root = baseUrl.replace(/\/$/, "")
  return {
    successUrl: `${root}/api/payments/yagout/return/success`,
    failureUrl: `${root}/api/payments/yagout/return/failure`,
  }
}
