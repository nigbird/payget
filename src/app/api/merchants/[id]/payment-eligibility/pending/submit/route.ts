import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { writeAuditLog } from "@/lib/audit-log"
import { EDITABLE_IMPORT_STATUSES } from "@/lib/payment-eligibility"

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
      return NextResponse.json({ error: "No draft found" }, { status: 404 })
    }
    if (draft._count.rows === 0) {
      return NextResponse.json({ error: "Add at least one phone number before submitting." }, { status: 400 })
    }

    const isResubmission = draft.status === "REJECTED"

    // Clear the previous decision so the request returns to the admin queue clean.
    const updated = await prisma.paymentEligibilityImport.update({
      where: { id: draft.id },
      data: {
        status: "PENDING",
        totalRows: draft._count.rows,
        submittedBy: user.id,
        reviewedBy: null,
        reviewedAt: null,
        comments: null,
      },
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: isResubmission
        ? "PAYMENT_ELIGIBILITY_IMPORT_RESUBMIT"
        : "PAYMENT_ELIGIBILITY_IMPORT_CREATE",
      entityType: "MERCHANT",
      entityId: id,
      oldValue: isResubmission ? { status: "REJECTED", rejectionReason: draft.comments } : undefined,
      newValue: { importId: updated.id, totalRows: updated.totalRows },
    })

    return NextResponse.json({ status: "PENDING" })
  } catch (e) {
    console.error("Failed to submit payment eligibility draft:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
