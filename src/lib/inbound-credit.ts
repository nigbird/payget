import crypto from "crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishPaymentEvent } from "@/lib/payment-events"

/**
 * Credits to a merchant that did not start in this system — a customer
 * scanning another bank's or wallet's QR, or transferring directly — reported
 * to us by core banking via POST /api/inbound/credit ("SoundBox" notices).
 *
 * normalizeInboundCredit() is the only place that knows core banking's wire
 * format; the rest of the flow works on the normalized InboundCredit.
 *
 * Core banking's notice:
 *   {
 *     "institution": "NIB",
 *     "merchantId": "MERCH-992211",          // our Merchant.id, from the exported account CSV
 *     "mobileNumber": "0911223344",
 *     "transactionId": "TXN-20260820-1001",  // unique per credit — our idempotency key
 *     "reference": "REF-77665544",
 *     "status": "SUCCESS",
 *     "message": "SoundBox Payment Completed",
 *     "amount": 2550.75,
 *     "currency": "ETB",
 *     "timestamp": "2026-08-20T09:15:30Z",
 *     "additionalData": { "bankCode": "AWB", "qrBillId": "BILL-5544", "debitAccountNumber": "1000123456789" }
 *   }
 */

export type InboundCredit = {
  /** Core banking's unique id for this credit; a repeat is the same payment. */
  transactionId: string
  /** Core banking's secondary reference, kept for reconciliation. */
  reference: string | null
  /** Our Merchant.id, as core banking holds it from the exported account list. */
  merchantId: string
  /** Core banking's status; only SUCCESS is recorded and announced. */
  status: string
  amount: number
  currency: string
  /** Whose number this is (payer or merchant) is unconfirmed, so it is stored
   * for reference only and not shown as the payer's phone. */
  mobileNumber: string | null
  institution: string | null
  message: string | null
  /** Payer's bank code, e.g. "AWB". */
  payerBankCode: string | null
  payerAccount: string | null
  qrBillId: string | null
  /** When core banking completed the payment; defaults to receipt time. */
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

  const transactionId = str(body.transactionId, 64)
  if (!transactionId) errors.transactionId = "transactionId is required."

  const merchantId = str(body.merchantId, 64)
  if (!merchantId) errors.merchantId = "merchantId is required."

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

  const extra = body.additionalData && typeof body.additionalData === "object" ? body.additionalData : {}

  return {
    credit: {
      transactionId: transactionId!,
      reference: str(body.reference, 64),
      merchantId: merchantId!,
      status: status!.toUpperCase(),
      amount: Math.round((amount as number) * 100) / 100,
      currency: (str(body.currency, 3) ?? "ETB").toUpperCase(),
      mobileNumber: str(body.mobileNumber, 20),
      institution: str(body.institution, 20),
      message: str(body.message, 200),
      payerBankCode: str(extra.bankCode, 20),
      payerAccount: str(extra.debitAccountNumber, 40),
      qrBillId: str(extra.qrBillId, 64),
      postedAt,
    },
  }
}

export type InboundCreditResult =
  | { status: "recorded"; transactionId: string; merchantId: string }
  | { status: "duplicate"; transactionId: string; merchantId: string }
  /** Credit is the settlement of a payment this system initiated. */
  | { status: "matched_internal"; transactionId: string; merchantId: string }
  /** A non-SUCCESS notice: acknowledged, nothing recorded or announced. */
  | { status: "ignored"; reason: string }
  | { status: "unknown_merchant" }

function announce(merchantId: string, transactionId: string, credit: InboundCredit) {
  publishPaymentEvent({
    type: "payment",
    merchantId,
    transactionId,
    amount: credit.amount,
    currency: credit.currency,
    payerName: null,
    channel: credit.payerBankCode,
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

  // Core banking may also report payments this system started. Those already
  // have a Transaction (settled against its receipt number); announce the
  // money but don't record it a second time.
  const receiptCandidates = [credit.transactionId, credit.reference].filter((r): r is string => !!r)
  const internal = await prisma.transaction.findFirst({
    where: { cbsreference: { in: receiptCandidates } },
    select: { id: true, merchantId: true },
  })
  if (internal) {
    announce(internal.merchantId, internal.id, credit)
    return { status: "matched_internal", transactionId: internal.id, merchantId: internal.merchantId }
  }

  const merchant = await prisma.merchant.findFirst({
    where: { id: credit.merchantId, status: { in: ["ACTIVE", "APPROVED"] } },
    select: { id: true },
  })
  if (!merchant) return { status: "unknown_merchant" }

  const merchantId = merchant.id
  const transactionId = `ext_${crypto.randomUUID()}`

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
        description: credit.message ?? "Payment received",
        serviceDescription: credit.payerBankCode
          ? `External payment (${credit.payerBankCode})`
          : "External payment",
        transactionReference: `ext_${credit.transactionId}`,
        payerAccount: credit.payerAccount,
        timestamp: credit.postedAt,
        transactionTimestamp: credit.postedAt,
        paymentMethod: "BANK",
        userCredentials: {
          phone: "",
          authToken: "",
          // Groups these under their own initiator in the Transactions page's per-user totals.
          initiatedById: "external",
          initiatedByName: "External payment",
          external: {
            reference: credit.reference,
            institution: credit.institution,
            mobileNumber: credit.mobileNumber,
            payerBankCode: credit.payerBankCode,
            qrBillId: credit.qrBillId,
            currency: credit.currency,
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
