import { NextResponse } from "next/server"
import { requireAuthUser } from "@/lib/request-auth"
import { reconcileMpgsTransactions } from "@/lib/mpgs-settlement"


export async function POST(request: Request) {
  try {
    const user = await requireAuthUser(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { results, stats } = await reconcileMpgsTransactions({
      request,
      actorUserId: user.id,
    })

    return NextResponse.json({
      message: "MPGS reconciliation complete",
      ...stats,
      results,
    })
  } catch (error) {
    console.error("[reconcile-mpgs] POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
