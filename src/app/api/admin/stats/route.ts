import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuthUser } from "@/lib/request-auth"
import { subDays, startOfMonth, format } from "date-fns"

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only allow admins or those with specific permission
    const isAllowed = user.role === "ADMIN" || user.permissions?.includes("DASHBOARD_VIEW")
    if (!isAllowed) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const now = new Date()
    const thirtyDaysAgo = subDays(now, 30)

    // 1. Total Volume (Last 30 days)
    const volume30d = await prisma.transaction.aggregate({
      where: {
        status: "SUCCESS",
        timestamp: { gte: thirtyDaysAgo },
      },
      _sum: {
        amount: true,
      },
    })

    // 2. Monthly Volume (Last 6 months)
    const chartData = []
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subDays(now, i * 30)) // Rough month calculation
      const monthEnd = i === 0 ? now : startOfMonth(subDays(now, (i - 1) * 30))
      
      const monthlyVolume = await prisma.transaction.aggregate({
        where: {
          status: "SUCCESS",
          timestamp: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
        _sum: {
          amount: true,
        },
      })

      chartData.push({
        month: format(monthStart, "MMM"),
        volume: monthlyVolume._sum.amount || 0,
      })
    }

    // 3. Merchants Counts
    const totalMerchants = await prisma.merchant.count()
    const activeMerchants = await prisma.merchant.count({
      where: {
        status: { in: ["APPROVED", "ACTIVE"] },
      },
    })
    const pendingMerchants = await prisma.merchant.count({
      where: {
        status: { in: ["PENDING", "BRANCH_APPROVED", "RESUBMITTED"] },
      },
    })

    // 4. Active Users
    const activeUsers = await prisma.user.count({
      where: {
        status: "ACTIVE",
      },
    })

    return NextResponse.json({
      volume30d: volume30d._sum.amount || 0,
      chartData,
      totalMerchants,
      activeMerchants,
      pendingMerchants,
      activeUsers,
    })
  } catch (error) {
    console.error("Error fetching admin stats:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
