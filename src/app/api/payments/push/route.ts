import { NextResponse } from "next/server"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { auth } from "@/auth"
import { prepareEncryptedPushRequest, sendPushToProvider, ProviderPushPayloadSchema } from "@/lib/provider-encryption"

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

    return NextResponse.json({
      transactionId: result.tx.id,
      transactionReference: result.transactionReference,
      status: result.tx.status,
      customerPinToken: result.customerPinToken,
      ussdInitiatedTo: result.tx.userCredentials.phone,
      message: "Provider push request sent.",
      providerResponse,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

