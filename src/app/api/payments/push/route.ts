import { NextResponse } from "next/server"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { auth } from "@/auth"
import { sendProviderPushRequest } from "@/lib/provider-client"
import { db } from "@/app/lib/db"

export async function POST(request: Request) {
  try {
    const session = await auth()
    const body = await request.json()
    const parsed = PaymentInitiateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
    }

    const sessionUser = session?.user as { id?: string; name?: string | null; merchantId?: string | null } | undefined
    const initiatedBy =
      sessionUser?.id && sessionUser.merchantId === parsed.data.merchantId
        ? { id: sessionUser.id, name: sessionUser.name ?? undefined }
        : undefined

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

    // 1. Prepare request for the external provider
    const providerRequest = {
      transactionRef: result.transactionReference,
      customerPhone: parsed.data.userCredentials.phone,
      creditAccount: result.merchant.accountNumber,
      amount: parsed.data.amount
    }

    // 2. Call the external provider API
    const providerResponse = await sendProviderPushRequest(providerRequest)

    if (providerResponse.statusCode !== 200) {
      // Update local transaction status to failed if provider rejected it
      await db.updateTransactionStatus(result.tx.id, "failed")
      
      return NextResponse.json({ 
        error: providerResponse.message || "Provider rejected the request",
        details: providerResponse.details,
        statusCode: providerResponse.statusCode
      }, { status: 400 })
    }

    // 3. Update local transaction with shared secret for later callback decryption
    if (providerResponse.sharedSecret) {
      await db.updateTransaction(result.tx.id, {
        userCredentials: {
          ...result.tx.userCredentials,
          providerSharedSecret: providerResponse.sharedSecret
        }
      })
    }

    // 4. Return success to the merchant
    return NextResponse.json({
      transactionId: result.tx.id,
      transactionReference: result.transactionReference,
      status: "awaiting_pin", // The customer will now see a PIN prompt
      ussdInitiatedTo: result.tx.userCredentials.phone,
      message: providerResponse.details || "Push payment request initiated successfully.",
    })
  } catch (error) {
    console.error('Push payment error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

