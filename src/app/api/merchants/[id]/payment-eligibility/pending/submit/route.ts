import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { writeAuditLog } from "@/lib/audit-log"

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
    if (draft._count.rows === 0) {
      return NextResponse.json({ error: "Add at least one phone number before submitting." }, { status: 400 })
    }

    const updated = await prisma.paymentEligibilityImport.update({
      where: { id: draft.id },
      data: { status: "PENDING", totalRows: draft._count.rows },
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "PAYMENT_ELIGIBILITY_IMPORT_CREATE",
      entityType: "MERCHANT",
      entityId: id,
      newValue: { importId: updated.id, totalRows: updated.totalRows },
    })

    return NextResponse.json({ status: "PENDING" })
  } catch (e) {
    console.error("Failed to submit payment eligibility draft:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
