"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, History, Users, Settings2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { MerchantTeamRole } from "@/app/lib/db"

export type MerchantPortalModuleRole =
  | "payment_initiator"
  | "account_admin"

export default function BottomNavbar({
  merchantId,
  activeRole,
}: {
  merchantId: string
  activeRole: MerchantTeamRole
}) {
  const pathname = usePathname()

  const navItems = React.useMemo(() => {
    return [
      {
        key: "dashboard",
        label: "Dashboard",
        href: `/merchant/${merchantId}`,
        icon: LayoutDashboard,
      },
      {
        key: "transactions",
        label: "Transactions",
        href: `/merchant/${merchantId}/transactions`,
        icon: History,
      },
      {
        key: "users",
        label: "Users",
        href: `/merchant/${merchantId}/users`,
        icon: Users,
        requiresRole: "account_admin" as const,
      },
      {
        key: "configuration",
        label: "Settings",
        href: `/merchant/${merchantId}/configuration`,
        icon: Settings2,
        requiresRole: "account_admin" as const,
      },
    ] as const
  }, [merchantId])

  const visibleNavItems = navItems.filter((item) => {
    // For simplicity, assuming status is authenticated for bottom nav
    if (!("requiresRole" in item) || item.requiresRole === undefined) return true
    return item.requiresRole === activeRole
  })

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 block border-t border-white/50 bg-white/85 backdrop-blur-md md:hidden">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {visibleNavItems.map((item) => {
          const Icon = item.icon
          const isActive =
            pathname === item.href ||
            (item.key === "dashboard" && pathname === `/merchant/${merchantId}`)
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "text-[#754319]"
                  : "text-muted-foreground hover:text-[#754319]"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
