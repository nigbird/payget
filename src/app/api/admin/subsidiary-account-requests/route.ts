import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, userHasAnyPermission } from "@/lib/request-auth"

export async function GET(request: Request) {
  const user = await requireAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!userHasAnyPermission(user, ["SUBSIDIARY_ACCOUNT_APPROVE", "SUBSIDIARY_ACCOUNT_REQUEST"])) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const requests = await prisma.subsidiaryAccountRequest.findMany({
    where: { status: "PENDING" },
    include: {
      merchant: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ requests })
}
