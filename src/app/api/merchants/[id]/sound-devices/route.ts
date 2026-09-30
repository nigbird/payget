import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, canAccessMerchant, isMerchantAccountAdmin } from "@/lib/request-auth"
import { requireCsrf } from "@/lib/request-security"
import { writeAuditLog } from "@/lib/audit-log"
import { generateSoundDeviceToken, SOUND_DEVICE_NAME_MAX_LENGTH } from "@/lib/sound-devices"

/** Plenty for one shop's counters; stops a scripted loop minting unlimited tokens. */
const MAX_ACTIVE_DEVICES_PER_MERCHANT = 20

function toDto(d: { id: string; name: string; createdAt: Date; lastSeenAt: Date | null }) {
  return {
    id: d.id,
    name: d.name,
    createdAt: d.createdAt.toISOString(),
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: merchantId } = await params
  const user = await requireAuthUser(request)
  if (!user || !canAccessMerchant(user, merchantId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const devices = await prisma.soundDevice.findMany({
    where: { merchantId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ devices: devices.map(toDto) })
}

/** Pairs a new device. The raw token is returned exactly once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = requireCsrf(request)
  if (csrf) return csrf

  const { id: merchantId } = await params
  const user = await requireAuthUser(request)
  if (!user || !canAccessMerchant(user, merchantId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isMerchantAccountAdmin(user)) {
    return NextResponse.json({ error: "Only an account admin can pair sound devices" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) {
    return NextResponse.json({ errors: { name: "Device name is required." } }, { status: 400 })
  }
  if (name.length > SOUND_DEVICE_NAME_MAX_LENGTH) {
    return NextResponse.json(
      { errors: { name: `Device name must be ${SOUND_DEVICE_NAME_MAX_LENGTH} characters or fewer.` } },
      { status: 400 }
    )
  }

  const activeCount = await prisma.soundDevice.count({ where: { merchantId, revokedAt: null } })
  if (activeCount >= MAX_ACTIVE_DEVICES_PER_MERCHANT) {
    return NextResponse.json(
      { error: `A merchant can have at most ${MAX_ACTIVE_DEVICES_PER_MERCHANT} sound devices. Remove one first.` },
      { status: 409 }
    )
  }

  const { token, tokenHash } = generateSoundDeviceToken()
  const device = await prisma.soundDevice.create({
    data: { merchantId, name, tokenHash, createdById: user.id },
  })

  await writeAuditLog({
    request,
    userId: user.id.startsWith("sales-") ? null : user.id,
    action: "SOUND_DEVICE_PAIRED",
    entityType: "MERCHANT",
    entityId: merchantId,
    newValue: { deviceId: device.id, name, pairedBy: user.id },
  })

  return NextResponse.json({ device: toDto(device), token }, { status: 201 })
}
