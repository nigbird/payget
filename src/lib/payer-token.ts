import crypto from "crypto"
import { canAccessMerchant, requireAuthUser } from "@/lib/request-auth"

/**
 * Capability for the anonymous payer of one transaction.
 *
 * The customer pages (QR checkout, payment link) have no login, yet need to
 * poll status, show the result and fetch the receipt. Transaction ids are not
 * secrets (merchant-chosen for API payments), so knowing an id must not be
 * enough to read someone's payment. The token is an HMAC of the id, handed out
 * only to whoever started the payment (QR checkout response) or holds the
 * payment link (/api/payments/resolve), and checked on those read endpoints.
 */
const HEADER = "x-payer-token"

function secret() {
  const s = process.env.PAYER_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET
  if (!s) throw new Error("Missing PAYER_TOKEN_SECRET / ACCESS_TOKEN_SECRET")
  return s
}

export function issuePayerToken(transactionId: string): string {
  return crypto.createHmac("sha256", secret()).update(`payer-access:${transactionId}`).digest("base64url")
}

export function verifyPayerToken(transactionId: string, token: unknown): boolean {
  if (typeof token !== "string" || !token) return false
  const expected = Buffer.from(issuePayerToken(transactionId))
  const given = Buffer.from(token)
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

/**
 * Whether this request may read transaction `tx`: either it carries the
 * payer token (header, or `bodyToken` for POST bodies), or it is a logged-in
 * user who can access the transaction's merchant.
 */
export async function canReadTransaction(
  request: Request,
  tx: { id: string; merchantId: string },
  bodyToken?: unknown
): Promise<boolean> {
  if (verifyPayerToken(tx.id, request.headers.get(HEADER) ?? bodyToken)) return true
  const user = await requireAuthUser(request)
  return !!user && canAccessMerchant(user, tx.merchantId)
}

export const PAYER_TOKEN_HEADER = HEADER
