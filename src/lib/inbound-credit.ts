import crypto from "crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishPaymentEvent } from "@/lib/payment-events"

/**
 * Credits to a merchant's account that did not start in this system — a
 * customer scanning another bank's or wallet's QR, or transferring directly —
 * reported to us by core banking via POST /api/inbound/credit.
 *
 * The request shape below is our proposed contract; core banking's real
 * notification format is not wired up yet. When it is, adapt
 * normalizeInboundCredit() to it — the rest of the flow works on the
 * normalized InboundCredit and should not need to change.
 */

export type InboundCredit = {
  /** Core banking's unique reference for this credit (FT number or similar). */
  reference: string
  /** The credited account — how the credit is matched to a merchant. */
  accountNumber: string
  amount: number
  currency: string
  payerName: string | null
  payerAccount: string | null
  payerPhone: string | null
  payerBank: string | null
  /** How the money arrived, e.g. "IPS", "EthSwitch QR", "Telebirr", "Transfer". */
  channel: string | null
  narration: string | null
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

  const reference = str(body.reference ?? body.ftNumber ?? body.cbsreference ?? body.transactionId, 64)
  if (!reference) errors.reference = "reference is required."

  const accountNumber = str(body.accountNumber ?? body.creditAccount, 32)
  if (!accountNumber) errors.accountNumber = "accountNumber is required."

  const amount = typeof body.amount === "string" ? Number(body.amount) : body.amount
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    errors.amount = "amount must be a number greater than 0."
  }

  let postedAt = new Date()
  const rawPostedAt = body.postedAt ?? body.transactionTime
  if (rawPostedAt !== undefined && rawPostedAt !== null && rawPostedAt !== "") {
    const parsed = new Date(rawPostedAt)
    if (Number.isNaN(parsed.getTime())) errors.postedAt = "postedAt must be an ISO-8601 date-time."
    else postedAt = parsed
  }

  if (Object.keys(errors).length > 0) return { errors }

  return {
    credit: {
      reference: reference!,
      accountNumber: accountNumber!,
      amount: Math.round((amount as number) * 100) / 100,
      currency: (str(body.currency, 3) ?? "ETB").toUpperCase(),
      payerName: str(body.payerName, 120),
      payerAccount: str(body.payerAccount, 40),
      payerPhone: str(body.payerPhone, 20),
      payerBank: str(body.payerBank, 80),
      channel: str(body.channel, 40),
      narration: str(body.narration, 200),
      postedAt,
    },
  }
}

export type InboundCreditResult =
  | { status: "recorded"; transactionId: string; merchantId: string }
  | { status: "duplicate"; transactionId: string; merchantId: string }
  /** Credit is the settlement of a payment this system initiated. */
  | { status: "matched_internal"; transactionId: string; merchantId: string }
  | { status: "unknown_account" }
  | { status: "ambiguous_account"; merchantCount: number }

function announce(merchantId: string, transactionId: string, credit: InboundCredit) {
  publishPaymentEvent({
    type: "payment",
    merchantId,
    transactionId,
    amount: credit.amount,
    currency: credit.currency,
    payerName: credit.payerName,
    channel: credit.channel,
    reference: credit.reference,
    occurredAt: new Date().toISOString(),
  })
}

export async function recordInboundCredit(credit: InboundCredit): Promise<InboundCreditResult> {
  // Replayed notice: already recorded and announced once — never ring twice.
  const existing = await prisma.transaction.findUnique({
    where: { externalReference: credit.reference },
    select: { id: true, merchantId: true },
  })
  if (existing) {
    return { status: "duplicate", transactionId: existing.id, merchantId: existing.merchantId }
  }

  // Core banking may report every credit to the account, including ones that
  // settle payments this system started. Those already have a Transaction;
  // announce the money but don't record it a second time.
  const internal = await prisma.transaction.findUnique({
    where: { cbsreference: credit.reference },
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
  const description = credit.narration ?? `Payment received${credit.payerName ? ` from ${credit.payerName}` : ""}`

  try {
    await prisma.transaction.create({
      data: {
        id: transactionId,
        merchantId,
        amount: credit.amount,
        status: "SUCCESS",
        origin: "EXTERNAL",
        externalReference: credit.reference,
        // Initiation-only fields: an external credit has no callback, provider
        // session or initiator. Kept non-null so existing readers of these
        // columns don't have to special-case external rows.
        callbackUrl: "",
        description,
        serviceDescription: credit.channel ? `External payment (${credit.channel})` : "External payment",
        transactionReference: `ext_${credit.reference}`,
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
            payerName: credit.payerName,
            payerBank: credit.payerBank,
            channel: credit.channel,
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
        where: { externalReference: credit.reference },
        select: { id: true, merchantId: true },
      })
      if (winner) return { status: "duplicate", transactionId: winner.id, merchantId: winner.merchantId }
    }
    throw err
  }

  announce(merchantId, transactionId, credit)
  return { status: "recorded", transactionId, merchantId }
}
