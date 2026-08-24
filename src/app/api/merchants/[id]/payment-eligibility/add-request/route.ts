import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { normalizeCashbackPhone } from "@/lib/cashback/phone"
import { writeAuditLog } from "@/lib/audit-log"
import { ELIGIBILITY_MANUAL_ADD_MAX_ROWS } from "@/lib/payment-eligibility"

/**
 * Typed-in counterpart to the file import: the merchant lists a few new numbers
 * and they go straight to admin approval as a normal IMPORT request, so the
 * approval path (upsert into PaymentEligibleCustomer) is shared with imports.
 */
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
    const raw = Array.isArray(body.phones)
      ? (body.phones.filter((p: unknown) => typeof p === "string") as string[])
      : []
    if (raw.length === 0) {
      return NextResponse.json({ error: "Enter at least one phone number." }, { status: 400 })
    }
    if (raw.length > ELIGIBILITY_MANUAL_ADD_MAX_ROWS) {
      return NextResponse.json(
        {
          error: `Add up to ${ELIGIBILITY_MANUAL_ADD_MAX_ROWS} numbers at a time. Import a file for a longer list.`,
        },
        { status: 400 }
      )
    }

    const invalid: string[] = []
    const phones: string[] = []
    for (const entry of raw) {
      const normalized = normalizeCashbackPhone(entry)
      if (!normalized) invalid.push(entry.trim())
      else if (!phones.includes(normalized)) phones.push(normalized)
    }
    if (invalid.length > 0) {
      const shown = invalid.slice(0, 3).join(", ")
      return NextResponse.json(
        {
          error: `Invalid phone number${invalid.length > 1 ? "s" : ""}: ${shown}${
            invalid.length > 3 ? ` and ${invalid.length - 3} more` : ""
          }.`,
        },
        { status: 400 }
      )
    }

    const merchant = await prisma.merchant.findUnique({ where: { id }, select: { id: true } })
    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
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
      orderBy: { createdAt: "desc" },
    })
    if (existingActive) {
      const errors: Record<string, string> = {
        DRAFT: "You already have a draft in progress. Finish or discard it before adding numbers.",
        PENDING: "A request is already pending admin approval for this merchant.",
        REJECTED:
          "Your last import was rejected. Update and resubmit that list, or discard it before adding numbers.",
      }
      return NextResponse.json({ error: errors[existingActive.status] }, { status: 409 })
    }

    // Already-approved numbers would be a no-op upsert — drop them so the admin
    // only reviews what actually changes.
    const alreadyApproved = await prisma.paymentEligibleCustomer.findMany({
      where: { merchantId: id, phone: { in: phones } },
      select: { phone: true },
    })
    const approvedSet = new Set(alreadyApproved.map((c) => c.phone))
    const newPhones = phones.filter((p) => !approvedSet.has(p))
    if (newPhones.length === 0) {
      return NextResponse.json(
        { error: "All of these numbers are already on the approved list." },
        { status: 400 }
      )
    }

    const addRequest = await prisma.paymentEligibilityImport.create({
      data: {
        merchantId: id,
        type: "IMPORT",
        status: "PENDING",
        fileName: "Manually added numbers",
        totalRows: newPhones.length,
        submittedBy: user.id,
        rows: { create: newPhones.map((phone) => ({ phone })) },
      },
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "PAYMENT_ELIGIBILITY_ADD_CREATE",
      entityType: "MERCHANT",
      entityId: id,
      newValue: { requestId: addRequest.id, phones: newPhones },
    })

    return NextResponse.json({
      requestId: addRequest.id,
      totalRows: newPhones.length,
      skipped: phones.length - newPhones.length,
    })
  } catch (e) {
    console.error("Failed to submit payment eligibility add request:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
