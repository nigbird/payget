import crypto from 'crypto'

const otpStore = new Map<string, { code: string; expiresAt: number }>()
const OTP_TTL_MS = 5 * 60 * 1000 // 5 minutes

function generateSecureOtp(): string {
  const randomBytes = crypto.randomBytes(3)
  const randomNumber = randomBytes.readUIntBE(0, 3)
  const otp = (randomNumber % 900000) + 100000
  return otp.toString()
}

export function generateSalesOtp(phone: string) {
  const code = generateSecureOtp()
  otpStore.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS })
  return code
}

export function verifySalesOtp(phone: string, code: string) {
  const record = otpStore.get(phone)
  if (!record) return false
  if (record.expiresAt < Date.now()) {
    otpStore.delete(phone)
    return false
  }

  const isValid = record.code === code
  if (isValid) otpStore.delete(phone)
  return isValid
}
