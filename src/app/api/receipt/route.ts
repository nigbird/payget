import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { transactionReference } = await request.json()
    if (!transactionReference) {
      return NextResponse.json({ error: "Missing transactionReference" }, { status: 400 })
    }

    const invoiceApiKey = process.env.INVOICE_API_KEY ?? ""

    // Step 1: Fetch receipt data from bank receipt service
    const receiptRes = await fetch("http://192.168.100.56:8280/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: transactionReference }),
    })

    if (!receiptRes.ok) {
      const err = await receiptRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.message || "Failed to fetch receipt from bank" },
        { status: 502 }
      )
    }

    const invoiceData = await receiptRes.json()

    // Step 2: Submit invoice data to generate a viewable receipt URL
    const invoiceRes = await fetch("http://172.24.47.138:9003/api/invoice/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": invoiceApiKey,
      },
      body: JSON.stringify(invoiceData),
    })

    if (!invoiceRes.ok) {
      const err = await invoiceRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.message || "Failed to generate receipt" },
        { status: 502 }
      )
    }

    const { viewUrl } = await invoiceRes.json()
    return NextResponse.json({ viewUrl })
  } catch (error) {
    console.error("Receipt generation error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
