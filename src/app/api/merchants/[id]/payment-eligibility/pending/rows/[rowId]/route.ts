import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { normalizeCashbackPhone } from "@/lib/cashback/phone"
import { EDITABLE_IMPORT_STATUSES } from "@/lib/payment-eligibility"

/** Resolves the merchant's editable IMPORT request (a draft, or one an admin rejected). */
async function findEditableImport(merchantId: string) {
  return prisma.paymentEligibilityImport.findFirst({
    where: { merchantId, type: "IMPORT", status: { in: [...EDITABLE_IMPORT_STATUSES] } },
    orderBy: { createdAt: "desc" },
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  try {
    const csrfError = requireCsrf(request)
    if (csrfError) return csrfError

    const { id, rowId } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const draft = await findEditableImport(id)
    if (!draft) {
      return NextResponse.json({ error: "No editable list found" }, { status: 404 })
    }

    const row = await prisma.paymentEligibilityImportRow.findUnique({ where: { id: rowId } })
    if (!row || row.importId !== draft.id) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const phone = normalizeCashbackPhone(body.phone)
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 })
    }

    if (phone !== row.phone) {
      const duplicate = await prisma.paymentEligibilityImportRow.findFirst({
        where: { importId: draft.id, phone, id: { not: rowId } },
      })
      if (duplicate) {
        return NextResponse.json({ error: "This phone number is already in the list." }, { status: 409 })
      }
    }

    const updated = await prisma.paymentEligibilityImportRow.update({
      where: { id: rowId },
      data: { phone },
    })

    return NextResponse.json({ row: { id: updated.id, phone: updated.phone } })
  } catch (e) {
    console.error("Failed to update row on payment eligibility draft:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  try {
    const csrfError = requireCsrf(request)
    if (csrfError) return csrfError

    const { id, rowId } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const draft = await findEditableImport(id)
    if (!draft) {
      return NextResponse.json({ error: "No editable list found" }, { status: 404 })
    }

    const row = await prisma.paymentEligibilityImportRow.findUnique({ where: { id: rowId } })
    if (!row || row.importId !== draft.id) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 })
    }

    await prisma.paymentEligibilityImportRow.delete({ where: { id: rowId } })
    await prisma.paymentEligibilityImport.update({
      where: { id: draft.id },
      data: { totalRows: { decrement: 1 } },
    })

    return NextResponse.json({ deleted: true })
  } catch (e) {
    console.error("Failed to remove row from payment eligibility draft:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
