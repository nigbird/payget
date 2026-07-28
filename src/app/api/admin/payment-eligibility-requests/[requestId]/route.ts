import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import { writeAuditLog } from "@/lib/audit-log"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const user = await requireAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!userHasPermission(user, "PAYMENT_ELIGIBILITY_APPROVE")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const { requestId } = await params
  const importRequest = await prisma.paymentEligibilityImport.findUnique({
    where: { id: requestId },
    include: {
      merchant: { select: { id: true, name: true } },
      submitter: { select: { id: true, name: true, email: true } },
      rows: { select: { phone: true }, orderBy: { phone: "asc" } },
    },
  })

  if (!importRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 })
  }

  return NextResponse.json({
    id: importRequest.id,
    type: importRequest.type,
    fileName: importRequest.fileName,
    totalRows: importRequest.totalRows,
    status: importRequest.status,
    createdAt: importRequest.createdAt.toISOString(),
    merchant: importRequest.merchant,
    submitter: importRequest.submitter,
    phones: importRequest.rows.map((r) => r.phone),
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  let userId: string | null = null
  try {
    const csrfError = requireCsrf(request)
    if (csrfError) return csrfError

    const user = await requireAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    userId = user.id

    if (!userHasPermission(user, "PAYMENT_ELIGIBILITY_APPROVE")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const { requestId } = await params
    const body = await request.json()
    const action = body.action
    const comments = typeof body.comments === "string" ? body.comments : undefined

    const importRequest = await prisma.paymentEligibilityImport.findUnique({
      where: { id: requestId },
      include: { rows: { select: { phone: true } } },
    })
    if (!importRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }
    if (importRequest.status !== "PENDING") {
      return NextResponse.json({ error: "Request is not pending" }, { status: 400 })
    }

    if (action === "approve") {
      const rowPhones = importRequest.rows.map((row) => row.phone)

      if (importRequest.type === "REMOVAL") {
        await prisma.$transaction([
          prisma.paymentEligibleCustomer.deleteMany({
            where: { merchantId: importRequest.merchantId, phone: { in: rowPhones } },
          }),
          prisma.paymentEligibilityImport.update({
            where: { id: requestId },
            data: { status: "APPROVED", reviewedBy: userId, reviewedAt: new Date(), comments },
          }),
        ])
      } else {
        await prisma.$transaction([
          ...importRequest.rows.map((row) =>
            prisma.paymentEligibleCustomer.upsert({
              where: { merchantId_phone: { merchantId: importRequest.merchantId, phone: row.phone } },
              create: { merchantId: importRequest.merchantId, phone: row.phone },
              update: {},
            })
          ),
          prisma.paymentEligibilityImport.update({
            where: { id: requestId },
            data: { status: "APPROVED", reviewedBy: userId, reviewedAt: new Date(), comments },
          }),
        ])
      }

      await writeAuditLog({
        request,
        userId,
        action:
          importRequest.type === "REMOVAL"
            ? "PAYMENT_ELIGIBILITY_REMOVAL_APPROVE"
            : "PAYMENT_ELIGIBILITY_IMPORT_APPROVE",
        entityType: "MERCHANT",
        entityId: importRequest.merchantId,
        newValue: { importId: requestId, totalRows: importRequest.totalRows, comments },
      })

      return NextResponse.json({ status: "APPROVED" })
    }

    if (action === "reject") {
      await prisma.paymentEligibilityImport.update({
        where: { id: requestId },
        data: { status: "REJECTED", reviewedBy: userId, reviewedAt: new Date(), comments },
      })

      await writeAuditLog({
        request,
        userId,
        action:
          importRequest.type === "REMOVAL"
            ? "PAYMENT_ELIGIBILITY_REMOVAL_REJECT"
            : "PAYMENT_ELIGIBILITY_IMPORT_REJECT",
        entityType: "MERCHANT",
        entityId: importRequest.merchantId,
        newValue: { importId: requestId, comments },
      })

      return NextResponse.json({ status: "REJECTED" })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e) {
    console.error("Failed to process payment eligibility decision:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
