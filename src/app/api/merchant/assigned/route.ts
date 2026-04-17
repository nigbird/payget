import { NextResponse } from 'next/server'
import { requireAuthUser } from '@/lib/request-auth'

export async function GET(request: Request) {
  const user = await requireAuthUser(request)

  if (!user?.role || user.role !== 'SALES') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ merchants: user.assignedMerchants ?? [] })
}
