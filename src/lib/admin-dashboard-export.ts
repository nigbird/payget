import type { Workbook, Worksheet } from "exceljs"
import { triggerBlobDownload } from "@/lib/qr-download"

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export type DashboardPeriod = {
  fromDate: string
  toDate: string
  days: number
  bucket: "day" | "week" | "month"
  prevFrom: string
}

export type MerchantOption = { id: string; name: string; branchName: string }

export type BusinessStats = {
  period: DashboardPeriod
  merchant: { id: string; name: string } | null
  current: BusinessTotals
  previous: BusinessTotals
  changes: { amount: number | null; successCount: number | null; totalCount: number | null; avgTicket: number | null }
  series: { date: string; label: string; amount: number; successCount: number; totalCount: number }[]
  byMerchant: {
    id: string
    name: string
    branchName: string
    successCount: number
    totalCount: number
    failedCount: number
    amount: number
    share: number
  }[]
  merchants: MerchantOption[]
}

export type BusinessTotals = {
  amount: number
  successCount: number
  totalCount: number
  failedCount: number
  avgTicket: number
  merchantsWithSales: number
}

export type BusinessTransaction = {
  id: string
  transactionReference: string
  cbsreference: string | null
  amount: number
  status: string
  paymentMethod: string
  origin: string
  timestamp: string
  merchant: { id: string; name: string; branchName: string }
}

export type TechnicalTotals = {
  volume: number
  successCount: number
  failedCount: number
  pendingCount: number
  totalCount: number
  avgTicket: number
  successRate: number | null
  payingMerchants: number
  newMerchants: number
}

export type TechnicalStats = {
  period: DashboardPeriod
  merchant: { id: string; name: string } | null
  current: TechnicalTotals
  previous: TechnicalTotals
  changes: {
    volume: number | null
    successCount: number | null
    avgTicket: number | null
    payingMerchants: number | null
    newMerchants: number | null
    successRate: number | null
  }
  series: {
    date: string
    label: string
    volume: number
    success: number
    failed: number
    pending: number
    successRate: number | null
  }[]
  hourly: { hour: number; count: number; failed: number; volume: number }[]
  statusBreakdown: Record<string, number>
  methodHealth: {
    method: string
    total: number
    success: number
    failed: number
    pending: number
    volume: number
    successRate: number | null
  }[]
  origins: { origin: string; volume: number; count: number }[]
  providerErrors: { code: string; reason: string; count: number }[]
  stuck: {
    count: number
    thresholdMinutes: number
    oldest: {
      id: string
      reference: string
      merchant: string
      amount: number
      status: string
      method: string
      timestamp: string
    }[]
  }
  topMerchants: {
    id: string
    name: string
    branchName: string
    volume: number
    count: number
    total: number
    failed: number
    share: number
    change: number | null
  }[]
  failingMerchants: {
    id: string
    name: string
    branchName: string
    total: number
    success: number
    failed: number
    successRate: number | null
  }[]
  operations: {
    callbacks: { pending: number; delivered: number; exhausted: number }
    paymentReconPending: number
    mpgsReconPending: number
    cashback: { status: string; count: number; amount: number }[]
    activeSessions: number
    ipLockouts: number
    identifierLockouts: number
  }
  merchantPipeline: Record<string, number>
  totalMerchants: number
  activeMerchants: number
  pendingMerchants: number
  activeUsers: number
  merchants: MerchantOption[]
}

// ---------------------------------------------------------------------------
// Labels shared by the dashboards and their exports
// ---------------------------------------------------------------------------

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK: "Nib account",
  TELEBIRR: "telebirr",
  MPGS: "Card (MPGS)",
  YAGOUT: "YagoutPay",
}

export const ORIGIN_LABELS: Record<string, string> = {
  INTERNAL: "NibTera checkout",
  EXTERNAL: "External credits",
}

export const STATUS_LABELS: Record<string, string> = {
  SUCCESS: "Successful",
  FAILED: "Failed",
  INITIATED: "Initiated",
  PENDING: "Pending",
  AWAITING_PIN: "Awaiting PIN",
  PROCESSING: "Processing",
}

export const PIPELINE_STAGES: { status: string; label: string }[] = [
  { status: "PENDING", label: "Pending review" },
  { status: "BRANCH_APPROVED", label: "Branch approved" },
  { status: "RESUBMITTED", label: "Resubmitted" },
  { status: "REJECTED_WITH_UPDATE", label: "Returned for update" },
  { status: "REJECTED", label: "Rejected" },
  { status: "APPROVED", label: "Approved" },
  { status: "ACTIVE", label: "Active" },
]

export const formatHour = (h: number) => `${String(h).padStart(2, "0")}:00`

/** "1 Sep 2026" from a YYYY-MM-DD local date. */
export const formatLocalDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

