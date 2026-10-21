import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateSalesOtp } from '@/lib/otp'
import { sendNotification } from '@/lib/notifications'
import { writeAuditLog } from '@/lib/audit-log'
import { requireCsrf } from '@/lib/request-security';
import { maskPhone } from '@/lib/utils';
import { getClientIp } from '@/lib/client-ip'
import { hitRateLimits } from '@/lib/memory-rate-limit'

const TEN_MINUTES = 10 * 60 * 1000

/**
 * Public by necessity (it starts the login), so it must not reveal anything:
 * the reply is the same whether or not the phone belongs to a team member, and
 * it no longer lists the merchants a phone is linked to — those come back from
 * the OTP login itself, after the code proves the caller owns the phone.
 */
const GENERIC_SENT_MESSAGE = 'If this number is registered, a one-time code has been sent to it.'

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const body = await request.json().catch(() => ({}))
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const actorUserId: string | null = null

  if (!phone) {
    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "SALES_OTP_SEND",
      entityType: "SALES_OTP_REQUEST",
      entityId: null,
      newValue: { result: "failed", reason: "PHONE_REQUIRED" },
    })

    return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 })
  }

  // Each send costs an SMS and lands on someone's phone: cap per number and per caller.
  const limit = hitRateLimits([
    { key: `sales-otp-send:phone:${phone}`, limit: 3, windowMs: TEN_MINUTES },
    { key: `sales-otp-send:ip:${getClientIp(request)}`, limit: 30, windowMs: TEN_MINUTES },
  ])
  if (!limit.allowed) {
    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "SALES_OTP_SEND",
      entityType: "SALES_OTP_REQUEST",
      entityId: null,
      newValue: { result: "failed", reason: "RATE_LIMITED", phone: maskPhone(phone) },
    })
    return NextResponse.json(
      {
        error: `Too many code requests. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`,
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const members = await db.findMerchantTeamMembersByPhone(phone)
  const activeMembers = members.filter(
    (member) =>
      member.status === 'ACTIVE' &&
      member.merchant &&
      member.merchant.status === 'ACTIVE'
  )

  if (activeMembers.length === 0) {
    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "SALES_OTP_SEND",
      entityType: "SALES_OTP_REQUEST",
      entityId: null,
      newValue: { result: "failed", reason: "NO_ACTIVE_SALES_USER", phone: maskPhone(phone) },
    })

    return NextResponse.json({ success: true, message: GENERIC_SENT_MESSAGE })
  }

  const otp = await generateSalesOtp(phone)

  console.info("[sales-otp] OTP generated and sent", { phone: maskPhone(phone) })

  await sendNotification({
    to: phone,
    subject: 'Your Login with OTP Code',
    message: `Your one-time login code is ${otp}. It expires in 5 minutes.`
  })

  await writeAuditLog({
    request,
    userId: actorUserId,
    action: "SALES_OTP_SEND",
    entityType: "SALES_OTP_REQUEST",
    entityId: null,
    newValue: { result: "success", phone: maskPhone(phone) },
  })

  return NextResponse.json({ success: true, message: GENERIC_SENT_MESSAGE })
  } catch (error) {
    console.error('Error sending sales OTP:', error);
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
  }
}
