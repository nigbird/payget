/**
 * The YagoutPay Aggregator Hosted wire format (integration document section 4A).
 *
 * A request is nine sections joined with "~", each section's own fields joined
 * with "|". Position is the only thing identifying a field — there are no
 * names on the wire — so a section with the wrong number of fields is silently
 * misread by the gateway rather than rejected. Every width below is fixed and
 * verified against the worked example on page 11 of the document.
 */

export const YAGOUT_AGGREGATOR_ID = "yagout"

/** Yagout settles Ethiopian birr; the country code is "ETH", not "ET". */
export const YAGOUT_COUNTRY = "ETH"
export const YAGOUT_CURRENCY = "ETB"

/** Static per the spec — every hosted request is a sale from a web channel. */
export const YAGOUT_TXN_TYPE = "SALE"
export const YAGOUT_CHANNEL_WEB = "WEB"

export type YagoutTxnDetails = {
  agId: string
  meId: string
  orderNo: string
  /** Already formatted to 2dp by the caller, and identical to the hashed amount. */
  amount: string
  country: string
  currency: string
  txnType: string
  successUrl: string
  failureUrl: string
  channel: string
}

export type YagoutCustDetails = {
  custName?: string
  emailId: string
  mobileNo: string
  uniqueId?: string
  /** "Y" when the payer is a signed-in user of the merchant's system. */
  isLoggedIn: string
}

export type YagoutBillDetails = {
  billAddress?: string
  billCity?: string
  billState?: string
  billCountry?: string
  billZip?: string
}

export type YagoutItemDetails = {
  itemCount?: string
  itemValue?: string
  itemCategory?: string
}

export type YagoutOtherDetails = {
  udf1?: string
  udf2?: string
  udf3?: string
  udf4?: string
  udf5?: string
}

export type YagoutHostedRequest = {
  txn: YagoutTxnDetails
  cust: YagoutCustDetails
  bill?: YagoutBillDetails
  item?: YagoutItemDetails
  other?: YagoutOtherDetails
}

/**
 * "|" and "~" are the framing characters, so a value containing either would
 * shift every later field by one position and be misattributed rather than
 * rejected. A customer name or service description is free text that can
 * legitimately contain a pipe, so this is a real input, not a theoretical one:
 * we fail loudly at build time instead of sending a corrupt request.
 */
function assertFramingSafe(section: string, field: string, value: string): void {
  if (value.includes("|") || value.includes("~")) {
    throw new Error(
      `Yagout ${section}.${field} may not contain "|" or "~" — they delimit the request`
    )
  }
}

function joinSection(
  section: string,
  fields: Array<[name: string, value: string | undefined]>,
  expectedWidth: number
): string {
  if (fields.length !== expectedWidth) {
    throw new Error(
      `Yagout ${section} must have exactly ${expectedWidth} fields, got ${fields.length}`
    )
  }

  return fields
    .map(([name, value]) => {
      const text = (value ?? "").trim()
      assertFramingSafe(section, name, text)
      return text
    })
    .join("|")
}

function assertRequired(txn: YagoutTxnDetails, cust: YagoutCustDetails): void {
  const missing: string[] = []

  const required: Array<[string, string | undefined]> = [
    ["agId", txn.agId],
    ["meId", txn.meId],
    ["orderNo", txn.orderNo],
    ["amount", txn.amount],
    ["country", txn.country],
    ["currency", txn.currency],
    ["txnType", txn.txnType],
    ["successUrl", txn.successUrl],
    ["failureUrl", txn.failureUrl],
    ["channel", txn.channel],
    ["emailId", cust.emailId],
    ["mobileNo", cust.mobileNo],
  ]

  required.forEach(([name, value]) => {
    if (!value || !value.trim()) missing.push(name)
  })

  if (missing.length > 0) {
    throw new Error(`Yagout request is missing mandatory fields: ${missing.join(", ")}`)
  }
}

/**
 * Builds the plaintext that becomes `merchant_request` once encrypted.
 *
 * pg_details, card_details, ship_details and upi_details are always blank for
 * the hosted flow — the document requires the sections to be present and
 * correctly widthed even when empty, which is why they are spelled out rather
 * than omitted.
 */
