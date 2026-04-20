import { NextResponse } from "next/server"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { requireAuthUser } from "@/lib/request-auth"
import { db } from "@/app/lib/db"
import crypto from "crypto"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = PaymentInitiateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
    }

    let authenticatedMerchantId: string | null = null
    let initiatedBy: { id: string; name?: string } | undefined

    // 1. Try Session/Bearer Auth first
    const sessionUser = await requireAuthUser(request)
    if (sessionUser) {
      const isAssignedMerchant =
        sessionUser.merchantId === parsed.data.merchantId ||
        sessionUser.assignedMerchantIds?.includes(parsed.data.merchantId)

      if (
        (sessionUser.role === 'MERCHANT' && sessionUser.merchantId !== parsed.data.merchantId) ||
        (sessionUser.role === 'SALES' && !isAssignedMerchant)
      ) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      
      authenticatedMerchantId = parsed.data.merchantId
      initiatedBy = {
        id: sessionUser.id,
        name: sessionUser.name ?? undefined,
      }
    } else {
      // 2. Try Signature Auth (for external e-commerce apps)
      const merchantIdHeader = request.headers.get("x-merchant-id")
      const signatureHeader = request.headers.get("x-signature")

      if (merchantIdHeader && signatureHeader) {
        if (merchantIdHeader !== parsed.data.merchantId) {
          return NextResponse.json({ error: "Merchant ID mismatch" }, { status: 400 })
        }

        const merchant = await db.getMerchantById(merchantIdHeader)
        if (!merchant) {
          return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
        }

        // Verify HMAC signature: HMAC-SHA256(JSON.stringify(body), jweSecret)
        const expectedSignature = crypto
          .createHmac("sha256", merchant.jweSecret)
          .update(JSON.stringify(body))
          .digest("hex")

        if (signatureHeader !== expectedSignature) {
          return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
        }

        authenticatedMerchantId = merchant.id
        initiatedBy = { id: `api_${merchant.id}`, name: `API (${merchant.name})` }
      }
    }

    if (!authenticatedMerchantId) {
      return NextResponse.json({ error: 'Unauthorized: Session or valid signature required' }, { status: 401 })
    }

    const result = await createGatewayTransactionAndToken(parsed.data, { initiatedBy })
    if (!result.ok) {
      const status =
        result.error === "Merchant not found"
          ? 404
          : result.error === "Merchant account is not active"
            ? 403
            : result.error === "Transaction ID already exists"
              ? 409
              : 400

      return NextResponse.json({ error: result.error, limit: (result as any).limit }, { status })
    }

    if (parsed.data.method === "TELEBIRR") {
      console.log('Telebirr payment link requested (not yet available)')
      return NextResponse.json({ 
        message: "Telebirr integration is coming soon.",
        transactionReference: result.transactionReference,
        status: "pending"
      }, { status: 202 })
    }

    const token = result.token
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
    const paymentUrl = `${baseUrl}/pay/link?token=${encodeURIComponent(token)}`

    return NextResponse.json({
      transactionId: result.tx.id,
      transactionReference: result.transactionReference,
      status: result.tx.status,
      paymentUrl,
      token,
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

