import { NextResponse } from "next/server"
import { decryptYagout } from "@/lib/yagout-crypto"
import { parseTxnResponse, parseResponsePgDetails } from "@/lib/yagout-request"
import { resolveYagoutKeyForMeId } from "@/lib/yagout-client"
import { settleYagoutFromReturn } from "@/lib/yagout-settlement"

/**
 * Where YagoutPay returns the customer after payment — /success or /failure.
 *
 * This is a form POST performed by the customer's own browser, not a
 * server-to-server webhook, which shapes everything here:
 *
 *  - It carries no query string. Yagout restricts return URLs to letters,
 *    digits, "/" and "_", so the outcome is in the path and the transaction is
 *    correlated by the order_no inside the encrypted body.
 *  - It is unauthenticated and attacker-reachable. Nothing is trusted until it
 *    decrypts with the merchant's own key, which is what makes the payload
 *    authentic: only Yagout and we hold that key.
 *  - The person is waiting. Every path ends in a redirect to a page, never a
 *    JSON error.
 *  - The path segment is a hint, not evidence. Which URL was called does not
 *    decide the outcome; the decrypted status and res_code do. A forged POST to
 *    /success proves nothing.
 */

function resultRedirect(baseUrl: string, outcome: "success" | "failure", reference?: string) {
  if (outcome === "success" && reference) {
    return `${baseUrl}/pay/yagout/result?status=success&ref=${encodeURIComponent(reference)}`
  }
  const destination = process.env.YAGOUTPAY_ERROR_URL?.trim() || `${baseUrl}/payment-error`
  return reference ? `${destination}?reference=${encodeURIComponent(reference)}` : destination
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ outcome: string }> },
) {
  const url = new URL(request.url)
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || url.origin).replace(/\/$/, "")
  const { outcome: rawOutcome } = await params
  const outcome = rawOutcome === "success" ? "success" : "failure"

  try {
    const form = await request.formData()
    const field = (name: string) => {
      const value = form.get(name)
      return typeof value === "string" ? value : ""
    }

    // me_id is the one field Yagout sends in plain text, so it is how we find
    // the key needed to read everything else.
    const meId = field("me_id").trim()
    const encryptedTxnResponse = field("txn_response")

    if (!meId || !encryptedTxnResponse) {
      console.warn("[YAGOUT] Return post missing me_id or txn_response", {
        outcome,
        fields: Array.from(form.keys()),
      })
      return NextResponse.redirect(resultRedirect(baseUrl, "failure"), { status: 303 })
    }

    const resolved = await resolveYagoutKeyForMeId(meId)
    if (!resolved) {
      console.warn("[YAGOUT] Return post for an unknown me_id", { meId, outcome })
      return NextResponse.redirect(resultRedirect(baseUrl, "failure"), { status: 303 })
    }

    let txnPlain: string
    try {
      txnPlain = decryptYagout(encryptedTxnResponse, resolved.encryptionKey)
    } catch (error) {
      // Undecryptable means unauthentic: either not from Yagout, or tampered
      // with in the browser. Nothing here is trustworthy, so nothing is applied.
      console.error("[YAGOUT] Return post failed to decrypt", {
        meId,
        merchantId: resolved.merchantId,
        outcome,
        error: (error as Error).message,
      })
      return NextResponse.redirect(resultRedirect(baseUrl, "failure"), { status: 303 })
    }

    const response = parseTxnResponse(txnPlain)

    // The response carries the merchant id it was issued for; if that is not
    // the merchant whose key just decrypted it, treat it as replayed.
    if (response.meId && response.meId.trim() !== meId) {
      console.error("[YAGOUT] Return post me_id does not match its payload", {
        formMeId: meId,
        payloadMeId: response.meId,
      })
      return NextResponse.redirect(resultRedirect(baseUrl, "failure"), { status: 303 })
    }

    const raw: Record<string, string> = { txn_response: txnPlain }
    let pgDetails = null

    for (const name of ["pg_details", "txn_details", "other_details", "fraud_details"]) {
      const encrypted = field(name)
      if (!encrypted) continue
      try {
        const plain = decryptYagout(encrypted, resolved.encryptionKey)
        raw[name] = plain
        if (name === "pg_details") pgDetails = parseResponsePgDetails(plain)
      } catch {
        // Supplementary detail only — a section we cannot read must not stop us
        // recording an outcome we have already authenticated.
        console.warn("[YAGOUT] Could not decrypt response section", { name, meId })
      }
    }

    const result = await settleYagoutFromReturn({ response, pgDetails, raw, request })

    console.log("[YAGOUT] Return post applied", {
      outcome,
      orderNo: response.orderNo,
      action: result.action,
      status: result.status,
      reason: result.reason,
    })

    const landed = result.status === "success" ? "success" : "failure"
    return NextResponse.redirect(
      resultRedirect(baseUrl, landed, result.transactionReference ?? response.orderNo),
      { status: 303 },
    )
  } catch (error) {
    console.error("[YAGOUT] Return post handler failed:", error)
    return NextResponse.redirect(resultRedirect(baseUrl, "failure"), { status: 303 })
  }
}

/**
 * Yagout posts here, but a customer who reloads the resulting page — or any
 * link-follower — arrives with GET. Redirect rather than 405 so they land
 * somewhere meaningful.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || url.origin).replace(/\/$/, "")
  return NextResponse.redirect(resultRedirect(baseUrl, "failure"), { status: 303 })
}
