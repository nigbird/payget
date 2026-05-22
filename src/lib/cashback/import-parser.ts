import { normalizeCashbackPhone } from "./phone"

export type ParsedEligibleRow = {
  phone: string
  accountNumber: string | null
  categoryName: string
  rowNumber: number
}

export type ImportParseError = {
  rowNumber: number
  message: string
}

export function parseCsvEligibleRows(content: string): {
  rows: ParsedEligibleRow[]
  errors: ImportParseError[]
} {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { rows: [], errors: [{ rowNumber: 0, message: "File is empty." }] }
  }

  const headerLine = lines[0]
  const delimiter = headerLine.includes(";") ? ";" : ","
  const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase())

  const phoneIdx = headers.findIndex((h) => h === "phone" || h === "phonenumber" || h === "mobile")
  const accountIdx = headers.findIndex((h) => h === "account" || h === "accountnumber" || h === "account_no")
  const categoryIdx = headers.findIndex((h) => h === "category" || h === "categoryname" || h === "group")

  if (phoneIdx < 0 || categoryIdx < 0) {
    return {
      rows: [],
      errors: [
        {
          rowNumber: 1,
          message: "Header must include phone and category columns (phone, category).",
        },
      ],
    }
  }

  const rows: ParsedEligibleRow[] = []
  const errors: ImportParseError[] = []

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1
    const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""))
    const rawPhone = cols[phoneIdx] ?? ""
    const phone = normalizeCashbackPhone(rawPhone)
    const categoryName = cols[categoryIdx] ?? ""
    const accountNumber = accountIdx >= 0 ? (cols[accountIdx] || "").replace(/\D/g, "") || null : null

    if (!phone) {
      errors.push({ rowNumber, message: `Invalid phone: ${rawPhone || "(empty)"}` })
      continue
    }
    if (!categoryName) {
      errors.push({ rowNumber, message: "Category name is required." })
      continue
    }

    rows.push({ phone, accountNumber, categoryName, rowNumber })
  }

  return { rows, errors }
}

export async function parseExcelEligibleRows(buffer: ArrayBuffer): Promise<{
  rows: ParsedEligibleRow[]
  errors: ImportParseError[]
}> {
  const exceljsModule = await import("exceljs")
  const ExcelJS = (exceljsModule as { default?: typeof import("exceljs") }).default ?? exceljsModule
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const sheet = workbook.worksheets[0]
  if (!sheet) {
    return { rows: [], errors: [{ rowNumber: 0, message: "Workbook has no sheets." }] }
  }

  const headerRow = sheet.getRow(1)
  const headers: string[] = []
  headerRow.eachCell((cell, col) => {
    headers[col] = String(cell.value ?? "")
      .trim()
      .toLowerCase()
  })

  const phoneIdx = headers.findIndex((h) => h === "phone" || h === "phonenumber" || h === "mobile")
  const accountIdx = headers.findIndex((h) => h === "account" || h === "accountnumber" || h === "account_no")
  const categoryIdx = headers.findIndex((h) => h === "category" || h === "categoryname" || h === "group")

  if (phoneIdx < 0 || categoryIdx < 0) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: "Header must include phone and category columns." }],
    }
  }

  const rows: ParsedEligibleRow[] = []
  const errors: ImportParseError[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const rawPhone = String(row.getCell(phoneIdx).value ?? "").trim()
    const phone = normalizeCashbackPhone(rawPhone)
    const categoryName = String(row.getCell(categoryIdx).value ?? "").trim()
    const accountRaw = accountIdx >= 0 ? String(row.getCell(accountIdx).value ?? "").trim() : ""
    const accountNumber = accountRaw.replace(/\D/g, "") || null

    if (!phone) {
      errors.push({ rowNumber, message: `Invalid phone: ${rawPhone || "(empty)"}` })
      return
    }
    if (!categoryName) {
      errors.push({ rowNumber, message: "Category name is required." })
      return
    }

    rows.push({ phone, accountNumber, categoryName, rowNumber })
  })

  return { rows, errors }
}
