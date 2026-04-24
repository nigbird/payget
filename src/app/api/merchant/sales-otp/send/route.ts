import { NextResponse } from 'next/server'
import { db } from '@/app/lib/db'
import { generateSalesOtp } from '@/lib/otp'
import { sendNotification } from '@/lib/notifications'

export async function POST(request: Request) {
  const body = await request.json()
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''

  if (!phone) {
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
    return NextResponse.json({ error: 'No active sales user found for this phone number.' }, { status: 404 })
  }

  const otp = generateSalesOtp(phone)

  console.info("[sales-otp] OTP generated and sent", { phone, otp })

  await sendNotification({
    to: phone,
    subject: 'Your Sales Login OTP',
    message: `Your one-time login code is ${otp}. It expires in 5 minutes.`
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
}
