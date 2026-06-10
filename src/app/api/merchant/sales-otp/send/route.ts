import { NextResponse } from 'next/server'
import { db } from '@/app/lib/db'
import { generateSalesOtp } from '@/lib/otp'
import { sendNotification } from '@/lib/notifications'
import { writeAuditLog } from '@/lib/audit-log'
import { requireCsrf } from '@/lib/request-security';
import { maskPhone } from '@/lib/utils';

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const body = await request.json()
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

    return NextResponse.json({ error: 'No active sales user found for this phone number.' }, { status: 404 })
  }

  const otp = await generateSalesOtp(phone)

  console.info("[sales-otp] OTP generated and sent", { phone: maskPhone(phone) })

  await sendNotification({
    to: phone,
    subject: 'Your Sales Login OTP',
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

  const merchants = activeMembers.map(member => ({
    id: member.merchantId,
    name: member.merchant.name
  }))

  // Deduplicate merchants by ID
  const uniqueMerchants = Array.from(
    new Map(merchants.map(m => [m.id, m])).values()
  )

  return NextResponse.json({ 
    success: true, 
    message: 'OTP sent to your phone number.',
    merchants: uniqueMerchants
  })
  } catch (error) {
    console.error('Error sending sales OTP:', error);
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
  }
}
