import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
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

    const active = await prisma.paymentEligibilityImport.findFirst({
      where: { merchantId: id, type: "IMPORT", status: { in: ["DRAFT", "PENDING"] } },
      include: { rows: { select: { id: true, phone: true }, orderBy: { phone: "asc" } } },
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
        totalRows: active.rows.length,
        createdAt: active.createdAt.toISOString(),
        rows: active.rows,
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
      where: { merchantId: id, type: "IMPORT", status: { in: ["DRAFT", "PENDING"] } },
    })
    if (!active) {
      return NextResponse.json({ error: "No active request found" }, { status: 404 })
    }
    if (active.status !== "DRAFT") {
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
      oldValue: { importId: active.id },
    })

    return NextResponse.json({ discarded: true })
  } catch (e) {
    console.error("Failed to discard payment eligibility draft:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
