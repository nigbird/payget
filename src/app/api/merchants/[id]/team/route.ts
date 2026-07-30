import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import { requireAuthUser, canAccessMerchant } from '@/lib/request-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { requireCsrf } from '@/lib/request-security';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!canAccessMerchant(user, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const members = await db.getMerchantTeamMembersByMerchantId(id)
  const portalUsers = await prisma.user.findMany({
    where: { merchantId: id },
    select: { id: true, email: true },
  })
  const emailToUserId = new Map<string, string>()
  for (const u of portalUsers) {
    if (u.email?.trim()) emailToUserId.set(u.email.trim().toLowerCase(), u.id)
  }

  const enriched = members.map((m) => ({
    ...m,
    linkedUserId: m.email?.trim()
      ? emailToUserId.get(m.email.trim().toLowerCase()) ?? null
      : null,
  }))

  return NextResponse.json(enriched)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let actorUserId: string | null = null
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const user = await requireAuthUser(request)
    actorUserId = user?.id ?? null

    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: 'MERCHANT_TEAM_MEMBER_CREATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: null,
        newValue: { result: 'failed', reason: 'UNAUTHORIZED' },
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!canAccessMerchant(user, id)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'MERCHANT_TEAM_MEMBER_CREATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: null,
        newValue: { result: 'failed', reason: 'FORBIDDEN', merchantId: id },
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const member = await db.addMerchantTeamMember({
      ...body,
      merchantId: id,
    })

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: 'MERCHANT_TEAM_MEMBER_CREATE',
      entityType: 'MERCHANT_TEAM_MEMBER',
      entityId: member.id,
      oldValue: null,
      newValue: { result: 'success', merchantId: id, role: member.role, status: member.status },
    })

    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    console.error('Error adding team member:', error)

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: 'MERCHANT_TEAM_MEMBER_CREATE',
      entityType: 'MERCHANT_TEAM_MEMBER',
      entityId: null,
      newValue: { result: 'failed', reason: 'INTERNAL_ERROR' },
    })

    return NextResponse.json({ error: 'Failed to add team member' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let actorUserId: string | null = null
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const user = await requireAuthUser(request)
    actorUserId = user?.id ?? null

    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: 'MERCHANT_TEAM_MEMBER_UPDATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: null,
        newValue: { result: 'failed', reason: 'UNAUTHORIZED' },
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!canAccessMerchant(user, id)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'MERCHANT_TEAM_MEMBER_UPDATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: null,
        newValue: { result: 'failed', reason: 'FORBIDDEN', merchantId: id },
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { memberId, ...data } = body

    if (data.active !== undefined) {
      const updated = await db.setMerchantTeamMemberActive(memberId, data.active)

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'MERCHANT_TEAM_MEMBER_UPDATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: memberId,
        oldValue: null,
        newValue: { result: 'success', merchantId: id, active: data.active },
      })

      return NextResponse.json(updated)
    } else {
      const updated = await db.updateMerchantTeamMember(memberId, data)

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'MERCHANT_TEAM_MEMBER_UPDATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: memberId,
        oldValue: null,
        newValue: { result: 'success', merchantId: id },
      })

      return NextResponse.json(updated)
    }
  } catch (error) {
    console.error('Error updating team member:', error)

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: 'MERCHANT_TEAM_MEMBER_UPDATE',
      entityType: 'MERCHANT_TEAM_MEMBER',
      entityId: null,
      newValue: { result: 'failed', reason: 'INTERNAL_ERROR' },
    })

    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 })
  }
}
