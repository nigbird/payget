import { NextResponse } from "next/server"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import { writeAuditLog } from "@/lib/audit-log"
import { processCallbackQueue } from "@/lib/merchant-callback"
import { prisma } from "@/lib/prisma"
import { requireCsrf } from "@/lib/request-security"

/**
 * GET  — returns all queued callback entries with their current status.
 * POST — processes all PENDING entries whose nextRetryAt is now or in the past.
 *
 * Both require ADMIN role.
 */

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!userHasPermission(user, "payment.reconciliation.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const entries = await prisma.merchantCallbackQueue.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    })

    const summary = {
      pending: entries.filter((e) => e.status === "PENDING").length,
      delivered: entries.filter((e) => e.status === "DELIVERED").length,
      exhausted: entries.filter((e) => e.status === "EXHAUSTED").length,
    }

    return NextResponse.json({ summary, entries })
  } catch (err) {
    console.error("[retry-callbacks] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const csrfError = requireCsrf(request)
    if (csrfError) return csrfError

    const user = await requireAuthUser(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!userHasPermission(user, "payment.reconciliation.manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const result = await processCallbackQueue()

    await writeAuditLog({
      request,
      userId: user.id,
      action: "MERCHANT_CALLBACK_RETRY_RUN",
      entityType: "SYSTEM",
      entityId: null,
      newValue: { delivered: result.delivered, failed: result.failed, exhausted: result.exhausted },
    })

    return NextResponse.json({
      message: "Queue processed",
      delivered: result.delivered,
      failed: result.failed,
      exhausted: result.exhausted,
    })
  } catch (err) {
    console.error("[retry-callbacks] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
