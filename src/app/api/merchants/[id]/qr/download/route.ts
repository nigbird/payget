import { NextResponse } from "next/server"
import QRCode from "qrcode"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"

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

    const [merchant, activeQr] = await Promise.all([
      prisma.merchant.findUnique({
        where: { id },
        select: { name: true, qrEnabled: true },
      }),
      prisma.merchantQrCode.findFirst({
        where: { merchantId: id, isActive: true },
        orderBy: { createdAt: "desc" },
        select: { token: true },
      }),
    ])

    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 })
    }

    if (!merchant.qrEnabled || !activeQr?.token) {
      return NextResponse.json({ error: "QR code is not enabled" }, { status: 400 })
    }

    const origin = (process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin).replace(/\/$/, "")
    const paymentUrl = `${origin}/pay/merchant/${activeQr.token}`

    const pngBuffer = await QRCode.toBuffer(paymentUrl, {
      errorCorrectionLevel: "H",
      type: "png",
      width: 1024,
      margin: 4,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    })

    const safeName = merchant.name.replace(/[^\w.-]+/g, "_")

    return new NextResponse(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="QR-${safeName}.png"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("Failed to generate QR download:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