export function buildHostedMerchantRequest(request: YagoutHostedRequest): string {
  const { txn, cust } = request
  const bill = request.bill ?? {}
  const item = request.item ?? {}
  const other = request.other ?? {}

  assertRequired(txn, cust)

  const txnDetails = joinSection(
    "txn_details",
    [
      ["agId", txn.agId],
      ["meId", txn.meId],
      ["orderNo", txn.orderNo],
      ["amount", txn.amount],
      ["country", txn.country],
      ["currency", txn.currency],
      ["txnType", txn.txnType],
      ["successUrl", txn.successUrl],
      ["failureUrl", txn.failureUrl],
      ["channel", txn.channel],
    ],
    10
  )

  const pgDetails = joinSection(
    "pg_details",
    [
      ["pgId", ""],
      ["paymode", ""],
      ["scheme", ""],
      ["walletType", ""],
    ],
    4
  )

  const cardDetails = joinSection(
    "card_details",
    [
      ["cardNo", ""],
      ["expMonth", ""],
      ["expYear", ""],
      ["cvv", ""],
      ["cardName", ""],
    ],
    5
  )

  const custDetails = joinSection(
    "cust_details",
    [
      ["custName", cust.custName],
      ["emailId", cust.emailId],
      ["mobileNo", cust.mobileNo],
      ["uniqueId", cust.uniqueId],
      ["isLoggedIn", cust.isLoggedIn],
    ],
    5
  )

  const billDetails = joinSection(
    "bill_details",
    [
      ["billAddress", bill.billAddress],
      ["billCity", bill.billCity],
      ["billState", bill.billState],
      ["billCountry", bill.billCountry],
      ["billZip", bill.billZip],
    ],
    5
  )

  const shipDetails = joinSection(
    "ship_details",
    [
      ["shipAddress", ""],
      ["shipCity", ""],
      ["shipState", ""],
      ["shipCountry", ""],
      ["shipZip", ""],
      ["shipDays", ""],
      ["addressCount", ""],
    ],
    7
  )

  const itemDetails = joinSection(
    "item_details",
    [
      ["itemCount", item.itemCount],
      ["itemValue", item.itemValue],
      ["itemCategory", item.itemCategory],
    ],
    3
  )

  const upiDetails = joinSection("upi_details", [["upiId", ""]], 1)

  const otherDetails = joinSection(
    "other_details",
    [
      ["udf1", other.udf1],
      ["udf2", other.udf2],
      ["udf3", other.udf3],
      ["udf4", other.udf4],
      ["udf5", other.udf5],
    ],
    5
  )

  return [
    txnDetails,
    pgDetails,
    cardDetails,
    custDetails,
    billDetails,
    shipDetails,
    itemDetails,
    upiDetails,
    otherDetails,
  ].join("~")
}

/** Decrypted `txn_response` — 13 positional fields (document page 14). */
export type YagoutTxnResponse = {
  agId: string
  meId: string
  orderNo: string
  amount: string
  country: string
  currency: string
  txnDate: string
  txnTime: string
  /** Aggregator reference. */
  agRef: string
  /** Gateway reference — the one to quote to Yagout when reconciling. */
  pgRef: string
  status: string
  resCode: string
  resMessage: string
}

/**
 * Reads by position, tolerating a short or long field list rather than
 * throwing: a response that reached us at all may represent money that has
 * already moved, so a shape we half-recognise must still be inspectable by the
 * caller instead of being discarded.
 */
export function parseTxnResponse(plaintext: string): YagoutTxnResponse {
  const f = plaintext.split("|")
  const at = (index: number) => (f[index] ?? "").trim()

  return {
    agId: at(0),
    meId: at(1),
    orderNo: at(2),
    amount: at(3),
    country: at(4),
    currency: at(5),
    txnDate: at(6),
    txnTime: at(7),
    agRef: at(8),
    pgRef: at(9),
    status: at(10),
    resCode: at(11),
    resMessage: at(12),
  }
}

/** Decrypted `pg_details` from a response — pg_id, pg_name, paymode, scheme. */
export type YagoutResponsePgDetails = {
  pgId: string
  pgName: string
  paymode: string
  scheme: string
}

export function parseResponsePgDetails(plaintext: string): YagoutResponsePgDetails {
  const f = plaintext.split("|")
  const at = (index: number) => (f[index] ?? "").trim()

  return { pgId: at(0), pgName: at(1), paymode: at(2), scheme: at(3) }
}

/**
 * A payment counts as taken only when the gateway says so twice — the word and
 * the code must agree. Anything else, including a status we do not recognise,
 * is treated as not-success by the caller.
 */
export function isSuccessfulTxnResponse(response: YagoutTxnResponse): boolean {
  return response.status.toLowerCase() === "successful" && response.resCode === "0"
}
