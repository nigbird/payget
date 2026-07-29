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

    const body = await request.json().catch(() => ({}))
    const phones = Array.isArray(body.phones) ? [...new Set(body.phones.filter((p: unknown) => typeof p === "string"))] as string[] : []
    if (phones.length === 0) {
      return NextResponse.json({ error: "Select at least one customer to remove." }, { status: 400 })
    }

    const existingActive = await prisma.paymentEligibilityImport.findFirst({
      where: {
        merchantId: id,
        OR: [
          { status: { in: ["DRAFT", "PENDING"] } },
          // A rejected import still needs the merchant's attention before anything else.
          { type: "IMPORT", status: "REJECTED" },
        ],
      },
    })
    if (existingActive) {
      return NextResponse.json(
        {
          error:
            existingActive.status === "REJECTED"
              ? "Resolve your rejected eligible customer import before requesting a removal."
              : "A request is already pending admin approval for this merchant.",
        },
        { status: 409 }
      )
    }

    const matched = await prisma.paymentEligibleCustomer.findMany({
      where: { merchantId: id, phone: { in: phones } },
      select: { phone: true },
    })
    if (matched.length === 0) {
      return NextResponse.json({ error: "None of the selected customers are currently approved." }, { status: 400 })
    }

    const removalRequest = await prisma.paymentEligibilityImport.create({
      data: {
        merchantId: id,
        type: "REMOVAL",
        status: "PENDING",
        fileName: "Removal request",
        totalRows: matched.length,
        submittedBy: user.id,
        rows: { create: matched.map((m) => ({ phone: m.phone })) },
      },
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "PAYMENT_ELIGIBILITY_REMOVAL_CREATE",
      entityType: "MERCHANT",
      entityId: id,
      newValue: { requestId: removalRequest.id, phones: matched.map((m) => m.phone) },
    })

    return NextResponse.json({ requestId: removalRequest.id, totalRows: matched.length })
  } catch (e) {
    console.error("Failed to submit payment eligibility removal request:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
