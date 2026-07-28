import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { validateSubsidiaryAccountNumberField } from "@/lib/account-number"
import { requireAuthUser, userHasAnyPermission, userHasPermission, canAccessMerchant } from "@/lib/request-auth"
import { getOrCreateCashbackConfig } from "@/lib/cashback/service"
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

    const config = await getOrCreateCashbackConfig(id)
    const result: {
      subsidiaryAccountNumber: string | null
      pendingRequest?: {
        id: string
        requestedAccountNumber: string
        reason: string
        makerId: string
        maker: { id: string; name: string | null; email: string | null }
        createdAt: string
      } | null
    } = { subsidiaryAccountNumber: config.subsidiaryAccountNumber }

    if (userHasAnyPermission(user, ["SUBSIDIARY_ACCOUNT_REQUEST", "SUBSIDIARY_ACCOUNT_APPROVE"])) {
      const pending = await prisma.subsidiaryAccountRequest.findFirst({
        where: { merchantId: id, status: "PENDING" },
        include: { maker: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      })
      result.pendingRequest = pending
        ? {
            id: pending.id,
            requestedAccountNumber: pending.requestedAccountNumber,
            reason: pending.reason,
            makerId: pending.makerId,
            maker: pending.maker,
            createdAt: pending.createdAt.toISOString(),
          }
        : null
    }

    return NextResponse.json(result)
  } catch (e) {
    console.error("Failed to load subsidiary account:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string | null = null
  try {
    const csrfError = requireCsrf(request)
    if (csrfError) return csrfError

    const { id } = await params
    const user = await requireAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    userId = user.id

    const body = await request.json()
    const action = body.action

    if (action === "create_request") {
      if (!userHasPermission(user, "SUBSIDIARY_ACCOUNT_REQUEST")) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 })
      }

      const merchant = await prisma.merchant.findUnique({ where: { id }, select: { id: true } })
      if (!merchant) {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
      }

      const validationErrors: Record<string, string> = {}
      const requestedAccountNumber = validateSubsidiaryAccountNumberField(
        body.requestedAccountNumber,
        validationErrors,
        { required: true, fieldKey: "requestedAccountNumber" }
      )
      const reason = typeof body.reason === "string" ? body.reason.trim() : ""

      if (Object.keys(validationErrors).length > 0) {
        return NextResponse.json({ error: "Validation failed", errors: validationErrors }, { status: 400 })
      }

      const existingPending = await prisma.subsidiaryAccountRequest.findFirst({
        where: { merchantId: id, status: "PENDING" },
      })
      if (existingPending) {
        return NextResponse.json(
          { error: "A subsidiary account request is already pending for this merchant." },
          { status: 409 }
        )
      }

      const config = await getOrCreateCashbackConfig(id)

      const subsidiaryRequest = await prisma.subsidiaryAccountRequest.create({
        data: {
          merchantId: id,
          requestedAccountNumber: requestedAccountNumber!,
          previousAccountNumber: config.subsidiaryAccountNumber,
          reason,
          makerId: userId,
        },
      })

      await writeAuditLog({
        request,
        userId,
        action: "SUBSIDIARY_ACCOUNT_REQUEST_CREATE",
        entityType: "MERCHANT",
        entityId: id,
        oldValue: { subsidiaryAccountNumber: config.subsidiaryAccountNumber },
        newValue: { requestedAccountNumber, reason },
      })

      return NextResponse.json({ request: subsidiaryRequest })
    }

    if (action === "approve_request" || action === "reject_request") {
      if (!userHasPermission(user, "SUBSIDIARY_ACCOUNT_APPROVE")) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 })
      }

      const { requestId, comments } = body
      if (!requestId) {
        return NextResponse.json({ error: "Request ID is required" }, { status: 400 })
      }

      const subsidiaryRequest = await prisma.subsidiaryAccountRequest.findUnique({
        where: { id: requestId },
      })
      if (!subsidiaryRequest || subsidiaryRequest.merchantId !== id) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 })
      }
      if (subsidiaryRequest.status !== "PENDING") {
        return NextResponse.json({ error: "Request is not pending" }, { status: 400 })
      }
      if (subsidiaryRequest.makerId === userId) {
        return NextResponse.json({ error: "Cannot review your own request" }, { status: 400 })
      }

      if (action === "approve_request") {
        const config = await getOrCreateCashbackConfig(id)
        await prisma.merchantCashbackConfig.update({
          where: { id: config.id },
          data: { subsidiaryAccountNumber: subsidiaryRequest.requestedAccountNumber },
        })

        const updatedRequest = await prisma.subsidiaryAccountRequest.update({
          where: { id: requestId },
          data: { status: "APPROVED", checkerId: userId, checkedAt: new Date(), comments },
        })

        await writeAuditLog({
          request,
          userId,
          action: "SUBSIDIARY_ACCOUNT_REQUEST_APPROVE",
          entityType: "MERCHANT",
          entityId: id,
          newValue: { subsidiaryAccountNumber: subsidiaryRequest.requestedAccountNumber, comments },
        })

        return NextResponse.json({ request: updatedRequest })
      }

      const updatedRequest = await prisma.subsidiaryAccountRequest.update({
        where: { id: requestId },
        data: { status: "REJECTED", checkerId: userId, checkedAt: new Date(), comments },
      })

      await writeAuditLog({
        request,
        userId,
        action: "SUBSIDIARY_ACCOUNT_REQUEST_REJECT",
        entityType: "MERCHANT",
        entityId: id,
        newValue: { comments },
      })

      return NextResponse.json({ request: updatedRequest })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (e) {
    console.error("Failed to process subsidiary account request:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
