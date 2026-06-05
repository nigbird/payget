import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"
import { getOrCreateCashbackConfig } from "@/lib/cashback/service"
import { validateCategoryBody, validateNoOverlappingCategoryRules } from "@/lib/cashback/validation"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId } = await params
    const { error } = await requireMerchantCashbackAccess(request, merchantId)
    if (error) return error

    const body = await request.json()
    const errors = validateCategoryBody(body)
    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 })
    }

    const name = String(body.name).trim()
    const percent = Number(body.percent)
    const minAmount = parseNullableNumber(body.minTransactionAmount) ?? 0
    const maxAmount = parseNullableNumber(body.maxTransactionAmount)

    const config = await getOrCreateCashbackConfig(merchantId)

    const existingCategories = await prisma.cashbackCategory.findMany({
      where: { configId: config.id },
      select: { id: true, name: true, minTransactionAmount: true, maxTransactionAmount: true },
    })

    const overlapCheck = validateNoOverlappingCategoryRules(minAmount, maxAmount, existingCategories)
    if (!overlapCheck.valid) {
      return NextResponse.json({ error: "Validation failed", errors: { minTransactionAmount: overlapCheck.error } }, { status: 409 })
    }

    const category = await prisma.cashbackCategory.create({
      data: {
        configId: config.id,
        merchantId,
        name,
        description: body.description ? String(body.description).trim() : null,
        percent,
        minTransactionAmount: minAmount,
        maxTransactionAmount: maxAmount,
        sortOrder: Number(body.sortOrder) || 0,
        isActive: body.isActive !== false,
      },
      include: { _count: { select: { eligibleCustomers: true } } },
    })

    return NextResponse.json({
      id: category.id,
      name: category.name,
      description: category.description,
      percent: category.percent,
      minTransactionAmount: category.minTransactionAmount,
      maxTransactionAmount: category.maxTransactionAmount,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      eligibleCount: category._count.eligibleCustomers,
    })
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Category name already exists" }, { status: 409 })
    }
    console.error("Failed to create cashback category:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002"
}
