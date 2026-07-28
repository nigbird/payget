import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"

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

    const draft = await prisma.paymentEligibilityImport.findFirst({
      where: { merchantId: id, type: "IMPORT", status: "DRAFT" },
    })
    if (!draft) {
      return NextResponse.json({ error: "No draft found" }, { status: 404 })
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
