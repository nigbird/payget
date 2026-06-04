import crypto from "crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createGatewayTransactionAndToken } from "@/app/api/payments/_shared"
import { db } from "@/app/lib/db"
import {
  sendProviderPushPayment,
  ProviderPushPayloadSchema,
  isProviderPushSuccess,
} from "@/lib/provider-encryption"
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
    const { phone, amount, description } = body

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
      serviceDescription: description || `QR Payment to ${qrCode.merchant.name}`,
      timestamp: new Date().toISOString(),
      method: "BANK" as const
    }

    const result = await createGatewayTransactionAndToken(paymentInput, { 
      initiatedBy: { id: "QR_CUSTOMER", name: "QR Customer" } 
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const providerPayload = ProviderPushPayloadSchema.parse({
      transactionRef: result.transactionReference,
      customerPhone: phone,
      creditAccount: qrCode.merchant.accountNumber,
      amount: paymentInput.amount,
      company: "NTMerchant",
      merchantName: qrCode.merchant.name,
      description: paymentInput.serviceDescription,
    })

    const providerResponse = await sendProviderPushPayment(providerPayload)

    if (!isProviderPushSuccess(providerResponse)) {
      await db.updateTransactionStatus(result.tx.id, "failed")
      return NextResponse.json({ error: "Provider rejected the request" }, { status: 400 })
    }

    if (providerResponse.sharedSecret) {
      await db.updateTransaction(result.tx.id, {
        userCredentials: {
          ...result.tx.userCredentials,
          providerSharedSecret: providerResponse.sharedSecret,
        },
      })
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
        phone,
        description: paymentInput.serviceDescription
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
