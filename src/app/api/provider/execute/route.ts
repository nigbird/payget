import { NextResponse } from "next/server"
import { db } from "@/app/lib/db"
import { resolveEncryptedToken } from "@/app/api/payments/_shared"
import { sendProviderPushRequest } from "@/lib/provider-client"
import { prepareEncryptedPushRequest, sendPushToProvider, ProviderPushPayloadSchema } from "@/lib/provider-encryption"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token } = body ?? {}

    if (typeof token !== "string" || !token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    const resolved = await resolveEncryptedToken(token)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }

    const { merchant, tx } = resolved

    // 1. Prepare request for the external provider (legacy flow)
    const providerRequest = {
      transactionRef: tx.transactionReference,
      customerPhone: tx.userCredentials.phone,
      creditAccount: merchant.accountNumber,
      amount: tx.amount,
      company: merchant.name
    }

    // 2. Call the external provider API (legacy flow)
    console.log('Initiating USSD push from link page (legacy flow)...')
    let providerResponse = await sendProviderPushRequest(providerRequest)
    console.log('Legacy provider response status:', providerResponse.statusCode)
    
    // If legacy provider fails, try the new encrypted provider flow
    if (providerResponse.statusCode !== 200) {
      console.log('Legacy flow failed. Trying new encrypted provider flow...', {
        message: providerResponse.message,
        error: providerResponse.error,
        details: providerResponse.details
      })
      const providerPayload = ProviderPushPayloadSchema.parse({
        transactionRef: tx.transactionReference,
        customerPhone: tx.userCredentials.phone,
        creditAccount: merchant.accountNumber,
        amount: tx.amount,
        company: merchant.name,
      })

      const baseUrl = process.env.PROVIDER_BASE_URL!
      const username = process.env.PROVIDER_USERNAME!
      const password = process.env.PROVIDER_PASSWORD!
      const { request: encryptedRequest } = await prepareEncryptedPushRequest(providerPayload, baseUrl, username, password)

      providerResponse = await sendPushToProvider(encryptedRequest, baseUrl, username, password)
      console.log('New encrypted provider flow response status:', providerResponse.statusCode || (providerResponse as any).status)
    }

    if (providerResponse.statusCode !== 200 && (providerResponse as any).status !== 200) {
      console.error('All provider flows failed for link-initiated push:', providerResponse)
      // Update local transaction status to failed if provider rejected it
      await db.updateTransactionStatus(tx.id, "failed")
      return NextResponse.json({ 
        error: providerResponse.message || "Provider rejected the USSD push",
        details: providerResponse.details || providerResponse.error,
        statusCode: providerResponse.statusCode
      }, { status: 400 })
    }

    // 3. Update local transaction with shared secret if returned
    if (providerResponse.sharedSecret) {
      await db.updateTransaction(tx.id, {
        userCredentials: {
          ...tx.userCredentials,
          providerSharedSecret: providerResponse.sharedSecret
        }
      })
    }

    return NextResponse.json({
      transactionId: tx.id,
      transactionReference: tx.transactionReference,
      status: "awaiting_pin",
      message: "USSD push initiated successfully"
    })
  } catch (error) {
    console.error('USSD execution error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

