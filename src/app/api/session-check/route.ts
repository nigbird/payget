import { type NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_CACHE = { "Cache-Control": "no-store" }

/**
 * Concurrent-session revocation probe.
 * Intentionally NOT under /api/auth/ — NextAuth intercepts every route under
 * that prefix and throws UnknownAction before our handler can run.
 *
 * Uses getToken() to read the JWT cookie directly (no NextAuth session()
 * callback involved) so the DB check is never gated by NEXT_RUNTIME === 'edge'.
 */
export async function GET(request: NextRequest) {
  let token: Awaited<ReturnType<typeof getToken>>
  try {
    token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    })
  } catch (err) {
    console.error("[session-check] getToken failed:", err)
    return NextResponse.json({ valid: false }, { status: 401, headers: NO_CACHE })
  }

  if (!token || !token.id) {
    return NextResponse.json({ valid: false }, { status: 401, headers: NO_CACHE })
  }

  const userId = String(token.id)

  // Sales users authenticate via OTP and have no sessionVersion in the DB.
  if (userId.startsWith("sales-")) {
    return NextResponse.json({ valid: true }, { headers: NO_CACHE })
  }

  console.log(
    `[session-check] userId=${userId} token.sessionVersion=${token.sessionVersion as number | undefined}`
  )

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true },
    })

    const tokenVersion = token.sessionVersion as number | undefined

    console.log(
      `[session-check] db.sessionVersion=${dbUser?.sessionVersion} token.sessionVersion=${tokenVersion} match=${dbUser?.sessionVersion === tokenVersion}`
    )

    if (!dbUser || dbUser.sessionVersion !== tokenVersion) {
      return NextResponse.json({ valid: false }, { status: 401, headers: NO_CACHE })
    }

    return NextResponse.json({ valid: true }, { headers: NO_CACHE })
  } catch (err) {
    console.error("[session-check] DB check error:", err)
    return NextResponse.json(
      { valid: false, reason: "db_error" },
      { status: 503, headers: NO_CACHE }
    )
  }
}
