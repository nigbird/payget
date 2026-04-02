"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, LayoutDashboard, History, Users, Settings2 } from "lucide-react"

import { db, type Merchant, type MerchantTeamRole } from "@/app/lib/db"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { RequestPaymentModal } from "@/components/merchant/request-payment-modal"

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
  const { toast } = useToast()
  const isMobile = useIsMobile()

  const [merchant, setMerchant] = React.useState<Merchant | null>(null)
  const [isRequestOpen, setIsRequestOpen] = React.useState(false)

  // Repo has no auth yet. For now, treat the active merchant user as Account Admin (UI-only RBAC).
  const activeRole: MerchantTeamRole = "account_admin"

  React.useEffect(() => {
    const m = db.getMerchantById(merchantId)
    if (m) setMerchant(m)
  }, [merchantId])

  const isMerchantApproved = merchant?.status === "approved"

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
    if (!("requiresRole" in item) || item.requiresRole === undefined) return true
    return item.requiresRole === activeRole
  })

  const handleOpenRequestPayment = () => {
    if (!merchant) return
    if (!isMerchantApproved) {
      toast({
        variant: "destructive",
        title: "Merchant not active",
        description: "Request Payment is available once your merchant account is approved.",
      })
      return
    }
    setIsRequestOpen(true)
  }

  return (
    <MerchantPortalRoleContext.Provider value={activeRole}>
      <div className="min-h-svh bg-[linear-gradient(135deg,#fff9ef_0%,#fdf1d4_45%,#fbe8bc_100%)]">
        <header className="sticky top-0 z-50 border-b border-white/50 bg-white/70 backdrop-blur-md">
          <div className="mx-auto w-full max-w-7xl px-4 md:px-8 h-16 flex items-center gap-3">
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#f8b513]/35 via-[#f8b513]/15 to-[#754319]/20 border border-white/60 shadow-sm flex items-center justify-center">
                <Plus className="h-4 w-4 text-[#754319]" />
              </div>
              <div className="leading-tight">
                <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Merchant Portal</p>
                <p className="text-sm font-semibold text-[#5b371f]">{merchant?.name ?? "—"}</p>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="hidden md:block">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">Management Modules</p>
                </div>

                <div
                  className={cn(
                    "flex items-center gap-1 rounded-2xl bg-white/65 border border-white/60 backdrop-blur-sm px-1 py-1",
                    isMobile && "w-full overflow-x-auto"
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
                      >
                        <Icon className={cn("h-4 w-4", isActive ? "text-white" : "text-[#754319]")} />
                        <span className="text-sm font-semibold">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-3 shrink-0">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#754319]/70">Frequent Actions</p>
              </div>

              <Button
                type="button"
                onClick={handleOpenRequestPayment}
                disabled={!isMerchantApproved}
                className="h-11 rounded-2xl bg-gradient-to-r from-[#f8b513] to-[#754319] px-5 text-white shadow-lg shadow-amber-700/30 hover:-translate-y-0.5 transition-all disabled:opacity-70"
              >
                <Plus className="mr-2 h-4 w-4" />
                Request Payment
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 md:px-8 pt-5 pb-28">
          {children}
        </main>

        {/* Mobile CTA */}
        {isMobile && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button
              type="button"
              onClick={handleOpenRequestPayment}
              disabled={!isMerchantApproved}
              className="h-14 rounded-full bg-gradient-to-r from-[#f8b513] to-[#754319] px-6 text-white shadow-2xl shadow-amber-500/40 hover:scale-[1.02] active:scale-95 md:hidden"
            >
              <Plus className="mr-2 h-5 w-5" />
              Request Payment
            </Button>
          </div>
        )}

        <RequestPaymentModal
          merchantId={merchantId}
          open={isRequestOpen}
          onOpenChange={setIsRequestOpen}
          isMerchantApproved={isMerchantApproved}
        />
      </div>
    </MerchantPortalRoleContext.Provider>
  )
}

