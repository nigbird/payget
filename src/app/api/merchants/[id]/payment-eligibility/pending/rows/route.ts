import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { normalizeCashbackPhone } from "@/lib/cashback/phone"
import { CASHBACK_LIMITS } from "@/lib/cashback/validation"
import {
  ACTIVE_IMPORT_STATUSES,
  EDITABLE_IMPORT_STATUSES,
  ELIGIBILITY_ROWS_PAGE_SIZE,
} from "@/lib/payment-eligibility"

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

    const active = await prisma.paymentEligibilityImport.findFirst({
      where: { merchantId: id, type: "IMPORT", status: { in: [...ACTIVE_IMPORT_STATUSES] } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    })
    if (!active) {
      return NextResponse.json({ rows: [], total: 0, page: 1, totalPages: 0 })
    }

    const url = new URL(request.url)
    const search = url.searchParams.get("search")?.trim() ?? ""
    const download = url.searchParams.get("download") === "true"

    const where = {
      importId: active.id,
      ...(search ? { phone: { contains: search } } : {}),
    }

    if (download) {
      // Bypass pagination entirely so the client can export the full list in one request.
      const rows = await prisma.paymentEligibilityImportRow.findMany({
        where,
        select: { id: true, phone: true },
        orderBy: { phone: "asc" },
        take: CASHBACK_LIMITS.importMaxRows,
      })
      return NextResponse.json({ rows, total: rows.length })
    }

    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("pageSize")) || ELIGIBILITY_ROWS_PAGE_SIZE)
    )
    const requestedPage = Math.max(1, Number(url.searchParams.get("page")) || 1)

    const total = await prisma.paymentEligibilityImportRow.count({ where })
    const totalPages = Math.ceil(total / pageSize)
    // Clamp so deleting the last row on a page doesn't strand the caller on an empty one.
    const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1

    const rows = await prisma.paymentEligibilityImportRow.findMany({
      where,
      select: { id: true, phone: true },
      orderBy: { phone: "asc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    })

    return NextResponse.json({ rows, total, page, pageSize, totalPages })
  } catch (e) {
    console.error("Failed to list payment eligibility rows:", e)
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

    const draft = await prisma.paymentEligibilityImport.findFirst({
      where: { merchantId: id, type: "IMPORT", status: { in: [...EDITABLE_IMPORT_STATUSES] } },
      include: { _count: { select: { rows: true } } },
      orderBy: { createdAt: "desc" },
    })
    if (!draft) {
      return NextResponse.json({ error: "No editable list found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const phone = normalizeCashbackPhone(body.phone)
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 })
    }

    if (draft._count.rows >= CASHBACK_LIMITS.importMaxRows) {
      return NextResponse.json(
        { error: `Import exceeds maximum of ${CASHBACK_LIMITS.importMaxRows.toLocaleString()} rows.` },
        { status: 400 }
      )
    }

    const existing = await prisma.paymentEligibilityImportRow.findFirst({
      where: { importId: draft.id, phone },
    })
    if (existing) {
      return NextResponse.json({ error: "This phone number is already in the list." }, { status: 409 })
    }

    const row = await prisma.paymentEligibilityImportRow.create({
      data: { importId: draft.id, phone },
    })

    await prisma.paymentEligibilityImport.update({
      where: { id: draft.id },
      data: { totalRows: draft._count.rows + 1 },
    })

    return NextResponse.json({ row })
  } catch (e) {
    console.error("Failed to add row to payment eligibility draft:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
