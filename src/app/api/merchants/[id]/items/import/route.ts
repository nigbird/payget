import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { writeAuditLog } from "@/lib/audit-log"
import {
  ITEMS_IMPORT_LIMITS,
  parseCsvItemRows,
  parseExcelItemRows,
  validateItemsImportFile,
} from "@/lib/items/import-parser"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, merchantId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
    }

    const fileCheck = validateItemsImportFile(file)
    if (!fileCheck.valid) {
      return NextResponse.json({ error: fileCheck.error }, { status: 400 })
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    let parsed: Awaited<ReturnType<typeof parseCsvItemRows>>
    if (ext === "csv" || ext === "txt") {
      parsed = parseCsvItemRows(await file.text())
    } else if (ext === "xlsx" || ext === "xls") {
      parsed = await parseExcelItemRows(await file.arrayBuffer())
    } else {
      return NextResponse.json({ error: "Supported formats: CSV, XLSX" }, { status: 400 })
    }

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: "No valid items found in file.", errors: parsed.errors },
        { status: 400 }
      )
    }

    if (parsed.rows.length > ITEMS_IMPORT_LIMITS.importMaxRows) {
      return NextResponse.json(
        { error: `Import exceeds maximum of ${ITEMS_IMPORT_LIMITS.importMaxRows.toLocaleString()} rows.` },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingMainCategories = await tx.merchantItemMainCategory.findMany({ where: { merchantId } })
      const mainCategoryByName = new Map(existingMainCategories.map((mc) => [mc.name.toLowerCase(), mc.id]))

      const existingCategories = await tx.merchantItemCategory.findMany({ where: { merchantId } })
      const categoryByName = new Map(existingCategories.map((c) => [c.name.toLowerCase(), c.id]))

      let created = 0
      let updated = 0

      for (const row of parsed.rows) {
        let mainCategoryId: string | null = null
        if (row.mainCategoryName) {
          const key = row.mainCategoryName.toLowerCase()
          const existingId = mainCategoryByName.get(key)
          if (existingId) {
            mainCategoryId = existingId
          } else {
            const mainCategory = await tx.merchantItemMainCategory.create({
              data: { merchantId, name: row.mainCategoryName },
            })
            mainCategoryByName.set(key, mainCategory.id)
            mainCategoryId = mainCategory.id
          }
        }

        let categoryId: string | null = null
        if (row.categoryName) {
          const key = row.categoryName.toLowerCase()
          const existingId = categoryByName.get(key)
          if (existingId) {
            categoryId = existingId
          } else {
            const category = await tx.merchantItemCategory.create({
              data: { merchantId, name: row.categoryName, mainCategoryId },
            })
            categoryByName.set(key, category.id)
            categoryId = category.id
          }
        }

        const existingItem = await tx.merchantItem.findFirst({
          where: { merchantId, categoryId, name: { equals: row.name, mode: "insensitive" } },
        })

        if (existingItem) {
          await tx.merchantItem.update({
            where: { id: existingItem.id },
            data: { price: row.price, isActive: true },
          })
          updated++
        } else {
          await tx.merchantItem.create({
            data: { merchantId, categoryId, name: row.name, price: row.price, isActive: true },
          })
          created++
        }
      }

      return { created, updated }
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "MERCHANT_ITEM_IMPORT",
      entityType: "MERCHANT",
      entityId: merchantId,
      newValue: { fileName: file.name, ...result, totalRows: parsed.rows.length },
    })

    return NextResponse.json({
      totalRows: parsed.rows.length,
      created: result.created,
      updated: result.updated,
      parseErrors: parsed.errors,
    })
  } catch (e) {
    console.error("Failed to import merchant items:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
