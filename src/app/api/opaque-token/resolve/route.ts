import { NextResponse } from 'next/server'
import { resolveOpaqueToken } from '@/lib/opaque-tokens'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const result = await resolveOpaqueToken(token)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ type: result.type, data: result.data })
  } catch (error) {
    console.error('Error resolving opaque token:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
