import crypto from 'crypto'
import { db } from '@/app/lib/db'

const OTP_TTL_MS = 5 * 60 * 1000 // 5 minutes

function generateSecureOtp(): string {
  const randomBytes = crypto.randomBytes(3)
  const randomNumber = randomBytes.readUIntBE(0, 3)
  const otp = (randomNumber % 900000) + 100000
  return otp.toString()
}

export async function generateSalesOtp(phone: string) {
  const code = generateSecureOtp()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  await db.setMerchantTeamMemberOtpByPhone(phone, code, expiresAt)
  return code
}

export async function verifySalesOtp(phone: string, code: string) {
  return db.verifyMerchantTeamMemberOtp(phone, code)
}
