import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { writeAuditLog } from "@/lib/audit-log"
import { ACTIVE_IMPORT_STATUSES, EDITABLE_IMPORT_STATUSES } from "@/lib/payment-eligibility"

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
      include: {
        _count: { select: { rows: true } },
        reviewer: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    if (!active) {
      return NextResponse.json({ request: null })
    }

    return NextResponse.json({
      request: {
        id: active.id,
        status: active.status,
        fileName: active.fileName,
        totalRows: active._count.rows,
        createdAt: active.createdAt.toISOString(),
        reviewedAt: active.reviewedAt?.toISOString() ?? null,
        reviewedBy: active.reviewer?.name || active.reviewer?.email || null,
        // `comments` carries the admin's rejection reason for REJECTED requests.
        rejectionReason: active.status === "REJECTED" ? active.comments : null,
        editable: (EDITABLE_IMPORT_STATUSES as readonly string[]).includes(active.status),
      },
    })
  } catch (e) {
    console.error("Failed to load pending payment eligibility request:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
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

    const active = await prisma.paymentEligibilityImport.findFirst({
      where: { merchantId: id, type: "IMPORT", status: { in: [...ACTIVE_IMPORT_STATUSES] } },
      orderBy: { createdAt: "desc" },
    })
    if (!active) {
      return NextResponse.json({ error: "No active request found" }, { status: 404 })
    }
    if (!(EDITABLE_IMPORT_STATUSES as readonly string[]).includes(active.status)) {
      return NextResponse.json(
        { error: "A request already submitted for admin approval can't be discarded." },
        { status: 400 }
      )
    }

    await prisma.paymentEligibilityImport.delete({ where: { id: active.id } })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "PAYMENT_ELIGIBILITY_DRAFT_DISCARD",
      entityType: "MERCHANT",
      entityId: id,
      oldValue: { importId: active.id, status: active.status },
    })

    return NextResponse.json({ discarded: true })
  } catch (e) {
    console.error("Failed to discard payment eligibility draft:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
