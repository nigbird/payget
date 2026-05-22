import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"

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
    const percent = body.percent !== undefined ? Number(body.percent) : undefined
    if (percent !== undefined && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) {
      return NextResponse.json({ error: "Percent must be between 0 and 100" }, { status: 400 })
    }

    const updated = await prisma.cashbackCategory.update({
      where: { id: categoryId },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        description: body.description !== undefined ? (body.description ? String(body.description) : null) : undefined,
        percent,
        minTransactionAmount:
          body.minTransactionAmount !== undefined ? Number(body.minTransactionAmount) : undefined,
        maxCashbackAmount:
          body.maxCashbackAmount !== undefined ? parseNullableNumber(body.maxCashbackAmount) : undefined,
        transactionThreshold:
          body.transactionThreshold !== undefined ? parseNullableNumber(body.transactionThreshold) : undefined,
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
      maxCashbackAmount: updated.maxCashbackAmount,
      transactionThreshold: updated.transactionThreshold,
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
    const { error } = await requireMerchantCashbackAccess(request, merchantId)
    if (error) return error

    const existing = await prisma.cashbackCategory.findFirst({
      where: { id: categoryId, merchantId },
    })
    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    await prisma.cashbackCategory.delete({ where: { id: categoryId } })
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