export const formatPeriod = (p: DashboardPeriod) =>
  p.fromDate === p.toDate ? formatLocalDate(p.fromDate) : `${formatLocalDate(p.fromDate)} – ${formatLocalDate(p.toDate)}`

const formatEat = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa", dateStyle: "medium", timeStyle: "short" })

// ---------------------------------------------------------------------------
// Workbook helpers
// ---------------------------------------------------------------------------

const BRAND_GOLD = "FFF8B513"
const BRAND_BROWN = "FF754319"
const CREAM = "FFFFF7E6"
const MONEY = '#,##0.00 "ETB"'
const PCT = '0.0"%"'
const PTS = '+0.0" pts";-0.0" pts"'

type Col = { header: string; key: string; width: number; numFmt?: string }

async function newWorkbook(): Promise<Workbook> {
  const exceljsModule = await import("exceljs")
  const ExcelJS = (exceljsModule as { default?: typeof import("exceljs") }).default ?? exceljsModule
  const wb = new ExcelJS.Workbook()
  wb.creator = "NibTera Merchants"
  wb.created = new Date()
  return wb
}

function styleHeader(row: ReturnType<Worksheet["getRow"]>) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } }
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BROWN } }
  row.alignment = { vertical: "middle" }
  row.height = 20
}

function addTable(wb: Workbook, name: string, columns: Col[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] })
  ws.columns = columns.map(({ header, key, width }) => ({ header, key, width }))
  ws.addRows(rows)
  columns.forEach((c, i) => {
    if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt
  })
  styleHeader(ws.getRow(1))
  ws.getRow(1).border = { bottom: { style: "thin", color: { argb: BRAND_GOLD } } }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  ws.eachRow((row, n) => {
    if (n > 1 && n % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } }
  })
  return ws
}

/** Summary sheet: title, filter context, then a metric/current/previous/change table. */
function addSummary(
  wb: Workbook,
  title: string,
  period: DashboardPeriod,
  merchant: { name: string } | null,
  generatedBy: string | undefined,
  kpis: [label: string, current: number | null, previous: number | null, change: number | null, fmt: string, changeFmt?: string][],
) {
  const ws = wb.addWorksheet("Summary")
  ws.columns = [{ width: 34 }, { width: 22 }, { width: 22 }, { width: 16 }]
  ws.addRow([title]).font = { bold: true, size: 14, color: { argb: BRAND_BROWN } }
  ws.addRow([`Period: ${formatPeriod(period)} (${period.days} day${period.days === 1 ? "" : "s"})`])
  ws.addRow([`Merchant: ${merchant?.name ?? "All merchants"}`])
  ws.addRow([`Compared with the previous ${period.days} day${period.days === 1 ? "" : "s"}`])
  ws.addRow([`Generated: ${formatEat(new Date().toISOString())}${generatedBy ? ` by ${generatedBy}` : ""}`])
  ws.addRow([])
  styleHeader(ws.addRow(["Metric", "This period", "Previous period", "Change"]))
  for (const [label, cur, prev, change, fmt, changeFmt] of kpis) {
    const row = ws.addRow([label, cur, prev, change])
    row.getCell(2).numFmt = fmt
    row.getCell(3).numFmt = fmt
    row.getCell(4).numFmt = changeFmt ?? PCT
  }
  return ws
}

async function download(wb: Workbook, prefix: string, period: DashboardPeriod) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  triggerBlobDownload(blob, `${prefix}-${period.fromDate}-to-${period.toDate}.xlsx`)
}

// ---------------------------------------------------------------------------
// Business export
// ---------------------------------------------------------------------------

