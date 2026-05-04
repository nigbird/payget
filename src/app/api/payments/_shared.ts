import { z } from "zod"
import { db, type Merchant, type Transaction } from "@/app/lib/db"
import { encryptPayload, PaymentPayloadSchema, type PaymentPayload, decryptPayload } from "@/lib/jwe"
import { decryptMerchantSecretInMemory, encryptMerchantSecretAtRest, requiresRewrap } from "@/lib/merchant-secret"
import { auditSecurityEvent } from "@/lib/request-security"

export const PaymentInitiateSchema = z.object({
  merchantId: z.string().min(1),
  transactionId: z.string().min(1),
  userCredentials: z.object({
    phone: z.string().min(1),
    authToken: z.string().min(1),
  }),
  amount: z.number().finite().positive(),
  serviceDescription: z.string().min(1),
  timestamp: z.string().min(1),
  method: z.enum(["BANK", "TELEBIRR"]).default("BANK"),
  // Optional hint from merchant; gateway overwrites the final reference.
  transactionReferenceHint: z.string().optional(),
})

export type PaymentInitiate = z.infer<typeof PaymentInitiateSchema>

type InitiatedBy = {
  id: string
  name?: string | null
}

function getTodayDateKey(d: Date) {
  return d.toDateString()
}

function extractKidFromJwe(token: string): string | null {
  const parts = token.split(".")
  if (parts.length < 2) return null
  try {
    const headerB64 = parts[0]
    const headerJson = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"))
    return typeof headerJson.kid === "string" ? headerJson.kid : null
  } catch {
    return null
  }
}

export async function createGatewayTransactionAndToken(input: PaymentInitiate, options?: { initiatedBy?: InitiatedBy }) {
  const merchant = await db.getMerchantById(input.merchantId, { includeSecret: true })
  if (!merchant) return { ok: false as const, error: "Merchant not found" }
  if (merchant.status !== "approved" && merchant.status !== "active") return { ok: false as const, error: "Merchant account is not active" }

  // Amount limit checks (mirrors legacy /api/pay route semantics).
  if (input.amount > merchant.transactionLimit) {
    return { ok: false as const, error: "Transaction amount exceeds per-transaction limit", limit: merchant.transactionLimit }
  }

  const todayKey = getTodayDateKey(new Date())
  const merchantTxs = await db.getTransactionsByMerchant(input.merchantId)
  const todaysSuccess = merchantTxs
    .filter((tx) => getTodayDateKey(new Date(tx.timestamp)) === todayKey && tx.status === "success")

  const totalTodayAmount = todaysSuccess.reduce((acc, tx) => acc + tx.amount, 0)
  if (totalTodayAmount + input.amount > merchant.dailyLimit) {
    return { ok: false as const, error: "Daily processing amount limit reached", limit: merchant.dailyLimit }
  }

  if (todaysSuccess.length >= merchant.dailyCountLimit) {
    return { ok: false as const, error: "Daily transaction count limit reached", limit: merchant.dailyCountLimit }
  }

  // Create internal transaction record.
  const exists = await db.getTransactionById(input.transactionId)
  if (exists) return { ok: false as const, error: "Transaction ID already exists" }

  const transactionReference = `ref_${Math.random().toString(36).substr(2, 9)}`
  const createdAt = new Date().toISOString()
  const ttlMinutes = Number(process.env.PAYMENT_LINK_TTL_MINUTES ?? 10)
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString()

  const tx: Transaction = {
    id: input.transactionId,
    merchantId: input.merchantId,
    amount: input.amount,
    status: "initiated",
    callbackUrl: merchant.callbackUrl,
    description: input.serviceDescription,
    timestamp: input.timestamp,
    transactionReference,
    serviceDescription: input.serviceDescription,
    transactionTimestamp: input.timestamp,
    userCredentials: {
      phone: input.userCredentials.phone,
      authToken: input.userCredentials.authToken,
      initiatedById: options?.initiatedBy?.id,
      initiatedByName: options?.initiatedBy?.name ?? undefined,
      link: {
        expiresAt,
        status: "PENDING"
      }
    },
    paymentMethod: input.method || "BANK",
  }

  await db.addTransaction(tx)

  const payload: PaymentPayload = PaymentPayloadSchema.parse({
    merchantId: input.merchantId,
    transactionId: input.transactionId,
    userCredentials: input.userCredentials,
    amount: input.amount,
    serviceDescription: input.serviceDescription,
    timestamp: input.timestamp,
    transactionReference,
    status: "initiated",
    expiresAt,
    linkStatus: "PENDING",
  })

  const { plaintext: merchantSecret } = decryptMerchantSecretInMemory(merchant.jweSecret)
  const token = await encryptPayload(payload, merchantSecret, merchant.id)

  return {
    ok: true as const,
    merchant,
    tx,
    transactionReference,
    token,
    customerPinToken: token,
    createdAt,
  }
}

export async function resolveEncryptedToken(token: string) {
  const kid = extractKidFromJwe(token)
  if (!kid) return { ok: false as const, error: "Invalid token (missing key id)" }

  const merchant = await db.getMerchantById(kid, { includeSecret: true })
  if (!merchant) return { ok: false as const, error: "Merchant not found for token" }

  const { plaintext: merchantSecret } = decryptMerchantSecretInMemory(merchant.jweSecret)
  const payload = await decryptPayload(token, merchantSecret)

  if (requiresRewrap(merchant.jweSecret)) {
    try {
      const rewrapped = encryptMerchantSecretAtRest(merchantSecret)
      await db.updateMerchant(merchant.id, {
        jweSecret: rewrapped.ciphertext,
      })
      await auditSecurityEvent({
        action: "MERCHANT_SECRET_REWRAPPED",
        merchantId: merchant.id,
        detail: { reason: "encryption_format_upgrade" },
      })
    } catch {
    }
  }
  const tx = await db.getTransactionById(payload.transactionId)

  if (!tx || tx.merchantId !== payload.merchantId) {
    return { ok: false as const, error: "Transaction not found for token" }
  }

  if (tx.transactionReference !== payload.transactionReference) {
    return { ok: false as const, error: "Transaction reference mismatch" }
  }

  const linkMeta = (tx.userCredentials as any)?.link as { expiresAt?: string; status?: "PENDING" | "USED" | "EXPIRED" } | undefined
  const effectiveExpiresAt = linkMeta?.expiresAt ?? (payload as any)?.expiresAt
  const linkStatus = linkMeta?.status ?? (payload as any)?.linkStatus ?? "PENDING"

  if (tx.status === "success") {
    return { ok: false as const, error: "Payment already completed" }
  }

  if (tx.status === "failed") {
    return { ok: false as const, error: "Payment already failed and cannot be retried with this link" }
  }

  if (linkStatus === "USED") {
    return { ok: false as const, error: "Payment link already used" }
  }

  if (effectiveExpiresAt) {
    const now = Date.now()
    const expMs = Date.parse(effectiveExpiresAt)
    if (!Number.isNaN(expMs) && now > expMs) {
      try {
        await db.updateTransaction(tx.id, {
          userCredentials: {
            ...tx.userCredentials,
            link: { ...(linkMeta || {}), status: "EXPIRED", expiresAt: effectiveExpiresAt }
          }
        })
      } catch {}
      return { ok: false as const, error: "Payment link expired" }
    }
  }

  return {
    ok: true as const,
    merchant,
    payload,
    tx,
  }
}
