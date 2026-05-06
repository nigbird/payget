import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export type TokenType = 'PASSWORD_SETUP' | 'MERCHANT_UPDATE' | 'RESET_PASSWORD' | 'PAYMENT'

export async function createOpaqueToken(
  type: TokenType,
  data: Record<string, any>,
  expiresAt: Date
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')

  await prisma.opaqueToken.create({
    data: {
      token,
      type,
      data,
      expiresAt,
    },
  })

  return token
}

export async function resolveOpaqueToken(token: string): Promise<{
  ok: true
  type: TokenType
  data: Record<string, any>
} | {
  ok: false
  error: string
}> {
  const record = await prisma.opaqueToken.findUnique({
    where: { token },
  })

  if (!record) {
    return { ok: false, error: 'Invalid token' }
  }

  if (record.usedAt) {
    return { ok: false, error: 'Token already used' }
  }

  if (record.expiresAt < new Date()) {
    return { ok: false, error: 'Token expired' }
  }

  return {
    ok: true,
    type: record.type as TokenType,
    data: record.data as Record<string, any>,
  }
}

export async function markTokenAsUsed(token: string): Promise<void> {
  await prisma.opaqueToken.update({
    where: { token },
    data: { usedAt: new Date() },
  })
}
