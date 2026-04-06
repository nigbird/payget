import { NextResponse } from "next/server"
import { createGatewayTransactionAndToken, PaymentInitiateSchema } from "@/app/api/payments/_shared"
import { auth } from "@/auth"

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

    // Mock “USSD request” initiation: in this demo the customer token is what the provider would reference.
    return NextResponse.json({
      transactionId: result.tx.id,
      transactionReference: result.transactionReference,
      status: result.tx.status,
      customerPinToken: result.customerPinToken,
      ussdInitiatedTo: result.tx.userCredentials.phone,
      message: "Mock USSD prompt initiated (demo).",
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

