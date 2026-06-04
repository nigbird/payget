import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { db } from "@/app/lib/db"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { db } from "@/app/lib/db"
import crypto from "crypto"
import { writeAuditLog } from "@/lib/audit-log"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuthUser(request)
    if (!user || (!userHasPermission(user, "CONFIGURATION_MANAGE") && user.merchantId !== id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id },
      include: {
        qrCodes: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    })

    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
    }

    return NextResponse.json({
      qrEnabled: merchant.qrEnabled,
      qrLogoUrl: merchant.qrLogoUrl,
      merchantLogoUrl: merchant.logoUrl,
      activeQr: merchant.qrCodes[0] || null
    })
  } catch (error) {
    console.error("Failed to fetch QR config:", error)
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

    const { id } = await params
    const user = await requireAuthUser(request)
    if (!user || (!userHasPermission(user, "CONFIGURATION_MANAGE") && user.merchantId !== id)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { qrEnabled, qrLogoUrl, regenerate } = body

    if (regenerate) {
      // Deactivate all old QR codes
      await prisma.merchantQrCode.updateMany({
        where: { merchantId: id, isActive: true },
        data: { isActive: false }
      })

      // Generate new one
      const token = crypto.randomBytes(32).toString('hex')
      const newQr = await prisma.merchantQrCode.create({
        data: {
          merchantId: id,
          token,
          isActive: true
        }
      })

      await writeAuditLog({
        request,
        userId: user.id,
        action: "MERCHANT_QR_REGENERATE",
        entityType: "MERCHANT",
        entityId: id,
        newValue: { token }
      })

      return NextResponse.json({ success: true, activeQr: newQr })
    }

    const updatedMerchant = await db.updateMerchant(id, {
      qrEnabled: qrEnabled !== undefined ? qrEnabled : undefined,
      qrLogoUrl: qrLogoUrl !== undefined ? qrLogoUrl : undefined,
    })

    await writeAuditLog({
      request,
      userId: user.id,
      action: "MERCHANT_QR_CONFIG_UPDATE",
      entityType: "MERCHANT",
      entityId: id,
      newValue: { qrEnabled, qrLogoUrl }
    })

    // If enabled but no active QR exists, generate one
    if (qrEnabled) {
      const activeQr = await prisma.merchantQrCode.findFirst({
        where: { merchantId: id, isActive: true }
      })

      if (!activeQr) {
        const token = crypto.randomBytes(32).toString('hex')
        await prisma.merchantQrCode.create({
          data: {
            merchantId: id,
            token,
            isActive: true
          }
        })
      }
    }

    return NextResponse.json({ success: true, merchant: updatedMerchant })
  } catch (error) {
    console.error("Failed to update QR config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
