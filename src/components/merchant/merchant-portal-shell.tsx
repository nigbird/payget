"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, History, Users, Settings2, LogOut } from "lucide-react"
import { signOut, useSession } from "next-auth/react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Merchant, MerchantTeamRole } from "@/app/lib/db"
import { cn } from "@/lib/utils"
import { PWAInstallButton } from "@/components/pwa-install-button"

export type MerchantPortalModuleRole =
  | "payment_initiator"
  | "account_admin"

const MerchantPortalRoleContext = React.createContext<MerchantTeamRole>("account_admin")

export function useMerchantPortalRole() {
  return React.useContext(MerchantPortalRoleContext)
}

export default function MerchantPortalShell({
  merchantId,
  children,
}: {
  merchantId: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()

  const [merchant, setMerchant] = React.useState<Merchant | null>(null)
  const [assignedMerchants, setAssignedMerchants] = React.useState<{ id: string; name: string }[]>([])

  const isSalesUser = (session?.user as { role?: string } | undefined)?.role === "SALES"
  const activeRole: MerchantTeamRole = isSalesUser ? "payment_initiator" : "account_admin"

  const assignedMerchantsFromSession = (session?.user as any)?.assignedMerchants as { id: string; name: string }[] | undefined

  React.useEffect(() => {
    if (!isSalesUser) return
    if (assignedMerchantsFromSession?.length) {
      setAssignedMerchants(assignedMerchantsFromSession)
      return
    }

    const fetchAssignedMerchants = async () => {
      try {
        const response = await fetch('/api/merchant/assigned')
        if (!response.ok) return
        const data = await response.json()
        setAssignedMerchants(data.merchants ?? [])
      } catch (error) {
        console.error('Failed to load assigned merchants:', error)
      }
    }

    fetchAssignedMerchants()
  }, [isSalesUser, assignedMerchantsFromSession])

  React.useEffect(() => {
    const fetchMerchant = async () => {
      try {
        const response = await fetch(`/api/merchants/${merchantId}`)
        if (response.ok) {
          const m = await response.json()
          setMerchant(m)
        }
      } catch (error) {
        console.error('Failed to fetch merchant:', error)
      }
    }
    fetchMerchant()
  }, [merchantId])

  const restrictedSalesPaths = React.useMemo(
    () => [`/merchant/${merchantId}/users`, `/merchant/${merchantId}/configuration`],
    [merchantId]
  )

  const isRestrictedSalesPath = isSalesUser && restrictedSalesPaths.some((path) => pathname.startsWith(path))

  React.useEffect(() => {
    if (status === "authenticated" && isRestrictedSalesPath) {
      router.replace(`/merchant/${merchantId}`)
    }
  }, [isRestrictedSalesPath, merchantId, router, status])

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
        label: "Users & Roles",
        href: `/merchant/${merchantId}/users`,
        icon: Users,
        requiresRole: "account_admin" as const,
      },
      {
        key: "configuration",
        label: "Configuration",
        href: `/merchant/${merchantId}/configuration`,
        icon: Settings2,
        requiresRole: "account_admin" as const,
      },
    ] as const
  }, [merchantId])

  const visibleNavItems = navItems.filter((item) => {
    // During initial loading when no session exists, hide role-restricted items
    if (status === "loading" && !session) return !("requiresRole" in item) || item.requiresRole === undefined
    
    // Otherwise, show if no role is required or if user has the correct role
    if (!("requiresRole" in item) || item.requiresRole === undefined) return true
    return item.requiresRole === activeRole
  })

  return (
    <MerchantPortalRoleContext.Provider value={activeRole}>
      <div className="min-h-svh bg-white">
        <header className="sticky top-0 z-50 border-b border-white/50 bg-white/85 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-3 py-2 md:h-16 md:flex-nowrap md:gap-3 md:px-8">
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-gradient-to-br from-[#f8b513]/35 via-[#f8b513]/15 to-[#754319]/20 border border-white/60 shadow-sm flex items-center justify-center overflow-hidden">
                {merchant?.logoUrl ? (
                  <Image
                    src={merchant.logoUrl}
                    alt={merchant.name}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] md:text-xs font-black text-[#754319]">
                    {merchant?.name?.substring(0, 2).toUpperCase() || "FF"}
                  </span>
                )}
              </div>
              <div className="leading-tight">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#754319]/70 hidden md:block">{isSalesUser ? "Sales Portal" : "Merchant Portal"}</p>
                <p className="text-sm font-bold text-[#5b371f] md:text-base">{merchant?.name || "Merchant"}</p>
              </div>
            </div>

            <div className="order-3 w-full min-w-0 md:order-none md:flex-1">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="hidden md:block">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#754319]/40">
                    {isSalesUser ? "Sales Workspace" : "Management Modules"}
                  </p>
                </div>

                <div className={cn("flex w-full items-center justify-around gap-0.5 rounded-[20px] border border-amber-200/40 bg-white/80 backdrop-blur-md shadow-lg md:w-auto md:justify-start md:overflow-x-auto md:rounded-2xl md:border-white/60 md:bg-white/65 md:shadow-none md:backdrop-blur-sm md:bg-none")}>
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
                          "relative flex flex-col items-center justify-center gap-1 px-1 py-1 transition-all duration-500 md:flex-row md:min-h-9 md:gap-2 md:rounded-xl md:px-4 md:py-1.5 md:whitespace-nowrap",
                          isActive
                            ? "text-[#754319] md:bg-gradient-to-r md:from-[#f8b513] md:to-[#754319] md:text-white md:shadow-lg md:shadow-amber-600/30"
                            : "text-[#754319]/50 hover:text-[#754319] md:text-[#754319]/70 md:hover:bg-amber-50/50"
                        )}
                        title={item.label}
                      >
                        <div className={cn(
                          "relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-500 md:h-auto md:w-auto md:bg-transparent",
                          isActive && "bg-amber-100/50 md:bg-none"
                        )}>
                          <Icon 
                            className={cn(
                              "h-4 w-4 transition-all duration-500 md:h-5 md:w-5", 
                              isActive 
                                ? "scale-110 text-[#754319] md:scale-100 md:text-inherit md:stroke-[2.5px]" 
                                : "text-[#754319]/60 md:text-inherit md:stroke-[1.5px]"
                            )} 
                          />
                        </div>
                        <span className={cn(
                          "text-[8px] font-bold uppercase tracking-tight md:tracking-tight md:text-sm md:font-bold md:capitalize md:inline",
                          isActive ? "text-[#754319] md:text-inherit" : "text-[#754319]/50 group-hover:text-[#754319] md:text-inherit"
                        )}>
                          {item.label}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0 md:gap-3">
              {isSalesUser && assignedMerchants.length > 1 ? (
                <div className="min-w-[140px] md:min-w-[220px]">
                  <Select value={merchantId} onValueChange={(value) => router.push(`/merchant/${value}`)}>
                  <SelectTrigger className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white text-xs text-[#5b371f] shadow-sm md:text-sm">
                      <SelectValue placeholder={merchant?.name ?? "Select merchant"} />
                    </SelectTrigger>
                    <SelectContent>
                      {assignedMerchants.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <PWAInstallButton />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/login/merchant" })}
                className="h-11 min-h-11 gap-2 rounded-xl px-2 text-[#754319] hover:bg-red-50 hover:text-red-600 md:px-3"
                title="Log Out"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden md:inline text-sm font-semibold">Log Out</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 md:px-8 pt-5 pb-28">
          {isRestrictedSalesPath ? null : children}
        </main>
      </div>
    </MerchantPortalRoleContext.Provider>
  )
}

