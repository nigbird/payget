import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { normalizeCashbackPhone } from "@/lib/cashback/phone"
import { CASHBACK_LIMITS } from "@/lib/cashback/validation"

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
      where: { merchantId: id, type: "IMPORT", status: "DRAFT" },
      include: { _count: { select: { rows: true } } },
    })
    if (!draft) {
      return NextResponse.json({ error: "No draft found" }, { status: 404 })
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
