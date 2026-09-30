import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, canAccessMerchant, isMerchantAccountAdmin } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { writeAuditLog } from "@/lib/audit-log"

/** Unpairs a device. Its open stream is cut off at the next heartbeat. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; deviceId: string }> }
) {
  const csrf = requireCsrf(request)
  if (csrf) return csrf

  const { id: merchantId, deviceId } = await params
  const user = await requireAuthUser(request)
  if (!user || !canAccessMerchant(user, merchantId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isMerchantAccountAdmin(user)) {
    return NextResponse.json({ error: "Only an account admin can remove sound devices" }, { status: 403 })
  }

  const { count } = await prisma.soundDevice.updateMany({
    where: { id: deviceId, merchantId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (count === 0) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 })
  }

  await writeAuditLog({
    request,
    userId: user.id.startsWith("sales-") ? null : user.id,
    action: "SOUND_DEVICE_REVOKED",
    entityType: "MERCHANT",
    entityId: merchantId,
    newValue: { deviceId, revokedBy: user.id },
  })

  return NextResponse.json({ ok: true })
}
