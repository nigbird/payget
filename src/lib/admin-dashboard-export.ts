import { triggerBlobDownload } from "@/lib/qr-download"

export type DashboardStats = {
  range: { key: string; label: string; bucket: "day" | "week" | "month"; from: string; to: string; prevFrom: string }
  current: PeriodTotals
  previous: PeriodTotals
  changes: {
    volume: number | null
    successCount: number | null
    avgTicket: number | null
    payingMerchants: number | null
    newMerchants: number | null
    successRate: number | null
  }
  series: { date: string; label: string; volume: number; success: number; failed: number; pending: number }[]
  hourly: { hour: number; count: number; volume: number }[]
  paymentMethods: { method: string; volume: number; count: number }[]
  origins: { origin: string; volume: number; count: number }[]
  topMerchants: {
    id: string
    name: string
    branchName: string
    category: string
    volume: number
    count: number
    share: number
    change: number | null
  }[]
  failureReasons: { reason: string; count: number }[]
  merchantPipeline: Record<string, number>
  totalMerchants: number
  activeMerchants: number
  pendingMerchants: number
  activeUsers: number
}

export type PeriodTotals = {
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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa" })

const BRAND_GOLD = "FFF8B513"
const BRAND_BROWN = "FF754319"
const CREAM = "FFFFF7E6"
const MONEY = '#,##0.00 "ETB"'
const PCT = '0.0"%"'

/** Builds a multi-sheet Excel report of the current dashboard view and downloads it. */
export async function exportDashboardWorkbook(stats: DashboardStats, generatedBy?: string) {
  const exceljsModule = await import("exceljs")
  const ExcelJS = (exceljsModule as { default?: typeof import("exceljs") }).default ?? exceljsModule
  const wb = new ExcelJS.Workbook()
  wb.creator = "NibTera Merchants"
  wb.created = new Date()

  type Col = { header: string; key: string; width: number; numFmt?: string }
  const addTable = (name: string, columns: Col[], rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] })
    ws.columns = columns.map(({ header, key, width }) => ({ header, key, width }))
    ws.addRows(rows)
    columns.forEach((c, i) => {
      if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt
    })
    const head = ws.getRow(1)
    head.font = { bold: true, color: { argb: "FFFFFFFF" } }
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BROWN } }
    head.alignment = { vertical: "middle" }
    head.height = 20
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
    return ws
  }

  // Summary
  const summary = wb.addWorksheet("Summary")
  summary.columns = [{ width: 30 }, { width: 22 }, { width: 22 }, { width: 16 }]
  summary.addRow(["NibTera Merchants — Performance report"]).font = { bold: true, size: 14, color: { argb: BRAND_BROWN } }
  summary.addRow([`Period: ${fmtDate(stats.range.from)} – ${fmtDate(stats.range.to)} (${stats.range.label})`])
  summary.addRow([`Compared with: ${fmtDate(stats.range.prevFrom)} – ${fmtDate(stats.range.from)}`])
  summary.addRow([`Generated: ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa" })}${generatedBy ? ` by ${generatedBy}` : ""}`])
  summary.addRow([])
  const headRow = summary.addRow(["Metric", "This period", "Previous period", "Change"])
  headRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BROWN } }

  const { current: c, previous: p, changes } = stats
  const kpis: [string, number | null, number | null, number | null, string, string][] = [
    ["Successful volume", c.volume, p.volume, changes.volume, MONEY, PCT],
    ["Successful transactions", c.successCount, p.successCount, changes.successCount, "#,##0", PCT],
    ["Failed transactions", c.failedCount, p.failedCount, null, "#,##0", PCT],
    ["Pending / in-flight transactions", c.pendingCount, p.pendingCount, null, "#,##0", PCT],
    ["Success rate (of settled)", c.successRate, p.successRate, changes.successRate, PCT, '+0.0" pts";-0.0" pts"'],
    ["Average ticket", c.avgTicket, p.avgTicket, changes.avgTicket, MONEY, PCT],
    ["Merchants with sales", c.payingMerchants, p.payingMerchants, changes.payingMerchants, "#,##0", PCT],
    ["New merchant registrations", c.newMerchants, p.newMerchants, changes.newMerchants, "#,##0", PCT],
  ]
  for (const [label, cur, prev, change, fmt, changeFmt] of kpis) {
    const row = summary.addRow([label, cur, prev, change])
    row.getCell(2).numFmt = fmt
    row.getCell(3).numFmt = fmt
    row.getCell(4).numFmt = changeFmt
  }
  summary.addRow([])
  const snap = summary.addRow(["Current snapshot", "Count"])
  snap.font = { bold: true, color: { argb: "FFFFFFFF" } }
  snap.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BROWN } }
  summary.addRow(["Total merchants", stats.totalMerchants])
  summary.addRow(["Approved / active merchants", stats.activeMerchants])
  summary.addRow(["Awaiting approval", stats.pendingMerchants])
  summary.addRow(["Active system users", stats.activeUsers])

  addTable(
    "Trend",
    [
      { header: "Period", key: "label", width: 16 },
      { header: "Start date", key: "date", width: 14 },
      { header: "Successful volume", key: "volume", width: 20, numFmt: MONEY },
      { header: "Successful", key: "success", width: 12 },
      { header: "Failed", key: "failed", width: 10 },
      { header: "Pending", key: "pending", width: 10 },
      { header: "Success rate", key: "rate", width: 14, numFmt: PCT },
    ],
    stats.series.map((s) => ({
      ...s,
      rate: s.success + s.failed ? (s.success / (s.success + s.failed)) * 100 : null,
    })),
  )

  addTable(
    "Top merchants",
    [
      { header: "Rank", key: "rank", width: 7 },
      { header: "Merchant", key: "name", width: 32 },
      { header: "Merchant ID", key: "id", width: 16 },
      { header: "Branch", key: "branchName", width: 20 },
      { header: "Category", key: "category", width: 18 },
      { header: "Volume", key: "volume", width: 20, numFmt: MONEY },
      { header: "Transactions", key: "count", width: 14 },
      { header: "Share of volume", key: "share", width: 16, numFmt: PCT },
      { header: "Change vs previous", key: "change", width: 18, numFmt: PCT },
    ],
    stats.topMerchants.map((m, i) => ({ ...m, rank: i + 1 })),
  )

  addTable(
    "Channels",
    [
      { header: "Dimension", key: "dimension", width: 16 },
      { header: "Channel", key: "label", width: 22 },
      { header: "Volume", key: "volume", width: 20, numFmt: MONEY },
      { header: "Transactions", key: "count", width: 14 },
      { header: "Share of volume", key: "share", width: 16, numFmt: PCT },
    ],
    [
      ...stats.paymentMethods.map((m) => ({
        dimension: "Payment method",
        label: PAYMENT_METHOD_LABELS[m.method] ?? m.method,
        volume: m.volume,
        count: m.count,
        share: c.volume ? (m.volume / c.volume) * 100 : 0,
      })),
      ...stats.origins.map((o) => ({
        dimension: "Origin",
        label: ORIGIN_LABELS[o.origin] ?? o.origin,
        volume: o.volume,
        count: o.count,
        share: c.volume ? (o.volume / c.volume) * 100 : 0,
      })),
    ],
  )

  addTable(
    "Peak hours",
    [
      { header: "Hour (EAT)", key: "label", width: 12 },
      { header: "Successful transactions", key: "count", width: 22 },
      { header: "Volume", key: "volume", width: 20, numFmt: MONEY },
    ],
    stats.hourly.map((h) => ({ ...h, label: `${formatHour(h.hour)}–${formatHour((h.hour + 1) % 24)}` })),
  )

  addTable(
    "Failure reasons",
    [
      { header: "Provider reason", key: "reason", width: 48 },
      { header: "Failed transactions", key: "count", width: 20 },
      { header: "Share of failures", key: "share", width: 18, numFmt: PCT },
    ],
    stats.failureReasons.map((f) => ({ ...f, share: c.failedCount ? (f.count / c.failedCount) * 100 : 0 })),
  )

  addTable(
    "Merchant pipeline",
    [
      { header: "Stage", key: "label", width: 24 },
      { header: "Merchants", key: "count", width: 12 },
    ],
    PIPELINE_STAGES.map((s) => ({ label: s.label, count: stats.merchantPipeline[s.status] ?? 0 })),
  )

  // Light banding on data sheets for readability when printed.
  wb.worksheets.slice(1).forEach((ws) => {
    ws.eachRow((row, n) => {
      if (n > 1 && n % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } }
    })
    ws.getRow(1).border = { bottom: { style: "thin", color: { argb: BRAND_GOLD } } }
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  triggerBlobDownload(blob, `nibtera-performance-${stats.range.key}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
