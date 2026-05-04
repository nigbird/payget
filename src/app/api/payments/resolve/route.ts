import { NextResponse } from "next/server"
import { resolveEncryptedToken } from "@/app/api/payments/_shared"
import { encryptSessionToken } from "@/lib/jwe"
import { decryptMerchantSecretInMemory } from "@/lib/merchant-secret"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get("token")
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    const result = await resolveEncryptedToken(token)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const { merchant, payload, tx } = result
    
    // Issue a temporary merchant session token tied to this specific payment interaction
    // Set a short expiration time for the session token (e.g., 15 minutes)
    const exp = Date.now() + 15 * 60 * 1000
    const { plaintext: merchantSecret } = decryptMerchantSecretInMemory(merchant.jweSecret)
    const merchantSessionToken = await encryptSessionToken({
      merchantId: merchant.id,
      transactionId: payload.transactionId,
      exp,
    }, merchantSecret)

    const rawLogo = (merchant as any).logoUrl as string | null | undefined
    const normalizedLogo =
      typeof rawLogo === "string" && rawLogo.startsWith("/uploads/merchant-logos/")
        ? `/api${rawLogo}`
        : rawLogo ?? null
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
      merchantSessionToken, // Return the newly generated session token
    })
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 })
  }
}

