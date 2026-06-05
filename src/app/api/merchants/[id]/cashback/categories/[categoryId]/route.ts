import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"
import { validateCategoryBody, validateCategoryName, validateNoOverlappingCategoryRules } from "@/lib/cashback/validation"
import { writeAuditLog } from "@/lib/audit-log"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId, categoryId } = await params
    const { error } = await requireMerchantCashbackAccess(request, merchantId)
    if (error) return error

    const existing = await prisma.cashbackCategory.findFirst({
      where: { id: categoryId, merchantId },
    })
    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    const body = await request.json()
    const errors: Record<string, string> = {}

    if (body.name !== undefined) {
      const nameCheck = validateCategoryName(String(body.name))
      if (!nameCheck.valid && nameCheck.error) errors.name = nameCheck.error
    }

    if (
      body.percent !== undefined ||
      body.minTransactionAmount !== undefined ||
      body.maxTransactionAmount !== undefined
    ) {
      Object.assign(
        errors,
        validateCategoryBody({
          name: body.name ?? existing.name,
          percent: body.percent ?? existing.percent,
          minTransactionAmount: body.minTransactionAmount ?? existing.minTransactionAmount,
          maxTransactionAmount: body.maxTransactionAmount ?? existing.maxTransactionAmount,
        })
      )
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 })
    }

    if (body.minTransactionAmount !== undefined || body.maxTransactionAmount !== undefined) {
      const newMin = parseNullableNumber(body.minTransactionAmount ?? existing.minTransactionAmount) ?? 0
      const newMax = parseNullableNumber(body.maxTransactionAmount ?? existing.maxTransactionAmount)

      const siblingCategories = await prisma.cashbackCategory.findMany({
        where: { configId: existing.configId },
        select: { id: true, name: true, minTransactionAmount: true, maxTransactionAmount: true },
      })

      const overlapCheck = validateNoOverlappingCategoryRules(newMin, newMax, siblingCategories, categoryId)
      if (!overlapCheck.valid) {
        return NextResponse.json({ error: "Validation failed", errors: { minTransactionAmount: overlapCheck.error } }, { status: 409 })
      }
    }

    const percent = body.percent !== undefined ? Number(body.percent) : undefined

    const updated = await prisma.cashbackCategory.update({
      where: { id: categoryId },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        description: body.description !== undefined ? (body.description ? String(body.description) : null) : undefined,
        percent,
        minTransactionAmount:
          body.minTransactionAmount !== undefined ? parseNullableNumber(body.minTransactionAmount) : undefined,
        maxTransactionAmount:
          body.maxTransactionAmount !== undefined ? parseNullableNumber(body.maxTransactionAmount) : undefined,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
      include: { _count: { select: { eligibleCustomers: true } } },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      percent: updated.percent,
      minTransactionAmount: updated.minTransactionAmount,
      maxTransactionAmount: updated.maxTransactionAmount,
      sortOrder: updated.sortOrder,
      isActive: updated.isActive,
      eligibleCount: updated._count.eligibleCustomers,
    })
  } catch (e) {
    console.error("Failed to update cashback category:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; categoryId: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId, categoryId } = await params
    const { user, error } = await requireMerchantCashbackAccess(request, merchantId)
    if (error) return error

    const existing = await prisma.cashbackCategory.findFirst({
      where: { id: categoryId, merchantId },
    })
    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    await prisma.cashbackCategory.delete({ where: { id: categoryId } })

    await writeAuditLog({
      request,
      userId: user!.id,
      action: "CASHBACK_CATEGORY_DELETE",
      entityType: "CASHBACK_CATEGORY",
      entityId: categoryId,
      oldValue: { name: existing.name, percent: existing.percent, isActive: existing.isActive },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Failed to delete cashback category:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
