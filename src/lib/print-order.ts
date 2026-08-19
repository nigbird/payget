import type { Transaction, TransactionItemLine } from "@/lib/db"

const GENERAL_BUCKET = "General"

/** Groups an order's items into one ticket per print station (main category), falling back to the plain category, then a catch-all bucket. */
function groupItemsForPrint(items: TransactionItemLine[] | undefined) {
  const buckets = new Map<string, TransactionItemLine[]>()
  for (const line of items ?? []) {
    const key = line.mainCategoryName || line.categoryName || GENERAL_BUCKET
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(line)
  }
  if (buckets.size === 0) buckets.set(GENERAL_BUCKET, [])
  return Array.from(buckets.entries()).map(([title, lines]) => ({ title, lines }))
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function ticketHtml(params: {
  merchantName: string
  orderNo: string
  date: string
  orderBy: string
  tableNo: string
  shift: string
  title: string
  lines: TransactionItemLine[]
}) {
  const rows = params.lines.length
    ? params.lines
        .map(
          (l) =>
            `<tr><td class="qty">${l.quantity}</td><td class="name">${escapeHtml(l.name)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="2" class="empty">No items on this order</td></tr>`

  return `
    <section class="ticket">
      <div class="merchant">${escapeHtml(params.merchantName)}</div>
      <div class="title">${escapeHtml(params.title.toUpperCase())} ORDER</div>
      <div class="meta">
        <div>Order No: ${escapeHtml(params.orderNo)}</div>
        <div>Date: ${escapeHtml(params.date)}</div>
        <div>Order By: ${escapeHtml(params.orderBy)}</div>
        <div>Table: ${escapeHtml(params.tableNo)} &nbsp;&nbsp; Shift: ${escapeHtml(params.shift)}</div>
      </div>
      <table>
        <thead><tr><th class="qty">Qty</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `
}

/** Opens a new window with one kitchen/bar ticket per main category and triggers the browser print dialog. */
export function printOrder(
  tx: Transaction,
  merchantName: string,
  overrides?: { tableNo?: string | null; shift?: string | null }
) {
  const tableNo = overrides?.tableNo ?? tx.printInfo?.tableNo ?? "0"
  const shift = overrides?.shift ?? tx.printInfo?.shift ?? "Shift 1"
  const orderBy = tx.userCredentials.initiatedByName || "System"
  const date = new Date(tx.transactionTimestamp).toLocaleString()

  const groups = groupItemsForPrint(tx.items)
  const tickets = groups
    .map((g) =>
      ticketHtml({
        merchantName,
        orderNo: tx.transactionReference,
        date,
        orderBy,
        tableNo,
        shift,
        title: g.title,
        lines: g.lines,
      })
    )
    .join("")

  const win = window.open("", "_blank", "width=400,height=600")
  if (!win) return

  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Order ${escapeHtml(tx.transactionReference)}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; margin: 0; }
          .ticket { padding: 4px 0; page-break-after: always; }
          .ticket:last-child { page-break-after: auto; }
          .merchant { text-align: center; font-weight: bold; font-size: 14px; }
          .title { text-align: center; font-weight: bold; margin: 6px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 3px 0; }
          .meta { margin-bottom: 6px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; }
          th, td { text-align: left; padding: 2px 0; }
          th.qty, td.qty { width: 32px; }
          thead tr { border-bottom: 1px dashed #000; }
          .empty { text-align: center; font-style: italic; padding: 8px 0; }
        </style>
      </head>
      <body>
        ${tickets}
        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
    </html>
  `)
  win.document.close()
}
