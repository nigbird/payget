import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"
import { getOrCreateCashbackConfig } from "@/lib/cashback/service"

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
    const name = String(body.name ?? "").trim()
    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 })
    }

    const percent = Number(body.percent)
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return NextResponse.json({ error: "Percent must be between 0 and 100" }, { status: 400 })
    }

    const config = await getOrCreateCashbackConfig(merchantId)

    const category = await prisma.cashbackCategory.create({
      data: {
        configId: config.id,
        merchantId,
        name,
        description: body.description ? String(body.description).trim() : null,
        percent,
        minTransactionAmount: Number(body.minTransactionAmount) || 0,
        maxCashbackAmount: parseNullableNumber(body.maxCashbackAmount),
        transactionThreshold: parseNullableNumber(body.transactionThreshold),
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
      maxCashbackAmount: category.maxCashbackAmount,
      transactionThreshold: category.transactionThreshold,
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
