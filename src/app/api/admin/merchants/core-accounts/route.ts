import { prisma } from "@/lib/prisma"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"
import { writeAuditLog } from "@/lib/audit-log"

/**
 * CSV of merchant account numbers for core banking to watch. Core banking
 * notifies /api/inbound/credit only for credits to accounts on this list, so
 * it must be re-exported and re-shared whenever a merchant is activated,
 * deactivated or changes account.
 *
 * Only ACTIVE/APPROVED merchants are listed — the same set /api/inbound/credit
 * will match a credit against.
 */

// Leading = + - @ make spreadsheet apps evaluate a cell as a formula.
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export async function GET(request: Request) {
  const user = await requireAuthUser(request)
  if (!user || (user.role !== "ADMIN" && !userHasPermission(user, "qr.generation.manage"))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const merchants = await prisma.merchant.findMany({
    where: { status: { in: ["ACTIVE", "APPROVED"] } },
    select: { id: true, name: true, accountNumber: true },
    orderBy: { accountNumber: "asc" },
  })

  const perAccount = new Map<string, number>()
  for (const m of merchants) perAccount.set(m.accountNumber, (perAccount.get(m.accountNumber) ?? 0) + 1)
  // A credit to a shared account can't be attributed to one merchant and is
  // rejected by /api/inbound/credit; flag these so ops fix them before sharing.
  const sharedAccounts = [...perAccount.entries()].filter(([, n]) => n > 1).map(([a]) => a)

  const lines = [
    ["account_number", "merchant_id", "merchant_name"].map(csvCell).join(","),
    ...merchants.map((m) => [m.accountNumber, m.id, m.name].map(csvCell).join(",")),
  ]

  await writeAuditLog({
    request,
    userId: user.id,
    action: "CORE_ACCOUNT_LIST_EXPORT",
    entityType: "MERCHANT",
    entityId: null,
    newValue: { merchantCount: merchants.length, sharedAccounts },
  })

  const date = new Date().toISOString().slice(0, 10)
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="merchant-accounts-${date}.csv"`,
      "Cache-Control": "no-store",
      "X-Merchant-Count": String(merchants.length),
      "X-Shared-Accounts": sharedAccounts.join(","),
    },
  })
}
