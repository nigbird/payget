import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { writeAuditLog } from "@/lib/audit-log"

const MAX_NAME_LENGTH = 40

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
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "Validation failed", errors: { name: "Category name is required." } }, { status: 400 })
    }
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: "Validation failed", errors: { name: `Category name must be ${MAX_NAME_LENGTH} characters or fewer.` } },
        { status: 400 }
      )
    }

    const category = await prisma.merchantItemCategory.create({
      data: {
        merchantId,
        name,
        sortOrder: Number(body.sortOrder) || 0,
        isActive: body.isActive !== false,
      },
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "MERCHANT_ITEM_CATEGORY_CREATE",
      entityType: "MERCHANT_ITEM_CATEGORY",
      entityId: category.id,
      newValue: { name },
    })

    return NextResponse.json({
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    })
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "A category with this name already exists." }, { status: 409 })
    }
    console.error("Failed to create item category:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002"
}
