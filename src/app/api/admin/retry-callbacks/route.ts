import { NextResponse } from "next/server"
import { requireAuthUser } from "@/lib/request-auth"
import { processCallbackQueue } from "@/lib/merchant-callback"
import { prisma } from "@/lib/prisma"

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
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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
    const user = await requireAuthUser(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const result = await processCallbackQueue()

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
