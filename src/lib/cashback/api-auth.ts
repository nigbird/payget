import { NextResponse } from "next/server"
import { canAccessMerchant, isMerchantAccountAdmin, requireAuthUser } from "@/lib/request-auth"

/**
 * Reads (GET) are open to anyone who can access the merchant — the dashboard
 * shows cashback to every team member. Changes to cashback settings, categories
 * and eligible customers require an account admin of *this* merchant (the
 * merchant's own login, or a team member whose role here is account_admin);
 * payment initiators and back-office staff can't alter a merchant's cashback.
 */
export async function requireMerchantCashbackAccess(request: Request, merchantId: string) {
  const user = await requireAuthUser(request)
  if (!user || !canAccessMerchant(user, merchantId)) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (request.method !== "GET" && !(await isMerchantAccountAdmin(user, merchantId))) {
    return {
      user: null,
      error: NextResponse.json({ error: "Only an account admin can change cashback settings" }, { status: 403 }),
    }
  }
  return { user, error: null }
}
