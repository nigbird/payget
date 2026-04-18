import { NextResponse } from "next/server"
import { db } from "@/app/lib/db"
import { resolveEncryptedToken } from "@/app/api/payments/_shared"
import { sendProviderPushRequest } from "@/lib/provider-client"
import { prepareEncryptedPushRequest, sendPushToProvider, ProviderPushPayloadSchema } from "@/lib/provider-encryption"
import { decryptSessionToken } from "@/lib/jwe"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token, merchantSessionToken, merchantCredentials } = body ?? {}

    if (typeof token !== "string" || !token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }
    if (typeof merchantSessionToken !== "string" || !merchantSessionToken) {
      return NextResponse.json({ error: "Missing merchantSessionToken" }, { status: 400 })
    }
    if (!merchantCredentials || typeof merchantCredentials.userId !== "string" || typeof merchantCredentials.password !== "string") {
      return NextResponse.json({ error: "Missing or invalid merchantCredentials" }, { status: 400 })
    }

    // 1. Decrypt link token to ensure integrity and enforce expiration/usage rules
    const resolved = await resolveEncryptedToken(token)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }

    const { merchant, tx } = resolved

    // 2. Verify the merchant session token to confirm a legitimate interaction flow
    try {
      const sessionPayload = await decryptSessionToken(merchantSessionToken, merchant.jweSecret)
      
      if (sessionPayload.merchantId !== merchant.id) {
        return NextResponse.json({ error: "Invalid session token: merchant mismatch" }, { status: 401 })
      }
      if (sessionPayload.transactionId !== tx.id) {
        return NextResponse.json({ error: "Invalid session token: transaction mismatch" }, { status: 401 })
      }
      if (Date.now() > sessionPayload.exp) {
        return NextResponse.json({ error: "Session token expired" }, { status: 401 })
      }
    } catch (err) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 401 })
    }

    // 3. Revalidate the merchant credentials for high-risk assurance
    // We check that the provided userId matches the merchant's ID or email,
    // and verify the provided password against the stored bcrypt hash.
    const isUserIdValid = merchantCredentials.userId === merchant.id || merchantCredentials.userId === merchant.email
    if (!isUserIdValid) {
      return NextResponse.json({ error: "Invalid merchant credentials: user ID mismatch" }, { status: 401 })
    }

    if (!merchant.password) {
      return NextResponse.json({ error: "Merchant password not set" }, { status: 401 })
    }

    const isPasswordValid = await bcrypt.compare(merchantCredentials.password, merchant.password)
    if (!isPasswordValid) {
      return NextResponse.json({ error: "Invalid merchant credentials: password mismatch" }, { status: 401 })
    }

    // 4. Prepare request for the external provider (legacy flow)
    const providerRequest = {
      transactionRef: tx.transactionReference,
      customerPhone: tx.userCredentials.phone,
      creditAccount: merchant.accountNumber,
      amount: tx.amount,
      company: merchant.name,
      callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/provider/callback`
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
        callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/provider/callback`
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

    // 4. Mark transaction as awaiting PIN after successful push initiation
    await db.updateTransactionStatus(tx.id, "awaiting_pin")

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

