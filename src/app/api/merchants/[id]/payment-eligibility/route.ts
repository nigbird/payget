import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { validateImportFile, CASHBACK_LIMITS } from "@/lib/cashback/validation"
import { parseCsvEligibleRows, parseExcelEligibleRows } from "@/lib/cashback/import-parser"
import { writeAuditLog } from "@/lib/audit-log"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [approvedCount, pending] = await Promise.all([
      prisma.paymentEligibleCustomer.count({ where: { merchantId: id } }),
      prisma.paymentEligibilityImport.findFirst({
        where: { merchantId: id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      }),
    ])

    return NextResponse.json({
      approvedCount,
      pendingRequest: pending
        ? {
            id: pending.id,
            fileName: pending.fileName,
            totalRows: pending.totalRows,
            createdAt: pending.createdAt.toISOString(),
          }
        : null,
    })
  } catch (e) {
    console.error("Failed to load payment eligibility status:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = requireCsrf(request)
    if (csrfError) return csrfError

    const { id } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const merchant = await prisma.merchant.findUnique({ where: { id }, select: { id: true } })
    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
    }

    const existingActive = await prisma.paymentEligibilityImport.findFirst({
      where: {
        merchantId: id,
        OR: [
          { status: { in: ["DRAFT", "PENDING"] } },
          { type: "IMPORT", status: "REJECTED" },
        ],
      },
      orderBy: { createdAt: "desc" },
    })
    if (existingActive) {
      const errors: Record<string, string> = {
        DRAFT: "You already have a draft in progress. Finish or discard it before starting a new import.",
        PENDING: "A request is already pending admin approval for this merchant.",
        REJECTED:
          "Your last import was rejected. Update and resubmit that list, or discard it before starting a new import.",
      }
      return NextResponse.json({ error: errors[existingActive.status] }, { status: 409 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
    }

    const fileCheck = validateImportFile(file)
    if (!fileCheck.valid) {
      return NextResponse.json({ error: fileCheck.error }, { status: 400 })
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

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: "No valid phone numbers found in file.", errors: parsed.errors },
        { status: 400 }
      )
    }

    if (parsed.rows.length > CASHBACK_LIMITS.importMaxRows) {
      return NextResponse.json(
        { error: `Import exceeds maximum of ${CASHBACK_LIMITS.importMaxRows.toLocaleString()} rows.` },
        { status: 400 }
      )
    }

    const uniquePhones = [...new Set(parsed.rows.map((r) => r.phone))]

    const importRequest = await prisma.paymentEligibilityImport.create({
      data: {
        merchantId: id,
        type: "IMPORT",
        status: "DRAFT",
        fileName: file.name,
        totalRows: uniquePhones.length,
        submittedBy: user.id,
        rows: {
          create: uniquePhones.map((phone) => ({ phone })),
        },
      },
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "PAYMENT_ELIGIBILITY_DRAFT_CREATE",
      entityType: "MERCHANT",
      entityId: id,
      newValue: { fileName: file.name, totalRows: uniquePhones.length },
    })

    return NextResponse.json({
      importId: importRequest.id,
      totalRows: uniquePhones.length,
      parseErrors: parsed.errors,
    })
  } catch (e) {
    console.error("Failed to submit payment eligibility import:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
