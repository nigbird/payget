import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"
import { requireMerchantCashbackAccess } from "@/lib/cashback/api-auth"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; customerId: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) return csrfError

    const { id: merchantId, customerId } = await params
    const { error } = await requireMerchantCashbackAccess(request, merchantId)
    if (error) return error

    const body = await request.json()
    const { phone, accountNumber, categoryId } = body

    // Validate phone if provided
    if (phone !== undefined && !phone.trim()) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 })
    }

    // Check if customer exists and belongs to merchant
    const existing = await prisma.cashbackEligibleCustomer.findFirst({
      where: { id: customerId, merchantId }
    })

    if (!existing) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    // Update customer
    const updated = await prisma.cashbackEligibleCustomer.update({
      where: { id: customerId },
      data: {
        phone: phone !== undefined ? phone.trim() : undefined,
        accountNumber: accountNumber !== undefined ? (accountNumber ? accountNumber.trim() : null) : undefined,
        categoryId: categoryId !== undefined ? categoryId : undefined,
      },
      include: { category: { select: { name: true } } }
    })

    return NextResponse.json({
      id: updated.id,
      phone: updated.phone,
      accountNumber: updated.accountNumber,
      categoryId: updated.categoryId,
      categoryName: updated.category.name,
      importedAt: updated.importedAt.toISOString(),
    })
  } catch (e) {
    console.error("Failed to update eligible customer:", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
