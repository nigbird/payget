import { NextResponse } from "next/server"
import { db } from "@/app/lib/db"

export async function POST(request: Request) {
  try {
    const { transactionId } = await request.json()
    if (!transactionId) {
      return NextResponse.json({ error: "Missing transactionId" }, { status: 400 })
    }

    console.log("[receipt] transactionId:", transactionId)

    // Look up the transaction to get the FT number (cbsreference)
    const tx = await db.getTransactionById(transactionId)
    if (!tx) {
      console.error("[receipt] transaction not found:", transactionId)
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    const creds = tx.userCredentials as any
    const ftNumber: string =
      creds?.providerCallback?.cbsreference ||
      creds?.cbsreference ||
      creds?.providerCallback?.transactionId ||
      ""

    console.log("[receipt] FT number from userCredentials:", ftNumber || "(not found)")

    if (!ftNumber) {
      return NextResponse.json({ error: "FT number not available for this transaction" }, { status: 404 })
    }

    const invoiceApiKey = process.env.INVOICE_API_KEY ?? ""

    // Step 1: Fetch receipt/invoice data from bank core using FT number
    const receiptPayload = { transactionId: ftNumber }
    console.log("[receipt] → bank receipt request:", JSON.stringify(receiptPayload))

    const receiptRes = await fetch("http://192.168.100.56:8280/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(receiptPayload),
    })

    const receiptText = await receiptRes.text()
    console.log("[receipt] ← bank receipt status:", receiptRes.status)
    console.log("[receipt] ← bank receipt body:", receiptText)

    if (!receiptRes.ok) {
      let err: any = {}
      try { err = JSON.parse(receiptText) } catch {}
      return NextResponse.json(
        { error: err.message || "Failed to fetch receipt from bank" },
        { status: 502 }
      )
    }

    let invoiceData: any
    try {
      invoiceData = JSON.parse(receiptText)
    } catch {
      console.error("[receipt] bank receipt response is not valid JSON:", receiptText)
      return NextResponse.json({ error: "Bank returned invalid receipt data" }, { status: 502 })
    }

    // Step 2: Submit invoice data to generate a viewable receipt URL
    console.log("[receipt] → invoice request body:", JSON.stringify(invoiceData))

    const invoiceRes = await fetch("http://172.24.47.138:9003/api/invoice/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": invoiceApiKey,
      },
      body: JSON.stringify(invoiceData),
    })

    const invoiceText = await invoiceRes.text()
    console.log("[receipt] ← invoice service status:", invoiceRes.status)
    console.log("[receipt] ← invoice service body:", invoiceText)

    if (!invoiceRes.ok) {
      let err: any = {}
      try { err = JSON.parse(invoiceText) } catch {}
      return NextResponse.json(
        { error: err.message || "Failed to generate receipt" },
        { status: 502 }
      )
    }

    let result: any
    try {
      result = JSON.parse(invoiceText)
    } catch {
      console.error("[receipt] invoice service response is not valid JSON:", invoiceText)
      return NextResponse.json({ error: "Invoice service returned invalid response" }, { status: 502 })
    }

    console.log("[receipt] viewUrl:", result.viewUrl)
    return NextResponse.json({ viewUrl: result.viewUrl })
  } catch (error) {
    console.error("[receipt] unexpected error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
