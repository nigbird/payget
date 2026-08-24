import { NextResponse } from "next/server"
import { requireAuthUser } from "@/lib/request-auth"
import { getPublicKeyCacheDebugInfo } from "@/lib/provider-encryption"

export async function GET(request: Request) {
  const user = await requireAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!user.permissions?.includes("CONFIGURATION_MANAGE")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  return NextResponse.json(getPublicKeyCacheDebugInfo())
}
