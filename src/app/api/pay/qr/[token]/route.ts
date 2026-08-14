import crypto from "crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { db } from "@/lib/db"
import {
  sendProviderPushPayment,
  ProviderPushPayloadSchema,
  isProviderPushSuccess,
} from "@/lib/provider-encryption"
import { writeAuditLog } from "@/lib/audit-log"
import { QR_CUSTOMER_INITIATOR_ID } from "@/lib/transaction-initiator"

const CartItemSchema = PaymentInitiateSchema.shape.items.value.element.optional()

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

    const items = await prisma.merchantItem.findMany({
      where: { merchantId: qrCode.merchant.id, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true, categoryId: true, isActive: true },
    })

    return NextResponse.json({ ...qrCode.merchant, items })
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
    const rawItems = body.items

    if (!phone || !amount) {
      return NextResponse.json({ error: "Phone and amount are required" }, { status: 400 })
    }

    let validatedItems: Array<{ itemId?: string; name: string; price: number; quantity: number }> | undefined
    if (rawItems !== undefined && rawItems !== null) {
      if (!Array.isArray(rawItems)) {
        return NextResponse.json({ error: "Invalid items format" }, { status: 400 })
      }
      validatedItems = []
      for (const raw of rawItems) {
        const parsed = CartItemSchema.safeParse(raw)
        if (!parsed.success) {
          return NextResponse.json({ error: "Invalid item entry", details: parsed.error.flatten() }, { status: 400 })
        }
        if (parsed.data) validatedItems.push(parsed.data)
      }
      if (validatedItems.length === 0) validatedItems = undefined
    }

    const qrCode = await prisma.merchantQrCode.findUnique({
      where: { token, isActive: true },
      include: { merchant: true }
    })

    if (!qrCode || !qrCode.merchant.qrEnabled) {
      return NextResponse.json({ error: "Invalid QR code" }, { status: 404 })
    }

    const transactionId = `qr_${crypto.randomUUID()}`
    const paymentInput = {
      merchantId: qrCode.merchantId,
      transactionId,
      userCredentials: {
        phone,
        authToken: "QR_PAYMENT_BYPASS"
      },
      amount: parseFloat(amount),
      serviceDescription: description || `QR Payment to ${qrCode.merchant.name}`,
      timestamp: new Date().toISOString(),
      method: "BANK" as const,
      items: validatedItems,
    }

    const result = await createGatewayTransactionAndToken(paymentInput, {
      initiatedBy: { id: QR_CUSTOMER_INITIATOR_ID, name: "QR Customer" }
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
        description: paymentInput.serviceDescription,
        itemsReceived: validatedItems ?? null,
        itemsPersisted: result.itemsPersisted,
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
