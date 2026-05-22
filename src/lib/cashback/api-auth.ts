import { NextResponse } from "next/server"
import { canAccessMerchant, requireAuthUser } from "@/lib/request-auth"

export async function requireMerchantCashbackAccess(request: Request, merchantId: string) {
  const user = await requireAuthUser(request)
  if (!user || !canAccessMerchant(user, merchantId)) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { user, error: null }
}
