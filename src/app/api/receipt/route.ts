import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// Bank returns "YYMMDDHHMM ..." — parse first token into YYYY-MM-DD
function parseValueDate(raw: string): string {
  const part = (raw ?? "").split(" ")[0].trim()
  if (part.length >= 6) {
    const yy = part.substring(0, 2)
    const mm = part.substring(2, 4)
    const dd = part.substring(4, 6)
    return `20${yy}-${mm}-${dd}`
  }
  return new Date().toISOString().split("T")[0]
}

// Bank returns "ETB68.00" — strip currency prefix and parse
function parseAmount(raw: string): number {
  return parseFloat((raw ?? "0").replace(/[^0-9.]/g, "")) || 0
}

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
    const invoiceUsername = process.env.INVOICE_USERNAME ?? ""
    const invoicePassword = process.env.INVOICE_PASSWORD ?? ""
    const providerBase = (process.env.PROVIDER_BASE_URL ?? "").replace(/\/$/, "")
    const invoiceBase = (process.env.INVOICE_SERVICE_BASE_URL ?? "").replace(/\/$/, "")

    if (!providerBase) {
      console.error("[receipt] PROVIDER_BASE_URL is not configured")
      return NextResponse.json({ error: "Receipt service not configured" }, { status: 503 })
    }
    if (!invoiceBase) {
      console.error("[receipt] INVOICE_SERVICE_BASE_URL is not configured")
      return NextResponse.json({ error: "Invoice service not configured" }, { status: 503 })
    }

    // Step 1: Fetch receipt data from bank core using FT number
    const receiptPayload = { transactionId: ftNumber }
    console.log("[receipt] → bank receipt request:", JSON.stringify(receiptPayload))

    const invoiceAuth = Buffer.from(`${invoiceUsername}:${invoicePassword}`).toString("base64")
    const receiptRes = await fetch(`${providerBase}/api/v1/merchant/ft/details`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${invoiceAuth}`,
      },
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

    let bankReceipt: any
    try {
      bankReceipt = JSON.parse(receiptText)
    } catch {
      console.error("[receipt] bank receipt response is not valid JSON:", receiptText)
      return NextResponse.json({ error: "Bank returned invalid receipt data" }, { status: 502 })
    }

    // Step 2: Map bank response to InvoiceData structure
    const d = bankReceipt?.data ?? {}
    const issueDate = parseValueDate(d.debitValueDate)
    const amount = parseAmount(d.debitAmount)

    const invoiceData = {
      invoiceId: ftNumber,
      issueDate,
      dueDate: issueDate,
      creditedParty: {
        name: d.creditedCustomer ?? "",
        accountNumber: d.creditAccount ?? "",
      },
      payer: {
        name: d.debitCustomer ?? "",
        accountNumber: d.debitAccount ?? "",
      },
      paymentReason: tx.serviceDescription || "Payment",
      settledAmount: amount,
      currency: "Birr",
      serviceFee: 0,
      serviceFeeVat: 0,
      totalAmount: amount,
      paymentChannel: "USSD Push",
    }

    console.log("[receipt] → invoice request body:", JSON.stringify(invoiceData))

    // Step 3: Submit to invoice generator
    const invoiceRes = await fetch(`${invoiceBase}/api/invoice/`, {
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

    // Make the viewUrl absolute — the invoice service sometimes returns a relative path
    const viewUrl = result.viewUrl?.startsWith("http")
      ? result.viewUrl
      : `${invoiceBase}${result.viewUrl}`

    console.log("[receipt] viewUrl:", viewUrl)
    return NextResponse.json({ viewUrl })
  } catch (error) {
    console.error("[receipt] unexpected error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
