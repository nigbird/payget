import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createGatewayTransactionAndToken } from "@/app/api/payments/_shared"
import { sendProviderPushRequest } from "@/lib/provider-client"
import { db } from "@/app/lib/db"
import { prepareEncryptedPushRequest, sendPushToProvider, ProviderPushPayloadSchema } from "@/lib/provider-encryption"
import { writeAuditLog } from "@/lib/audit-log"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const qrCode = await prisma.merchantQrCode.findUnique({
      where: { token, isActive: true },
      include: {
        merchant: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            qrEnabled: true,
            status: true,
            accountNumber: true
          }
        }
      }
    })

    if (!qrCode) {
      return NextResponse.json({ error: "Invalid or expired QR code" }, { status: 404 })
    }

    if (!qrCode.merchant.qrEnabled || (qrCode.merchant.status !== 'ACTIVE' && qrCode.merchant.status !== 'APPROVED')) {
      return NextResponse.json({ error: "Payments are currently disabled for this merchant" }, { status: 403 })
    }

    return NextResponse.json(qrCode.merchant)
  } catch (error) {
    console.error("Failed to validate QR token:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { phone, amount } = body

    if (!phone || !amount) {
      return NextResponse.json({ error: "Phone and amount are required" }, { status: 400 })
    }

    const qrCode = await prisma.merchantQrCode.findUnique({
      where: { token, isActive: true },
      include: { merchant: true }
    })

    if (!qrCode || !qrCode.merchant.qrEnabled) {
      return NextResponse.json({ error: "Invalid QR code" }, { status: 404 })
    }

    // Prepare payment input for the shared logic
    const transactionId = `qr_${crypto.randomUUID()}`
    const paymentInput = {
      merchantId: qrCode.merchantId,
      transactionId,
      userCredentials: {
        phone,
        authToken: "QR_PAYMENT_BYPASS" // Since it's a public QR payment
      },
      amount: parseFloat(amount),
      serviceDescription: `QR Payment to ${qrCode.merchant.name}`,
      timestamp: new Date().toISOString(),
      method: "BANK" as const
    }

    const result = await createGatewayTransactionAndToken(paymentInput, { 
      initiatedBy: { id: "QR_CUSTOMER", name: "QR Customer" } 
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Trigger USSD Push (Copied logic from /api/payments/push for simplicity, or we could refactor)
    const providerRequest = {
      transactionRef: result.transactionReference,
      customerPhone: phone,
      creditAccount: qrCode.merchant.accountNumber,
      amount: paymentInput.amount,
      company: "NTMerchant",
      merchantName: qrCode.merchant.name,
      description: paymentInput.serviceDescription,
      callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/provider/callback`
    }

    let providerResponse = await sendProviderPushRequest(providerRequest)

    if (providerResponse.statusCode !== 200) {
      const providerPayload = ProviderPushPayloadSchema.parse({
        transactionRef: result.transactionReference,
        customerPhone: phone,
        creditAccount: qrCode.merchant.accountNumber,
        amount: paymentInput.amount,
        company: "NTMerchant",
        merchantName: qrCode.merchant.name,
        description: paymentInput.serviceDescription,
        callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/provider/callback`
      })

      const baseUrl = process.env.PROVIDER_BASE_URL!
      const username = process.env.PROVIDER_USERNAME!
      const password = process.env.PROVIDER_PASSWORD!
      const { request: encryptedRequest } = await prepareEncryptedPushRequest(providerPayload, baseUrl, username, password)

      providerResponse = await sendPushToProvider(encryptedRequest, baseUrl, username, password)
    }

    if (providerResponse.statusCode !== 200 && (providerResponse as any).status !== 200) {
      await db.updateTransactionStatus(result.tx.id, "failed")
      return NextResponse.json({ error: "Provider rejected the request" }, { status: 400 })
    }

    await db.updateTransactionStatus(result.tx.id, "awaiting_pin")

    await writeAuditLog({
      request,
      userId: null,
      action: "QR_PAYMENT_INITIATE",
      entityType: "TRANSACTION",
      entityId: result.tx.id,
      newValue: {
        merchantId: qrCode.merchantId,
        amount: paymentInput.amount,
        phone
      }
    })

    return NextResponse.json({
      transactionId: result.tx.id,
      transactionReference: result.transactionReference,
      status: "awaiting_pin"
    })

  } catch (error) {
    console.error("QR payment error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
