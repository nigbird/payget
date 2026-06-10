import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import { revokeAllUserSessions, revokeSession } from "@/lib/session-manager"
import { writeAuditLog } from "@/lib/audit-log"

type Params = { params: Promise<{ userId: string }> }

/**
 * GET /api/admin/sessions/[userId]
 * List active sessions for a user. Requires ADMIN role or USER_CREATE permission.
 */
export async function GET(request: Request, { params }: Params) {
  const { userId } = await params
  const authUser = await requireAuthUser(request)
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (authUser.role !== "ADMIN" && !userHasPermission(authUser, "USER_CREATE")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const now = new Date()
  const sessions = await prisma.activeSession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      lastActivityAt: true,
      revokedAt: true,
      userAgent: true,
      ipAddress: true
    }
  })

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      ...s,
      active: s.revokedAt === null && s.expiresAt > now
    }))
  })
}

/**
 * DELETE /api/admin/sessions/[userId]
 * Revoke sessions for a user.
 * Body: { sid?: string } — if sid is provided, revoke that session only; otherwise revoke all.
 */
export async function DELETE(request: Request, { params }: Params) {
  const { userId } = await params
  const authUser = await requireAuthUser(request)
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (authUser.role !== "ADMIN" && !userHasPermission(authUser, "USER_CREATE")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const targetSid = typeof body.sid === "string" && body.sid ? body.sid : null

  if (targetSid) {
    // Verify the session belongs to the requested user before revoking.
    const session = await prisma.activeSession.findUnique({
      where: { id: targetSid },
      select: { userId: true }
    })
    if (!session || session.userId !== userId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }
    await revokeSession(targetSid)
    await writeAuditLog({
      request,
      userId: authUser.id,
      action: "SESSION_REVOKE",
      entityType: "USER",
      entityId: userId,
      newValue: { sessionId: targetSid, scope: "single" }
    })
    return NextResponse.json({ success: true, revoked: 1 })
  }

  await revokeAllUserSessions(userId)
  await writeAuditLog({
    request,
    userId: authUser.id,
    action: "SESSION_REVOKE",
    entityType: "USER",
    entityId: userId,
    newValue: { scope: "all" }
  })
  return NextResponse.json({ success: true, revoked: "all" })
}