export async function exportBusinessWorkbook(
  stats: BusinessStats,
  detail: { transactions: BusinessTransaction[]; truncated: boolean; limit: number },
  generatedBy?: string,
) {
  const wb = await newWorkbook()
  const { current: c, previous: p, changes } = stats

  const summary = addSummary(wb, "NibTera Merchants — Business report", stats.period, stats.merchant, generatedBy, [
    ["Amount collected", c.amount, p.amount, changes.amount, MONEY],
    ["Successful transactions", c.successCount, p.successCount, changes.successCount, "#,##0"],
    ["Total transactions", c.totalCount, p.totalCount, changes.totalCount, "#,##0"],
    ["Failed transactions", c.failedCount, p.failedCount, null, "#,##0"],
    ["Average transaction", c.avgTicket, p.avgTicket, changes.avgTicket, MONEY],
    ["Merchants with sales", c.merchantsWithSales, p.merchantsWithSales, null, "#,##0"],
  ])
  if (detail.truncated) {
    summary.addRow([])
    summary.addRow([
      `Note: the Transactions sheet lists the latest ${detail.limit.toLocaleString()} transactions only. Narrow the date range or pick a merchant to export all.`,
    ]).font = { italic: true, color: { argb: "FFB45309" } }
  }

  addTable(
    wb,
    "By merchant",
    [
      { header: "Merchant", key: "name", width: 32 },
      { header: "Merchant ID", key: "id", width: 16 },
      { header: "Branch", key: "branchName", width: 20 },
      { header: "Successful", key: "successCount", width: 12 },
      { header: "Total", key: "totalCount", width: 10 },
      { header: "Success rate", key: "rate", width: 13, numFmt: PCT },
      { header: "Amount collected", key: "amount", width: 20, numFmt: MONEY },
      { header: "Share of amount", key: "share", width: 16, numFmt: PCT },
    ],
    // Business success rate is successful ÷ all transactions, matching the dashboard.
    stats.byMerchant.map((m) => ({ ...m, rate: m.totalCount ? (m.successCount / m.totalCount) * 100 : null })),
  )

  addTable(
    wb,
    stats.period.bucket === "day" ? "By day" : stats.period.bucket === "week" ? "By week" : "By month",
    [
      { header: "Period", key: "label", width: 16 },
      { header: "Start date", key: "date", width: 13 },
      { header: "Successful", key: "successCount", width: 12 },
      { header: "Total", key: "totalCount", width: 10 },
      { header: "Amount collected", key: "amount", width: 20, numFmt: MONEY },
    ],
    stats.series,
  )

  addTable(
    wb,
    "Transactions",
    [
      { header: "Date & time (EAT)", key: "when", width: 22 },
      { header: "Merchant", key: "merchant", width: 28 },
      { header: "Branch", key: "branch", width: 18 },
      { header: "Reference", key: "transactionReference", width: 22 },
      { header: "FT / CBS reference", key: "cbs", width: 20 },
      { header: "Payment method", key: "method", width: 16 },
      { header: "Status", key: "status", width: 14 },
      { header: "Amount", key: "amount", width: 16, numFmt: MONEY },
    ],
    detail.transactions.map((t) => ({
      when: formatEat(t.timestamp),
      merchant: t.merchant.name,
      branch: t.merchant.branchName,
      transactionReference: t.transactionReference,
      cbs: t.cbsreference ?? "",
      method: PAYMENT_METHOD_LABELS[t.paymentMethod] ?? t.paymentMethod,
      status: STATUS_LABELS[t.status] ?? t.status,
      amount: t.amount,
    })),
  )

  await download(wb, "nibtera-business-report", stats.period)
}

// ---------------------------------------------------------------------------
// Technical export
// ---------------------------------------------------------------------------

