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
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

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
  const isMobile = useIsMobile()
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
    if (status === "loading") return !("requiresRole" in item) || item.requiresRole === undefined
    if (!("requiresRole" in item) || item.requiresRole === undefined) return true
    return item.requiresRole === activeRole
  })

  return (
    <MerchantPortalRoleContext.Provider value={activeRole}>
      <div className="min-h-svh bg-app-main">
        <header className="sticky top-0 z-50 border-b border-white/50 bg-white/70 backdrop-blur-md">
          <div className="mx-auto w-full max-w-7xl px-4 md:px-8 h-16 flex items-center gap-3">
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-gradient-to-br from-[#f8b513]/35 via-[#f8b513]/15 to-[#754319]/20 border border-white/60 shadow-sm flex items-center justify-center overflow-hidden">
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
              <div className="leading-tight hidden sm:block">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#754319]/70">{isSalesUser ? "Sales Portal" : "Merchant Portal"}</p>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="hidden md:block">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">
                    {isSalesUser ? "Sales Workspace" : "Management Modules"}
                  </p>
                </div>

                <div
                  className={cn(
                    "flex items-center gap-1 rounded-2xl bg-white/65 border border-white/60 backdrop-blur-sm px-1 py-1",
                    isMobile ? "w-auto" : "w-auto"
                  )}
                >
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
                          "flex items-center gap-2 px-3 py-2 rounded-xl transition-all whitespace-nowrap",
                          isActive
                            ? "bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-md shadow-amber-600/25"
                            : "text-[#754319] hover:bg-white/90"
                        )}
                        title={item.label}
                      >
                        <Icon className={cn("h-4 w-4", isActive ? "text-white" : "text-[#754319]")} />
                        <span className="hidden md:inline text-sm font-semibold">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="shrink-0 ml-auto md:ml-0 flex items-center gap-2 md:gap-3">
              {isSalesUser && assignedMerchants.length > 1 ? (
                <div className="min-w-[140px] md:min-w-[220px]">
                  <Select value={merchantId} onValueChange={(value) => router.push(`/merchant/${value}`)}>
                    <SelectTrigger className="w-full rounded-xl border border-[#E5E7EB] bg-white text-xs md:text-sm text-[#5b371f] shadow-sm">
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

              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-[#754319] hover:bg-red-50 hover:text-red-600 rounded-xl gap-2 px-2 md:px-3"
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

