import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import { requireAuthUser, canAccessMerchant, isMerchantAccountAdmin } from '@/lib/request-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { requireCsrf } from '@/lib/request-security';

const TEAM_ROLES = new Set(['account_admin', 'sales_admin', 'payment_initiator'])
const TEAM_STATUSES = new Set(['active', 'deactivated'])

type TeamMemberInput = { name?: string; email?: string; phone?: string | null; role?: string; status?: string }

/**
 * The only member fields a caller may set. Everything else on the row (merchantId,
 * otp, otpExpires, id) is server-owned — accepting it from the body let one
 * merchant plant a login code on, or re-home, another merchant's member.
 */
function pickTeamMemberInput(body: any): { data: TeamMemberInput; error?: string } {
  const data: TeamMemberInput = {}
  if (body?.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return { data, error: 'Invalid name' }
    data.name = body.name.trim()
  }
  if (body?.email !== undefined) {
    if (typeof body.email !== 'string' || !body.email.trim()) return { data, error: 'Invalid email' }
    data.email = body.email.trim()
  }
  if (body?.phone !== undefined && body.phone !== null && body.phone !== '') {
    if (typeof body.phone !== 'string') return { data, error: 'Invalid phone' }
    data.phone = body.phone.trim()
  }
  if (body?.role !== undefined) {
    const role = String(body.role).toLowerCase()
    if (!TEAM_ROLES.has(role)) return { data, error: 'Invalid role' }
    data.role = role
  }
  if (body?.status !== undefined) {
    const status = String(body.status).toLowerCase()
    if (!TEAM_STATUSES.has(status)) return { data, error: 'Invalid status' }
    data.status = status
  }
  return { data }
}

function toTeamMemberResponse(member: any) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { otp: _otp, otpExpires: _otpExpires, ...rest } = member ?? {}
  return rest
}

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

    if (!(await isMerchantAccountAdmin(user, id)) && !['ADMIN', 'MAKER', 'CHECKER', 'HEAD_OFFICE'].includes(user.role || '')) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'MERCHANT_TEAM_MEMBER_CREATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: null,
        newValue: { result: 'failed', reason: 'FORBIDDEN_ROLE', merchantId: id },
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { data, error: inputError } = pickTeamMemberInput(body)
    if (inputError) {
      return NextResponse.json({ error: inputError }, { status: 400 })
    }
    if (!data.name || !data.email || !data.role) {
      return NextResponse.json({ error: 'name, email and role are required' }, { status: 400 })
    }

    const member = await db.addMerchantTeamMember({
      ...data,
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

    return NextResponse.json(toTeamMemberResponse(member), { status: 201 })
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

    if (!(await isMerchantAccountAdmin(user, id)) && !['ADMIN', 'MAKER', 'CHECKER', 'HEAD_OFFICE'].includes(user.role || '')) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'MERCHANT_TEAM_MEMBER_UPDATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: null,
        newValue: { result: 'failed', reason: 'FORBIDDEN_ROLE', merchantId: id },
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const memberId = typeof body?.memberId === 'string' ? body.memberId : ''

    // The member must belong to the merchant in the URL — the permission checks
    // above are about merchant `id`, so a memberId from another merchant is a
    // cross-tenant write.
    const existing = memberId
      ? await prisma.merchantTeamMember.findFirst({
          where: { id: memberId, merchantId: id },
          select: { id: true },
        })
      : null
    if (!existing) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'MERCHANT_TEAM_MEMBER_UPDATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: memberId || null,
        newValue: { result: 'failed', reason: 'MEMBER_NOT_IN_MERCHANT', merchantId: id },
      })
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
    }

    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') {
        return NextResponse.json({ error: 'Invalid active flag' }, { status: 400 })
      }
      const updated = await db.setMerchantTeamMemberActive(memberId, body.active)

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'MERCHANT_TEAM_MEMBER_UPDATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: memberId,
        oldValue: null,
        newValue: { result: 'success', merchantId: id, active: body.active },
      })

      return NextResponse.json(toTeamMemberResponse(updated))
    } else {
      const { data, error: inputError } = pickTeamMemberInput(body)
      if (inputError) {
        return NextResponse.json({ error: inputError }, { status: 400 })
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
      }
      const updated = await db.updateMerchantTeamMember(memberId, data)

      await writeAuditLog({
        request,
        userId: actorUserId,
        action: 'MERCHANT_TEAM_MEMBER_UPDATE',
        entityType: 'MERCHANT_TEAM_MEMBER',
        entityId: memberId,
        oldValue: null,
        newValue: { result: 'success', merchantId: id, fields: Object.keys(data) },
      })

      return NextResponse.json(toTeamMemberResponse(updated))
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
