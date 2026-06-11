import { NextResponse } from "next/server"
import { resolveEncryptedToken } from "@/app/api/payments/_shared"
import { encryptSessionToken } from "@/lib/jwe"
import { withMerchantSecret } from "@/lib/merchant-secret"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get("token")
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    const result = await resolveEncryptedToken(token, { allowTerminal: true })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const { merchant, payload, tx } = result

    const rawLogo = (merchant as any).logoUrl as string | null | undefined
    const normalizedLogo =
      typeof rawLogo === "string" && rawLogo.startsWith("/uploads/merchant-logos/")
        ? `/api${rawLogo}`
        : rawLogo ?? null

    const isTerminal = tx.status === "success" || tx.status === "failed"

    // Only issue a merchantSessionToken for active (non-terminal) transactions.
    // Completed transactions are returned read-only for display/receipt purposes.
    let merchantSessionToken: string | null = null
    if (!isTerminal) {
      const exp = Date.now() + 15 * 60 * 1000
      merchantSessionToken = await withMerchantSecret(merchant.jweSecret, (merchantSecret) =>
        encryptSessionToken({
          merchantId: merchant.id,
          transactionId: payload.transactionId,
          exp,
        }, merchantSecret)
      )
    }

    return NextResponse.json({
      merchantId: merchant.id,
      merchantName: merchant.name,
      merchantLogoUrl: normalizedLogo,
      merchantAccountNumber: merchant.accountNumber,
      transactionId: payload.transactionId,
      transactionReference: payload.transactionReference,
      amount: payload.amount,
      serviceDescription: payload.serviceDescription,
      status: tx.status,
      transactionTimestamp: tx.transactionTimestamp,
      payerPhone: payload.userCredentials.phone,
      merchantSessionToken,
    })
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 })
  }
}

