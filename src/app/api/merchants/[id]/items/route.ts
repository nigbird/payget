import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { writeAuditLog } from "@/lib/audit-log"

const MAX_NAME_LENGTH = 60

function validateItemBody(body: any, errors: Record<string, string>) {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) errors.name = "Item name is required."
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Item name must be ${MAX_NAME_LENGTH} characters or fewer.`

  const price = Number(body.price)
  if (!Number.isFinite(price) || price <= 0) errors.price = "Enter a valid price greater than 0."

  return { name, price }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: merchantId } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, merchantId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [categories, items] = await Promise.all([
      prisma.merchantItemCategory.findMany({
        where: { merchantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.merchantItem.findMany({
        where: { merchantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ])

    return NextResponse.json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
      })),
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        categoryId: i.categoryId,
        sortOrder: i.sortOrder,
        isActive: i.isActive,
      })),
    })
  } catch (e) {
    console.error("Failed to load merchant items:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, merchantId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const errors: Record<string, string> = {}
    const { name, price } = validateItemBody(body, errors)

    let categoryId: string | null = null
    if (body.categoryId !== undefined && body.categoryId !== null && body.categoryId !== "") {
      const category = await prisma.merchantItemCategory.findFirst({
        where: { id: String(body.categoryId), merchantId },
      })
      if (!category) errors.categoryId = "Category not found."
      else categoryId = category.id
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 })
    }

    const item = await prisma.merchantItem.create({
      data: {
        merchantId,
        categoryId,
        name,
        price,
        sortOrder: Number(body.sortOrder) || 0,
        isActive: body.isActive !== false,
      },
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "MERCHANT_ITEM_CREATE",
      entityType: "MERCHANT_ITEM",
      entityId: item.id,
      newValue: { name, price, categoryId },
    })

    return NextResponse.json({
      id: item.id,
      name: item.name,
      price: item.price,
      categoryId: item.categoryId,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
    })
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "An item with this name already exists in this category." }, { status: 409 })
    }
    console.error("Failed to create merchant item:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002"
}
