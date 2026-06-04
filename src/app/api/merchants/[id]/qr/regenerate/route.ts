import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/audit-log"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuthUser(request)
    if (!user || (!userHasPermission(user, "CONFIGURATION_MANAGE") && user.merchantId !== id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = crypto.randomBytes(32).toString('hex')

    await prisma.$transaction([
      // Deactivate all old QR codes for this merchant
      prisma.merchantQrCode.updateMany({
        where: { merchantId: id, isActive: true },
        data: { isActive: false }
      }),
      // Create new one
      prisma.merchantQrCode.create({
        data: {
          merchantId: id,
          token,
          isActive: true
        }
      })
    ])

    await writeAuditLog({
      request,
      userId: user.id,
      action: "MERCHANT_QR_REGENERATE",
      entityType: "MERCHANT",
      entityId: id,
      newValue: { token }
    })

    return NextResponse.json({ success: true, token })
  } catch (error) {
    console.error("Failed to regenerate QR code:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
