/**
 * Locks our YagoutPay wire format against the worked example in the integration
 * document, and (optionally) against Yagout's own encryption API.
 *
 *   node scripts/yagout-selftest.mjs
 *
 * To additionally verify our ciphertext is byte-identical to theirs — the only
 * proof that matters, because the sample ciphertexts printed in the document do
 * NOT decrypt with the key the document publishes:
 *
 *   YAGOUTPAY_MERCHANT_ID=... YAGOUTPAY_ENCRYPTION_KEY=... \
 *   YAGOUTPAY_ENCRYPT_URL=https://uatcheckout.yagoutpay.com/ms-transaction-core-1-0/othersRedirection/encryption \
 *   node scripts/yagout-selftest.mjs
 */

import { createHash } from "crypto"
import {
  encryptYagout,
  decryptYagout,
  yagoutHash,
  isValidYagoutKey,
} from "../src/lib/yagout-crypto.ts"
import { buildHostedMerchantRequest, parseTxnResponse, isSuccessfulTxnResponse } from "../src/lib/yagout-request.ts"

let failures = 0

function check(label, actual, expected) {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`)
  if (!ok) {
    console.log(`        expected: ${JSON.stringify(expected)}`)
    console.log(`        actual:   ${JSON.stringify(actual)}`)
  }
}

function checkTrue(label, actual) {
  check(label, actual, true)
}

// ---------------------------------------------------------------------------
// 1. Request framing, against document page 11
// ---------------------------------------------------------------------------

const SAMPLE_URL = "http://localhost/YagoutPay/transaction//Response.php"

// The document's own sample. Note it leaves email/mobile blank even though the
// spec marks both mandatory, so we build with them filled and swap the customer
// section back before comparing — every other section stays byte-exact.
const DOC_SAMPLE =
  "yagout|202505060003|49340|1|ETH|ETB|SALE|" +
  `${SAMPLE_URL}|${SAMPLE_URL}|WEB` +
  "~|||~||||~||||Y~||||~||||||~||~~||||"

const built = buildHostedMerchantRequest({
  txn: {
    agId: "yagout",
    meId: "202505060003",
    orderNo: "49340",
    amount: "1",
    country: "ETH",
    currency: "ETB",
    txnType: "SALE",
    successUrl: SAMPLE_URL,
    failureUrl: SAMPLE_URL,
    channel: "WEB",
  },
  cust: {
    emailId: "payer@example.com",
    mobileNo: "251900000000",
    isLoggedIn: "Y",
  },
})

const sections = built.split("~")
check("nine sections", sections.length, 9)

const widths = sections.map((s) => s.split("|").length)
check("section widths", widths.join(","), "10,4,5,5,5,7,3,1,5")

// Swap our populated customer section for the document's blank one.
const normalised = sections.map((s, i) => (i === 3 ? "||||Y" : s)).join("~")
check("reproduces document sample byte for byte", normalised, DOC_SAMPLE)

// ---------------------------------------------------------------------------
// 2. Framing guard
// ---------------------------------------------------------------------------

let guarded = false
try {
  buildHostedMerchantRequest({
    txn: {
      agId: "yagout",
      meId: "202505060003",
      orderNo: "order1",
      amount: "1.00",
      country: "ETH",
      currency: "ETB",
      txnType: "SALE",
      successUrl: SAMPLE_URL,
      failureUrl: SAMPLE_URL,
      channel: "WEB",
    },
    cust: {
      custName: "Abebe | Bikila",
      emailId: "payer@example.com",
      mobileNo: "251900000000",
      isLoggedIn: "Y",
    },
  })
} catch {
  guarded = true
}
checkTrue("rejects a pipe inside a field value", guarded)

let missingCaught = false
try {
  buildHostedMerchantRequest({
    txn: {
      agId: "yagout",
      meId: "202505060003",
      orderNo: "order1",
      amount: "1.00",
      country: "ETH",
      currency: "ETB",
      txnType: "SALE",
      successUrl: SAMPLE_URL,
      failureUrl: SAMPLE_URL,
      channel: "WEB",
    },
    cust: { emailId: "", mobileNo: "", isLoggedIn: "Y" },
  })
} catch {
  missingCaught = true
}
checkTrue("rejects missing mandatory email/mobile", missingCaught)

// ---------------------------------------------------------------------------
// 3. Crypto round-trip and hash shape
// ---------------------------------------------------------------------------

const DOC_KEY = "SjgTPThS1TWrD06ElFjRC3BoIgOXEh/xJ2IC+k+tVVM="

check("round-trips the sample request", decryptYagout(encryptYagout(DOC_SAMPLE, DOC_KEY), DOC_KEY), DOC_SAMPLE)
check("round-trips a block-aligned string", decryptYagout(encryptYagout("0123456789abcdef", DOC_KEY), DOC_KEY), "0123456789abcdef")
check("round-trips an empty string", decryptYagout(encryptYagout("", DOC_KEY), DOC_KEY), "")

let badKeyCaught = false
try {
  encryptYagout("x", Buffer.from("too short").toString("base64"))
} catch {
  badKeyCaught = true
}
checkTrue("rejects a key that is not 32 bytes", badKeyCaught)

// A 64-char hex digest under PKCS#7 is exactly 5 AES blocks. This is the
// measurement that told us the digest is hex-encoded before encryption rather
// than hashed raw, which would be 48 bytes.
const hash = yagoutHash(
  { meId: "202505060003", orderNo: "49340", amount: "1", country: "ETH", currency: "ETB" },
  DOC_KEY
)
check("hash is 80 bytes (5 AES blocks)", Buffer.from(hash, "base64").length, 80)
check("hash decrypts to a 64-char hex digest", /^[0-9a-f]{64}$/.test(decryptYagout(hash, DOC_KEY)), true)

// The admin config screen rejects a bad key at entry rather than letting it
// surface as an opaque gateway rejection on the first real payment.
checkTrue("accepts the documented key shape", isValidYagoutKey(DOC_KEY))
checkTrue("accepts any 32-byte key", isValidYagoutKey(Buffer.alloc(32).toString("base64")))
checkTrue("rejects a truncated key", !isValidYagoutKey("SjgTPThS1TWrD06ElFjRC3BoIgOXEh"))
checkTrue("rejects a 16-byte key", !isValidYagoutKey(Buffer.alloc(16).toString("base64")))
checkTrue("rejects an empty key", !isValidYagoutKey(""))

// ---------------------------------------------------------------------------
// 4. Response parsing, against document page 14
// ---------------------------------------------------------------------------

const DOC_RESPONSE =
  "yagout|202505060003|56212|1.00|ETH|ETB|2025-04-30|09:56:23|2058501746006825776|" +
  "AG_20250430_70701b7a0bffdb44a880|Successful|0|Successful"

const parsed = parseTxnResponse(DOC_RESPONSE)
check("parses order number", parsed.orderNo, "56212")
check("parses amount", parsed.amount, "1.00")
check("parses gateway reference", parsed.pgRef, "AG_20250430_70701b7a0bffdb44a880")
check("parses status", parsed.status, "Successful")
checkTrue("recognises success", isSuccessfulTxnResponse(parsed))
checkTrue(
  "a Successful word with a non-zero code is not success",
  !isSuccessfulTxnResponse({ ...parsed, resCode: "1" })
)
checkTrue("a truncated response does not throw", typeof parseTxnResponse("yagout|202505060003").status === "string")

// ---------------------------------------------------------------------------
// 5. Full cycle — exactly what the link route and return handler do
// ---------------------------------------------------------------------------

const ORDER_NO = "refk3j2h1g8d"
const AMOUNT = "150.00"

// Outbound, as the link route builds it.
const outboundPlain = buildHostedMerchantRequest({
  txn: {
    agId: "yagout",
    meId: "202505060003",
    orderNo: ORDER_NO,
    amount: AMOUNT,
    country: "ETH",
    currency: "ETB",
    txnType: "SALE",
    successUrl: "https://merchant.example.com/api/payments/yagout/return/success",
    failureUrl: "https://merchant.example.com/api/payments/yagout/return/failure",
    channel: "WEB",
  },
  cust: { emailId: "payer@example.com", mobileNo: "251900000000", isLoggedIn: "Y" },
})

const merchantRequest = encryptYagout(outboundPlain, DOC_KEY)
const outboundHash = yagoutHash(
  { meId: "202505060003", orderNo: ORDER_NO, amount: AMOUNT, country: "ETH", currency: "ETB" },
  DOC_KEY
)

check("outbound request survives the wire", decryptYagout(merchantRequest, DOC_KEY), outboundPlain)
check(
  "the hash covers the amount actually sent",
  decryptYagout(outboundHash, DOC_KEY),
  createHash("sha256").update(`202505060003~${ORDER_NO}~${AMOUNT}~ETH~ETB`).digest("hex")
)

// Inbound, as the return handler reads it.
const inboundPlain =
  `yagout|202505060003|${ORDER_NO}|${AMOUNT}|ETH|ETB|2026-09-23|11:04:02|` +
  "2058701746715046364|AG_20260923_abc123|Successful|0|Successful"

const inbound = parseTxnResponse(decryptYagout(encryptYagout(inboundPlain, DOC_KEY), DOC_KEY))
check("inbound correlates on the order we sent", inbound.orderNo, ORDER_NO)
check("inbound amount matches what we raised", inbound.amount, AMOUNT)
checkTrue("inbound is recognised as paid", isSuccessfulTxnResponse(inbound))

// A wrong key must fail closed rather than yielding usable plaintext — this is
// what makes the return post authentic, since only Yagout and we hold the key.
const OTHER_KEY = Buffer.alloc(32, 7).toString("base64")
let wrongKeyRejected = false
try {
  const out = decryptYagout(merchantRequest, OTHER_KEY)
  wrongKeyRejected = out !== outboundPlain
} catch {
  wrongKeyRejected = true
}
checkTrue("a foreign key cannot read our payload", wrongKeyRejected)

// ---------------------------------------------------------------------------
// 6. Optional: parity with Yagout's own encryption API
// ---------------------------------------------------------------------------

const liveUrl = process.env.YAGOUTPAY_ENCRYPT_URL?.trim()
const liveKey = process.env.YAGOUTPAY_ENCRYPTION_KEY?.trim()
const liveMeId = process.env.YAGOUTPAY_MERCHANT_ID?.trim()

if (liveUrl && liveKey && liveMeId) {
  const probe = JSON.stringify({ me_id: liveMeId, amount: "100" })
  console.log("\nChecking ciphertext parity against Yagout's encryption API...")
  try {
    const res = await fetch(liveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/text", me_id: liveMeId },
      body: probe,
    })
    const text = await res.text()
    let theirs
    try {
      theirs = (JSON.parse(text).Response ?? "").trim()
    } catch {
      theirs = ""
    }

    if (!theirs) {
      failures++
      console.log(`FAIL  encryption API returned no ciphertext (HTTP ${res.status}): ${text.slice(0, 200)}`)
    } else {
      check("our ciphertext matches Yagout's", encryptYagout(probe, liveKey), theirs)
      check("we can decrypt Yagout's ciphertext", decryptYagout(theirs, liveKey), probe)
    }
  } catch (error) {
    failures++
    console.log(`FAIL  could not reach the encryption API: ${error.message}`)
  }
} else {
  console.log(
    "\nSKIP  ciphertext parity — set YAGOUTPAY_ENCRYPT_URL, YAGOUTPAY_MERCHANT_ID and YAGOUTPAY_ENCRYPTION_KEY to run it."
  )
  console.log("      Until this passes, treat our ciphertext as unverified: the document's own")
  console.log("      sample ciphertexts do not decrypt with the key the document publishes.")
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`)

// Set the code and let the event loop drain rather than calling process.exit():
// an immediate exit while Node is still tearing down the TypeScript loader
// trips a libuv assertion on Windows and reports a bogus status.
process.exitCode = failures === 0 ? 0 : 1
