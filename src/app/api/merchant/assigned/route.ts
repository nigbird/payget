import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  const user = session?.user as {
    role?: string
    assignedMerchants?: { id: string; name: string }[]
  } | undefined

  if (!user?.role || user.role !== 'SALES') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ merchants: user.assignedMerchants ?? [] })
}
