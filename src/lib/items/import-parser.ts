import { hasAnyDangerousExtension } from "@/lib/file-validation"

export const ITEMS_IMPORT_LIMITS = {
  importMaxBytes: 5 * 1024 * 1024,
  importMaxRows: 500,
  nameMax: 60,
  categoryNameMax: 40,
  priceMax: 9_999_999.99,
  allowedImportExtensions: ["csv", "txt", "xlsx", "xls"] as const,
}

export type ParsedItemRow = {
  name: string
  price: number
  categoryName: string | null
  rowNumber: number
}

export type ImportParseError = {
  rowNumber: number
  message: string
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "")
  if (!cleaned) return null
  const price = Number(cleaned)
  if (!Number.isFinite(price) || price <= 0 || price > ITEMS_IMPORT_LIMITS.priceMax) return null
  return price
}

function buildRow(
  rawName: string,
  rawPrice: string,
  rawCategory: string,
  rowNumber: number,
  errors: ImportParseError[]
): ParsedItemRow | null {
  const name = rawName.trim()
  if (!name) {
    errors.push({ rowNumber, message: "Item name is required." })
    return null
  }
  if (name.length > ITEMS_IMPORT_LIMITS.nameMax) {
    errors.push({ rowNumber, message: `Item name must be ${ITEMS_IMPORT_LIMITS.nameMax} characters or fewer.` })
    return null
  }

  const price = parsePrice(rawPrice)
  if (price === null) {
    errors.push({ rowNumber, message: `Invalid price: ${rawPrice || "(empty)"}` })
    return null
  }

  const categoryName = rawCategory.trim()
  if (categoryName.length > ITEMS_IMPORT_LIMITS.categoryNameMax) {
    errors.push({ rowNumber, message: `Category name must be ${ITEMS_IMPORT_LIMITS.categoryNameMax} characters or fewer.` })
    return null
  }

  return { name, price, categoryName: categoryName || null, rowNumber }
}

export function parseCsvItemRows(content: string): {
  rows: ParsedItemRow[]
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

  const nameIdx = headers.findIndex((h) => h === "name" || h === "item" || h === "item name" || h === "itemname")
  const priceIdx = headers.findIndex((h) => h === "price" || h === "price (etb)" || h === "amount")
  const categoryIdx = headers.findIndex((h) => h === "category" || h === "category name")

  if (nameIdx < 0 || priceIdx < 0) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: "Header must include 'Item Name' and 'Price' columns." }],
    }
  }

  const rows: ParsedItemRow[] = []
  const errors: ImportParseError[] = []

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1
    const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""))
    const row = buildRow(
      cols[nameIdx] ?? "",
      cols[priceIdx] ?? "",
      categoryIdx >= 0 ? cols[categoryIdx] ?? "" : "",
      rowNumber,
      errors
    )
    if (row) rows.push(row)
  }

  return { rows, errors }
}

export async function parseExcelItemRows(buffer: ArrayBuffer): Promise<{
  rows: ParsedItemRow[]
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

  const nameIdx = headers.findIndex((h) => h === "name" || h === "item" || h === "item name" || h === "itemname")
  const priceIdx = headers.findIndex((h) => h === "price" || h === "price (etb)" || h === "amount")
  const categoryIdx = headers.findIndex((h) => h === "category" || h === "category name")

  if (nameIdx < 0 || priceIdx < 0) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, message: "Header must include 'Item Name' and 'Price' columns." }],
    }
  }

  const rows: ParsedItemRow[] = []
  const errors: ImportParseError[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const rawName = String(row.getCell(nameIdx).value ?? "").trim()
    const rawPrice = String(row.getCell(priceIdx).value ?? "").trim()
    const rawCategory = categoryIdx >= 0 ? String(row.getCell(categoryIdx).value ?? "").trim() : ""
    const parsedRow = buildRow(rawName, rawPrice, rawCategory, rowNumber, errors)
    if (parsedRow) rows.push(parsedRow)
  })

  return { rows, errors }
}

export function validateItemsImportFile(file: File): { valid: boolean; error?: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (!ITEMS_IMPORT_LIMITS.allowedImportExtensions.includes(ext as (typeof ITEMS_IMPORT_LIMITS.allowedImportExtensions)[number])) {
    return { valid: false, error: "Only CSV, TXT, XLS, or XLSX files are allowed." }
  }

  if (hasAnyDangerousExtension(file.name)) {
    return { valid: false, error: "File contains dangerous extensions." }
  }

  if (file.size > ITEMS_IMPORT_LIMITS.importMaxBytes) {
    const mb = ITEMS_IMPORT_LIMITS.importMaxBytes / (1024 * 1024)
    return { valid: false, error: `File size must not exceed ${mb} MB.` }
  }

  if (file.size === 0) {
    return { valid: false, error: "File is empty." }
  }

  return { valid: true }
}
