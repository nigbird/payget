import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"
import { getOrCreateCashbackConfig } from "@/lib/cashback/service"
import { parseCsvEligibleRows, parseExcelEligibleRows } from "@/lib/cashback/import-parser"
import { writeAuditLog } from "@/lib/audit-log"
import { CASHBACK_LIMITS, validateImportFile } from "@/lib/cashback/validation"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId } = await params
    const { user, error } = await requireMerchantCashbackAccess(request, merchantId)
    if (error) return error

    const formData = await request.formData()
    const file = formData.get("file")
    const categoryId = formData.get("categoryId") as string
    
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
    }
    if (!categoryId) {
      return NextResponse.json({ error: "Target category is required" }, { status: 400 })
    }

    const fileCheck = validateImportFile(file)
    if (!fileCheck.valid) {
      return NextResponse.json({ error: fileCheck.error }, { status: 400 })
    }

    const config = await getOrCreateCashbackConfig(merchantId)
    const category = await prisma.cashbackCategory.findFirst({
      where: { id: categoryId, configId: config.id, merchantId },
    })
    
    if (!category) {
      return NextResponse.json({ error: "Selected category not found" }, { status: 404 })
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    let parsed: Awaited<ReturnType<typeof parseCsvEligibleRows>>

    if (ext === "csv" || ext === "txt") {
      parsed = parseCsvEligibleRows(await file.text())
    } else if (ext === "xlsx" || ext === "xls") {
      parsed = await parseExcelEligibleRows(await file.arrayBuffer())
    } else {
      return NextResponse.json({ error: "Supported formats: CSV, XLSX" }, { status: 400 })
    }

    if (parsed.rows.length === 0 && parsed.errors.length > 0) {
      return NextResponse.json({ imported: 0, skipped: 0, errors: parsed.errors }, { status: 400 })
    }

    if (parsed.rows.length > CASHBACK_LIMITS.importMaxRows) {
      return NextResponse.json(
        {
          error: `Import exceeds maximum of ${CASHBACK_LIMITS.importMaxRows.toLocaleString()} rows.`,
        },
        { status: 400 }
      )
    }

    let imported = 0
    let skipped = 0
    const errors = [...parsed.errors]

    // Pre-check: find phones already assigned to a DIFFERENT category for this merchant
    const allPhones = [...new Set(parsed.rows.map(r => r.phone))]
    const crossCategoryConflicts = await prisma.cashbackEligibleCustomer.findMany({
      where: { merchantId, phone: { in: allPhones }, categoryId: { not: categoryId } },
      select: { phone: true, category: { select: { name: true } } },
    })
    const conflictMap = new Map(crossCategoryConflicts.map(c => [c.phone, c.category.name]))

    // Track phones seen in this batch to detect in-file duplicates
    const seenInBatch = new Set<string>()

    for (const row of parsed.rows) {
      if (conflictMap.has(row.phone)) {
        skipped++
        errors.push({
          rowNumber: row.rowNumber,
          message: `Customer ${row.phone} is already assigned to category "${conflictMap.get(row.phone)}"`,
        })
        continue
      }

      if (seenInBatch.has(row.phone)) {
        skipped++
        errors.push({ rowNumber: row.rowNumber, message: `Duplicate phone number in import file: ${row.phone}` })
        continue
      }
      seenInBatch.add(row.phone)

      try {
        await prisma.cashbackEligibleCustomer.upsert({
          where: {
            merchantId_phone_categoryId: {
              merchantId,
              phone: row.phone,
              categoryId,
            },
          },
          create: {
            merchantId,
            configId: config.id,
            categoryId,
            phone: row.phone,
            accountNumber: row.accountNumber,
          },
          update: {
            accountNumber: row.accountNumber,
          },
        })
        imported++
      } catch {
        skipped++
        errors.push({ rowNumber: row.rowNumber, message: "Failed to import row." })
      }
    }

    await writeAuditLog({
      request,
      userId: user!.id,
      action: "CASHBACK_ELIGIBLE_IMPORT",
      entityType: "MERCHANT",
      entityId: merchantId,
      newValue: { imported, skipped, fileName: file.name },
    })

    return NextResponse.json({ imported, skipped, errors })
  } catch (e) {
    console.error("Failed to import eligible customers:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