export async function exportTechnicalWorkbook(stats: TechnicalStats, generatedBy?: string) {
  const wb = await newWorkbook()
  const { current: c, previous: p, changes, operations: ops } = stats

  const summary = addSummary(wb, "NibTera Merchants — Technical report", stats.period, stats.merchant, generatedBy, [
    ["Successful volume", c.volume, p.volume, changes.volume, MONEY],
    ["Successful transactions", c.successCount, p.successCount, changes.successCount, "#,##0"],
    ["Failed transactions", c.failedCount, p.failedCount, null, "#,##0"],
    ["In-flight / unresolved transactions", c.pendingCount, p.pendingCount, null, "#,##0"],
    ["Success rate (of settled)", c.successRate, p.successRate, changes.successRate, PCT, PTS],
    ["Average ticket", c.avgTicket, p.avgTicket, changes.avgTicket, MONEY],
    ["Merchants with sales", c.payingMerchants, p.payingMerchants, changes.payingMerchants, "#,##0"],
    ["New merchant registrations", c.newMerchants, p.newMerchants, changes.newMerchants, "#,##0"],
  ])
  summary.addRow([])
  styleHeader(summary.addRow(["Operational snapshot (now)", "Count"]))
  for (const [label, value] of [
    [`Stuck payments (> ${stats.stuck.thresholdMinutes} min, in period)`, stats.stuck.count],
    ["Callbacks queued for retry", ops.callbacks.pending],
    ["Callbacks exhausted (gave up)", ops.callbacks.exhausted],
    ["Payment reconciliation requests pending", ops.paymentReconPending],
    ["Card (MPGS) reconciliation requests pending", ops.mpgsReconPending],
    ["Active sessions", ops.activeSessions],
    ["Locked-out IP addresses", ops.ipLockouts],
    ["Locked-out login identifiers", ops.identifierLockouts],
    ["Total merchants", stats.totalMerchants],
    ["Approved / active merchants", stats.activeMerchants],
    ["Awaiting approval", stats.pendingMerchants],
    ["Active system users", stats.activeUsers],
  ] as const) {
    summary.addRow([label, value])
  }

  addTable(
    wb,
    "Trend",
    [
      { header: "Period", key: "label", width: 16 },
      { header: "Start date", key: "date", width: 13 },
      { header: "Successful volume", key: "volume", width: 20, numFmt: MONEY },
      { header: "Successful", key: "success", width: 12 },
      { header: "Failed", key: "failed", width: 10 },
      { header: "In flight", key: "pending", width: 10 },
      { header: "Success rate", key: "successRate", width: 13, numFmt: PCT },
    ],
    stats.series,
  )

  addTable(
    wb,
    "Payment methods",
    [
      { header: "Payment method", key: "label", width: 18 },
      { header: "Attempts", key: "total", width: 11 },
      { header: "Successful", key: "success", width: 12 },
      { header: "Failed", key: "failed", width: 10 },
      { header: "In flight", key: "pending", width: 10 },
      { header: "Success rate", key: "successRate", width: 13, numFmt: PCT },
      { header: "Volume", key: "volume", width: 20, numFmt: MONEY },
    ],
    stats.methodHealth.map((m) => ({ ...m, label: PAYMENT_METHOD_LABELS[m.method] ?? m.method })),
  )

  addTable(
    wb,
    "Statuses",
    [
      { header: "Status", key: "label", width: 16 },
      { header: "Transactions", key: "count", width: 14 },
    ],
    Object.entries(stats.statusBreakdown).map(([s, count]) => ({ label: STATUS_LABELS[s] ?? s, count })),
  )

  addTable(
    wb,
    "Provider errors",
    [
      { header: "Code", key: "code", width: 14 },
      { header: "Provider reason", key: "reason", width: 50 },
      { header: "Failed transactions", key: "count", width: 20 },
      { header: "Share of failures", key: "share", width: 18, numFmt: PCT },
    ],
    stats.providerErrors.map((e) => ({ ...e, share: c.failedCount ? (e.count / c.failedCount) * 100 : 0 })),
  )

  addTable(
    wb,
    "Stuck payments",
    [
      { header: "Started (EAT)", key: "when", width: 22 },
      { header: "Merchant", key: "merchant", width: 28 },
      { header: "Reference", key: "reference", width: 22 },
      { header: "Transaction ID", key: "id", width: 18 },
      { header: "Method", key: "method", width: 14 },
      { header: "Status", key: "status", width: 14 },
      { header: "Amount", key: "amount", width: 16, numFmt: MONEY },
    ],
    stats.stuck.oldest.map((t) => ({
      ...t,
      when: formatEat(t.timestamp),
      method: PAYMENT_METHOD_LABELS[t.method] ?? t.method,
      status: STATUS_LABELS[t.status] ?? t.status,
    })),
  )

  addTable(
    wb,
    "Top merchants",
    [
      { header: "Rank", key: "rank", width: 7 },
      { header: "Merchant", key: "name", width: 32 },
      { header: "Merchant ID", key: "id", width: 16 },
      { header: "Branch", key: "branchName", width: 20 },
      { header: "Volume", key: "volume", width: 20, numFmt: MONEY },
      { header: "Successful", key: "count", width: 12 },
      { header: "Attempts", key: "total", width: 11 },
      { header: "Share of volume", key: "share", width: 16, numFmt: PCT },
      { header: "Change vs previous", key: "change", width: 18, numFmt: PCT },
    ],
    stats.topMerchants.map((m, i) => ({ ...m, rank: i + 1 })),
  )

  addTable(
    wb,
    "Merchant failures",
    [
      { header: "Merchant", key: "name", width: 32 },
      { header: "Merchant ID", key: "id", width: 16 },
      { header: "Attempts", key: "total", width: 11 },
      { header: "Successful", key: "success", width: 12 },
      { header: "Failed", key: "failed", width: 10 },
      { header: "Success rate", key: "successRate", width: 13, numFmt: PCT },
    ],
    stats.failingMerchants,
  )

  addTable(
    wb,
    "Hourly",
    [
      { header: "Hour (EAT)", key: "label", width: 14 },
      { header: "Successful", key: "count", width: 12 },
      { header: "Failed", key: "failed", width: 10 },
      { header: "Volume", key: "volume", width: 20, numFmt: MONEY },
    ],
    stats.hourly.map((h) => ({ ...h, label: `${formatHour(h.hour)}–${formatHour((h.hour + 1) % 24)}` })),
  )

  addTable(
    wb,
    "Cashback",
    [
      { header: "Status", key: "status", width: 16 },
      { header: "Cashback transactions", key: "count", width: 22 },
      { header: "Cashback amount", key: "amount", width: 20, numFmt: MONEY },
    ],
    ops.cashback,
  )

  addTable(
    wb,
    "Merchant pipeline",
    [
      { header: "Stage", key: "label", width: 24 },
      { header: "Merchants", key: "count", width: 12 },
    ],
    PIPELINE_STAGES.map((s) => ({ label: s.label, count: stats.merchantPipeline[s.status] ?? 0 })),
  )

  await download(wb, "nibtera-technical-report", stats.period)
}
