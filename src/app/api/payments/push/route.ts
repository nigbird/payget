import { NextResponse } from "next/server"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { auth } from "@/auth"
<<<<<<< HEAD
import { sendProviderPushRequest } from "@/lib/provider-client"
import { db } from "@/app/lib/db"
=======
import { prepareEncryptedPushRequest, sendPushToProvider, ProviderPushPayloadSchema } from "@/lib/provider-encryption"
>>>>>>> 34896daf9ee3ac3d904f5aa2aa583d131295b4f5

export async function POST(request: Request) {
  try {
    const session = await auth()
    const body = await request.json()
    const parsed = PaymentInitiateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 })
    }

    const sessionUser = session?.user as { id?: string; name?: string | null; role?: string; merchantId?: string | null; assignedMerchantIds?: string[] } | undefined
    const isAssignedMerchant =
      sessionUser?.merchantId === parsed.data.merchantId ||
      sessionUser?.assignedMerchantIds?.includes(parsed.data.merchantId)

    if (!sessionUser?.id || !sessionUser?.role) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (
      (sessionUser.role === 'MERCHANT' && sessionUser.merchantId !== parsed.data.merchantId) ||
      (sessionUser.role === 'SALES' && !isAssignedMerchant)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const initiatedBy = {
      id: sessionUser.id,
      name: sessionUser.name ?? undefined,
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

<<<<<<< HEAD
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
=======
    // Prepare payload for provider
    const providerPayload = ProviderPushPayloadSchema.parse({
      transactionRef: result.transactionReference,
      customerPhone: result.tx.userCredentials.phone,
      creditAccount: result.merchant.accountNumber,
      amount: result.tx.amount,
    })

    const baseUrl = process.env.PROVIDER_BASE_URL!
    const { request: encryptedRequest } = await prepareEncryptedPushRequest(providerPayload, baseUrl)

    // Send to provider using their exact transfer endpoint
    const username = process.env.PROVIDER_USERNAME!
    const password = process.env.PROVIDER_PASSWORD!
    const providerResponse = await sendPushToProvider(encryptedRequest, baseUrl, username, password)

>>>>>>> 34896daf9ee3ac3d904f5aa2aa583d131295b4f5
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

