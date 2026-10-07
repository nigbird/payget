import crypto from "crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishPaymentEvent } from "@/lib/payment-events"

/**
 * Credits to a merchant's account that did not start in this system — a
 * customer scanning another bank's or wallet's QR, or transferring directly —
 * reported to us by core banking via POST /api/inbound/credit.
 *
 * Core banking's notification format:
 *
 *   {
 *     "institution": "Commercial Bank of Ethiopia",   // payer's bank
 *     "merchantId": "7000100425047",                  // the credited merchant ACCOUNT
 *                                                     // number, from our exported CSV
 *     "mobileNumber": "+251911223344",                // payer's phone
 *     "transactionId": "TXN-2026-1007-001",           // unique per credit — our repeat key
 *     "reference": "REF-ABC123XYZ",
 *     "status": "SUCCESS",                            // only SUCCESS is recorded
 *     "message": "Payment completed successfully",
 *     "amount": 1500.00,
 *     "currency": "ETB",
 *     "timestamp": "2026-10-07T10:13:00Z",
 *     "additionalData": {
 *       "bankCode": "CBE-01",
 *       "qrBillId": "QR-BILL-554433",
 *       "debitAccountNumber": "1000123456789"         // payer's account
 *     }
 *   }
 *
 * Despite its name, `merchantId` carries the credited account number, not our
 * Merchant.id. normalizeInboundCredit() maps this shape onto InboundCredit;
 * the rest of the flow works on InboundCredit only.
 */

export type InboundCredit = {
  /** Core banking's transactionId — unique per credit; a repeat is recorded and announced once. */
  transactionId: string
  /** Core banking's own reference, kept for reconciliation. */
  coreReference: string | null
  /** The credited account — how the credit is matched to a merchant. */
  accountNumber: string
  /** Core banking's status, upper-cased. Only SUCCESS is recorded and announced. */
  status: string
  amount: number
  currency: string
  payerPhone: string | null
  payerAccount: string | null
  /** Payer's bank name (`institution`). */
  payerBank: string | null
  payerBankCode: string | null
  qrBillId: string | null
  message: string | null
  /** When core banking posted the credit; defaults to receipt time. */
  postedAt: Date
}

function str(value: unknown, maxLength: number): string | null {
  if (typeof value === "number" && Number.isFinite(value)) value = String(value)
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

export function normalizeInboundCredit(
  body: any
): { credit: InboundCredit; errors?: never } | { credit?: never; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  if (!body || typeof body !== "object") {
    return { errors: { body: "Expected a JSON object." } }
  }
  const extra = body.additionalData && typeof body.additionalData === "object" ? body.additionalData : {}

  const transactionId = str(body.transactionId, 64)
  if (!transactionId) errors.transactionId = "transactionId is required."

  const accountNumber = str(body.merchantId, 32)
  if (!accountNumber) errors.merchantId = "merchantId (the merchant's account number) is required."

  const status = str(body.status, 32)
  if (!status) errors.status = "status is required."

  const amount = typeof body.amount === "string" ? Number(body.amount) : body.amount
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    errors.amount = "amount must be a number greater than 0."
  }

  let postedAt = new Date()
  if (body.timestamp !== undefined && body.timestamp !== null && body.timestamp !== "") {
    const parsed = new Date(body.timestamp)
    if (Number.isNaN(parsed.getTime())) errors.timestamp = "timestamp must be an ISO-8601 date-time."
    else postedAt = parsed
  }

  if (Object.keys(errors).length > 0) return { errors }

  return {
    credit: {
      transactionId: transactionId!,
      coreReference: str(body.reference, 64),
      accountNumber: accountNumber!,
      status: status!.toUpperCase(),
      amount: Math.round((amount as number) * 100) / 100,
      currency: (str(body.currency, 3) ?? "ETB").toUpperCase(),
      payerPhone: str(body.mobileNumber, 20),
      payerAccount: str(extra.debitAccountNumber, 40),
      payerBank: str(body.institution, 80),
      payerBankCode: str(extra.bankCode, 20),
      qrBillId: str(extra.qrBillId, 64),
      message: str(body.message, 200),
      postedAt,
    },
  }
}

