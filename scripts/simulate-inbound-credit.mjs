/**
 * Stands in for core banking until its credit notifications are wired up:
 * posts one credit notice to /api/inbound/credit, exactly as core banking will.
 *
 *   node scripts/simulate-inbound-credit.mjs <accountNumber> [amount] [payerName]
 *
 * Reads INBOUND_CREDIT_TOKEN from .env; targets http://localhost:9004 unless
 * BASE_URL is set. Each run uses a fresh reference, so it records and
 * announces a new payment; pass REFERENCE=<ref> to replay one and confirm the
 * duplicate is neither recorded nor announced twice.
 */

import "dotenv/config"

const [accountNumber, amount = "250", payerName = "Abebe Kebede"] = process.argv.slice(2)
if (!accountNumber) {
  console.error("Usage: node scripts/simulate-inbound-credit.mjs <accountNumber> [amount] [payerName]")
  process.exit(1)
}

const token = process.env.INBOUND_CREDIT_TOKEN
if (!token) {
  console.error("INBOUND_CREDIT_TOKEN is not set in .env")
  process.exit(1)
}

const baseUrl = process.env.BASE_URL ?? "http://localhost:9004"
const body = {
  reference: process.env.REFERENCE ?? `FTSIM${Date.now()}`,
  accountNumber,
  amount: Number(amount),
  currency: "ETB",
  payerName,
  payerAccount: "1000123456789",
  payerBank: "Other Bank",
  channel: "IPS",
  narration: `QR payment from ${payerName}`,
  postedAt: new Date().toISOString(),
}

const res = await fetch(`${baseUrl}/api/inbound/credit`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
})
console.log(`POST /api/inbound/credit -> ${res.status}`)
console.log(await res.text())
process.exitCode = res.ok ? 0 : 1
