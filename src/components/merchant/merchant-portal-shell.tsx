"use client"

import * as React from "react"
import Link from "next/link"
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
        <header className="sticky top-0 z-50 border-b border-border/30 bg-background/95 backdrop-blur-md shadow-sm">
          <div className="mx-auto w-full max-w-7xl px-3 xs:px-4 sm:px-6 md:px-8 h-14 xs:h-16 flex items-center gap-2 xs:gap-3">
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <div className="w-7 xs:w-8 h-7 xs:h-8 md:w-10 md:h-10 rounded-lg xs:rounded-xl md:rounded-2xl bg-gradient-to-br from-[#f8b513]/35 via-[#f8b513]/15 to-[#754319]/20 border border-white/60 shadow-sm flex items-center justify-center">
                <span className="text-[9px] xs:text-[10px] md:text-xs font-black text-[#754319]">FF</span>
              </div>
              <div className="leading-tight hidden sm:block">
                <p className="text-[9px] xs:text-[10px] uppercase tracking-[0.2em] text-[#754319]/70">{isSalesUser ? "Sales Portal" : "Merchant Portal"}</p>
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
                    "flex items-center gap-0.5 xs:gap-1 rounded-xl xs:rounded-2xl bg-card border border-border/40 px-0.5 xs:px-1 py-0.5 xs:py-1",
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
                          "flex items-center gap-1 xs:gap-2 px-2 xs:px-3 py-1.5 xs:py-2 rounded-lg xs:rounded-xl transition-all whitespace-nowrap text-xs xs:text-sm font-semibold",
                          isActive
                            ? "gradient-honey text-[#2a1410] shadow-sm"
                            : "text-foreground hover:bg-accent/20"
                        )}
                        title={item.label}
                      >
                        <Icon className={cn("h-3.5 xs:h-4 w-3.5 xs:w-4")} />
                        <span className="hidden md:inline">{item.label}</span>
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
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg xs:rounded-xl gap-1 xs:gap-2 px-2 xs:px-3 font-semibold text-xs xs:text-sm h-8 xs:h-auto"
                title="Log Out"
              >
                <LogOut className="h-3.5 xs:h-4 w-3.5 xs:w-4" />
                <span className="hidden md:inline">Log Out</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-3 xs:px-4 sm:px-6 md:px-8 pt-4 xs:pt-5 sm:pt-6 pb-24 sm:pb-28">
          {isRestrictedSalesPath ? null : children}
        </main>
      </div>
    </MerchantPortalRoleContext.Provider>
  )
}

