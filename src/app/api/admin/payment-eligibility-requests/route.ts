import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser, userHasPermission } from "@/lib/request-auth"

export async function GET(request: Request) {
  const user = await requireAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!userHasPermission(user, "PAYMENT_ELIGIBILITY_APPROVE")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 })
  }

  const requests = await prisma.paymentEligibilityImport.findMany({
    where: { status: { not: "DRAFT" } },
    include: {
      merchant: { select: { id: true, name: true } },
      submitter: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ requests })
}
