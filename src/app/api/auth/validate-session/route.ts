import { NextResponse } from "next/server"
import { getAccessTokenFromCookie } from "@/lib/access-token-cookie"
import { verifyAccessToken } from "@/lib/token-auth"
import { validateSession } from "@/lib/session-manager"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const token = await getAccessTokenFromCookie(request)
    if (!token) return NextResponse.json({ valid: false }, { status: 401 })

    const payload = await verifyAccessToken(token)
    const userId = typeof payload.sub === "string" ? payload.sub : null
    if (!userId) return NextResponse.json({ valid: false }, { status: 401 })

    // SALES users have no ActiveSession — JWT alone is enough.
    if (userId.startsWith("sales-")) return NextResponse.json({ valid: true })

    const sid = typeof (payload as any).sid === "string" ? (payload as any).sid as string : ""
    if (!sid) {
      // Token without sid (pre-migration token) — treat as valid; session-version
      // check happens in requireAuthUser on actual API calls.
      return NextResponse.json({ valid: true })
    }

    const valid = await validateSession(sid)
    if (!valid) return NextResponse.json({ valid: false }, { status: 401 })

    return NextResponse.json({ valid: true })
  } catch {
    return NextResponse.json({ valid: false }, { status: 401 })
  }
}
