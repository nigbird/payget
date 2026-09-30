import { NextResponse } from "next/server"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/audit-log"
import { normalizeInboundCredit, recordInboundCredit } from "@/lib/inbound-credit"

/**
 * Core banking → us: "this merchant account was just credited".
 *
 * Records the credit as an EXTERNAL transaction and announces it on the
 * merchant's sound devices. Idempotent on `transactionId`, so core banking can
 * safely retry until it gets a 2xx.
 *
 * Auth: `Authorization: Bearer <INBOUND_CREDIT_TOKEN>`. Restrict the source
 * IPs at the reverse proxy as well — this endpoint creates money records.
 */
export async function POST(request: Request) {
  const expectedToken = process.env.INBOUND_CREDIT_TOKEN?.trim()
  if (!expectedToken) {
    console.error("[INBOUND-CREDIT] INBOUND_CREDIT_TOKEN is not configured")
    return NextResponse.json({ error: "Service misconfigured" }, { status: 503 })
  }

  const authHeader = request.headers.get("authorization")
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null
  const tokenValid =
    bearer !== null &&
    bearer.length === expectedToken.length &&
    crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(expectedToken))
  if (!tokenValid) {
    await writeAuditLog({
      request,
      userId: null,
      action: "INBOUND_CREDIT",
      entityType: "TRANSACTION",
      entityId: null,
      newValue: { result: "failed", reason: "UNAUTHORIZED" },
    })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { credit, errors } = normalizeInboundCredit(body)
  if (!credit) {
    return NextResponse.json({ error: "Validation failed", errors }, { status: 400 })
  }

  try {
    const result = await recordInboundCredit(credit)

    await writeAuditLog({
      request,
      userId: null,
      action: "INBOUND_CREDIT",
      entityType: "TRANSACTION",
      entityId: "transactionId" in result ? result.transactionId : null,
      newValue: {
        result: result.status,
        coreTransactionId: credit.transactionId,
        reference: credit.reference,
        merchantId: credit.merchantId,
        coreStatus: credit.status,
        amount: credit.amount,
        currency: credit.currency,
        payerBankCode: credit.payerBankCode,
      },
    })

    switch (result.status) {
      case "recorded":
        return NextResponse.json(result, { status: 201 })
      case "duplicate":
      case "matched_internal":
      case "ignored":
        return NextResponse.json(result, { status: 200 })
      case "unknown_merchant":
        return NextResponse.json(
          { status: result.status, error: "No active merchant with this merchantId" },
          { status: 404 }
        )
    }
  } catch (err) {
    console.error("[INBOUND-CREDIT] Failed to record credit %s:", credit.transactionId, err)
    return NextResponse.json({ error: "Failed to record credit" }, { status: 500 })
  }
}
