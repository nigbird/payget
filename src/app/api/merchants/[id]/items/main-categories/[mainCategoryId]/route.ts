import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, canAccessMerchant } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { writeAuditLog } from "@/lib/audit-log"

const MAX_NAME_LENGTH = 40

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; mainCategoryId: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId, mainCategoryId } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, merchantId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await prisma.merchantItemMainCategory.findFirst({ where: { id: mainCategoryId, merchantId } })
    if (!existing) {
      return NextResponse.json({ error: "Main category not found" }, { status: 404 })
    }

    const body = await request.json()
    let name: string | undefined
    if (body.name !== undefined) {
      name = String(body.name).trim()
      if (!name) {
        return NextResponse.json({ error: "Validation failed", errors: { name: "Main category name is required." } }, { status: 400 })
      }
      if (name.length > MAX_NAME_LENGTH) {
        return NextResponse.json(
          { error: "Validation failed", errors: { name: `Main category name must be ${MAX_NAME_LENGTH} characters or fewer.` } },
          { status: 400 }
        )
      }
    }

    const updated = await prisma.merchantItemMainCategory.update({
      where: { id: mainCategoryId },
      data: {
        name,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "MERCHANT_ITEM_MAIN_CATEGORY_UPDATE",
      entityType: "MERCHANT_ITEM_MAIN_CATEGORY",
      entityId: mainCategoryId,
      oldValue: { name: existing.name, isActive: existing.isActive },
      newValue: body,
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      sortOrder: updated.sortOrder,
      isActive: updated.isActive,
    })
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "A main category with this name already exists." }, { status: 409 })
    }
    console.error("Failed to update item main category:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; mainCategoryId: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId, mainCategoryId } = await params
    const user = await requireAuthUser(request)
    if (!user || !canAccessMerchant(user, merchantId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await prisma.merchantItemMainCategory.findFirst({ where: { id: mainCategoryId, merchantId } })
    if (!existing) {
      return NextResponse.json({ error: "Main category not found" }, { status: 404 })
    }

    // Categories under this main category are kept — they just become unassigned (mainCategoryId set to null).
    await prisma.merchantItemMainCategory.delete({ where: { id: mainCategoryId } })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "MERCHANT_ITEM_MAIN_CATEGORY_DELETE",
      entityType: "MERCHANT_ITEM_MAIN_CATEGORY",
      entityId: mainCategoryId,
      oldValue: { name: existing.name },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Failed to delete item main category:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002"
}
