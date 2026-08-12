import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { writeAuditLog } from "@/lib/audit-log"

const MAX_NAME_LENGTH = 60

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId, itemId } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, merchantId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await prisma.merchantItem.findFirst({ where: { id: itemId, merchantId } })
    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    const body = await request.json()
    const errors: Record<string, string> = {}

    let name: string | undefined
    if (body.name !== undefined) {
      name = String(body.name).trim()
      if (!name) errors.name = "Item name is required."
      else if (name.length > MAX_NAME_LENGTH) errors.name = `Item name must be ${MAX_NAME_LENGTH} characters or fewer.`
    }

    let price: number | undefined
    if (body.price !== undefined) {
      price = Number(body.price)
      if (!Number.isFinite(price) || price <= 0) errors.price = "Enter a valid price greater than 0."
    }

    let categoryId: string | null | undefined
    if (body.categoryId !== undefined) {
      if (body.categoryId === null || body.categoryId === "") {
        categoryId = null
      } else {
        const category = await prisma.merchantItemCategory.findFirst({
          where: { id: String(body.categoryId), merchantId },
        })
        if (!category) errors.categoryId = "Category not found."
        else categoryId = category.id
      }
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 })
    }

    const updated = await prisma.merchantItem.update({
      where: { id: itemId },
      data: {
        name,
        price,
        categoryId,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "MERCHANT_ITEM_UPDATE",
      entityType: "MERCHANT_ITEM",
      entityId: itemId,
      oldValue: { name: existing.name, price: existing.price, categoryId: existing.categoryId },
      newValue: body,
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      price: updated.price,
      categoryId: updated.categoryId,
      sortOrder: updated.sortOrder,
      isActive: updated.isActive,
    })
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "An item with this name already exists in this category." }, { status: 409 })
    }
    console.error("Failed to update merchant item:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId, itemId } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, merchantId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await prisma.merchantItem.findFirst({ where: { id: itemId, merchantId } })
    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    await prisma.merchantItem.delete({ where: { id: itemId } })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "MERCHANT_ITEM_DELETE",
      entityType: "MERCHANT_ITEM",
      entityId: itemId,
      oldValue: { name: existing.name, price: existing.price, categoryId: existing.categoryId },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Failed to delete merchant item:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002"
}