export type InboundCreditResult =
  | { status: "recorded"; transactionId: string; merchantId: string }
  | { status: "duplicate"; transactionId: string; merchantId: string }
  /** Credit is the settlement of a payment this system initiated. */
  | { status: "matched_internal"; transactionId: string; merchantId: string }
  /** Not a completed credit (e.g. status FAILED); acknowledged, not recorded. */
  | { status: "ignored"; reason: string }
  | { status: "unknown_account" }
  | { status: "ambiguous_account"; merchantCount: number }

function announce(merchantId: string, transactionId: string, credit: InboundCredit) {
  publishPaymentEvent({
    type: "payment",
    merchantId,
    transactionId,
    amount: credit.amount,
    currency: credit.currency,
    payerName: null,
    // Shown beside the amount on the speaker: which bank the customer paid from.
    channel: credit.payerBank,
    reference: credit.transactionId,
    occurredAt: new Date().toISOString(),
  })
}

export async function recordInboundCredit(credit: InboundCredit): Promise<InboundCreditResult> {
  if (credit.status !== "SUCCESS") {
    return { status: "ignored", reason: `status ${credit.status}` }
  }

  // Replayed notice: already recorded and announced once — never ring twice.
  const existing = await prisma.transaction.findUnique({
    where: { externalReference: credit.transactionId },
    select: { id: true, merchantId: true },
  })
  if (existing) {
    return { status: "duplicate", transactionId: existing.id, merchantId: existing.merchantId }
  }

  // Core banking may report every credit to the account, including ones that
  // settle payments this system started. Those already have a Transaction;
  // announce the money but don't record it a second time.
  const receiptRefs = [credit.transactionId, credit.coreReference].filter((r): r is string => !!r)
  const internal = await prisma.transaction.findFirst({
    where: { cbsreference: { in: receiptRefs } },
    select: { id: true, merchantId: true },
  })
  if (internal) {
    announce(internal.merchantId, internal.id, credit)
    return { status: "matched_internal", transactionId: internal.id, merchantId: internal.merchantId }
  }

  const merchants = await prisma.merchant.findMany({
    where: { accountNumber: credit.accountNumber, status: { in: ["ACTIVE", "APPROVED"] } },
    select: { id: true },
  })
  if (merchants.length === 0) return { status: "unknown_account" }
  // Refuse to guess which merchant was paid; ops must fix the shared account.
  if (merchants.length > 1) return { status: "ambiguous_account", merchantCount: merchants.length }

  const merchantId = merchants[0].id
  const transactionId = `ext_${crypto.randomUUID()}`
  const description = credit.payerBank ? `Payment received from ${credit.payerBank}` : "Payment received"

  try {
    await prisma.transaction.create({
      data: {
        id: transactionId,
        merchantId,
        amount: credit.amount,
        status: "SUCCESS",
        origin: "EXTERNAL",
        externalReference: credit.transactionId,
        // Initiation-only fields: an external credit has no callback, provider
        // session or initiator. Kept non-null so existing readers of these
        // columns don't have to special-case external rows.
        callbackUrl: "",
        description,
        serviceDescription: credit.qrBillId ? "External payment (QR)" : "External payment",
        transactionReference: `ext_${credit.transactionId}`,
        payerPhone: credit.payerPhone,
        payerAccount: credit.payerAccount,
        timestamp: credit.postedAt,
        transactionTimestamp: credit.postedAt,
        paymentMethod: "BANK",
        userCredentials: {
          phone: credit.payerPhone ?? "",
          authToken: "",
          // Groups these under their own initiator in the Transactions page's per-user totals.
          initiatedById: "external",
          initiatedByName: "External payment",
          external: {
            coreTransactionId: credit.transactionId,
            coreReference: credit.coreReference,
            payerBank: credit.payerBank,
            payerBankCode: credit.payerBankCode,
            qrBillId: credit.qrBillId,
            message: credit.message,
            currency: credit.currency,
            creditedAccount: credit.accountNumber,
            receivedAt: new Date().toISOString(),
          },
        },
      },
    })
  } catch (err) {
    // Two copies of the same notice raced past the lookup above.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.transaction.findUnique({
        where: { externalReference: credit.transactionId },
        select: { id: true, merchantId: true },
      })
      if (winner) return { status: "duplicate", transactionId: winner.id, merchantId: winner.merchantId }
    }
    throw err
  }

  announce(merchantId, transactionId, credit)
  return { status: "recorded", transactionId, merchantId }
}
