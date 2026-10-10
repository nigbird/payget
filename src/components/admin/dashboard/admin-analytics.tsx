"use client"

import { useEffect, useState } from "react"
import { Briefcase, Cpu, Lock } from "lucide-react"

import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { DASHBOARD_BUSINESS_VIEW, DASHBOARD_TECHNICAL_VIEW } from "@/lib/dashboard-permissions"
import type { MerchantOption } from "@/lib/admin-dashboard-export"
import { BusinessDashboard } from "./business-dashboard"
import { TechnicalDashboard } from "./technical-dashboard"
import { defaultRange, type DashboardFilters } from "./shared"

type View = "business" | "technical"
const VIEW_STORAGE_KEY = "admin-dashboard-view"

const VIEWS: { key: View; label: string; description: string; permission: string; icon: typeof Briefcase }[] = [
  { key: "business", label: "Business", description: "Transactions & amounts", permission: DASHBOARD_BUSINESS_VIEW, icon: Briefcase },
  { key: "technical", label: "Technical", description: "Health, failures & operations", permission: DASHBOARD_TECHNICAL_VIEW, icon: Cpu },
]

/**
 * Business and technical analytics, each behind its own permission. Holding both
 * shows a switcher; the date range and merchant filter carry across views.
 */
export function AdminAnalytics() {
  const { user } = useAuth()
  const permissions = user?.permissions ?? []
  const allowed = VIEWS.filter((v) => permissions.includes(v.permission))

  const [view, setView] = useState<View | null>(null)
  const [filters, setFilters] = useState<DashboardFilters>(() => ({ range: defaultRange(), merchantId: null }))
  const [merchants, setMerchants] = useState<MerchantOption[]>([])

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(VIEW_STORAGE_KEY)
    } catch {}
    setView((current) => current ?? (saved === "technical" || saved === "business" ? saved : null))
  }, [])

  const active = allowed.find((v) => v.key === view)?.key ?? allowed[0]?.key

  const choose = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v)
    } catch {}
  }

  if (!user) return null

  if (!active) {
    return (
      <div className="flex items-center gap-3 rounded-[20px] border border-dashed border-[#F1E7D0] bg-[#FFFDF7] p-5 text-sm text-[#6B7280]">
        <Lock className="h-4 w-4 shrink-0 text-[#754319]" />
        Analytics are not enabled for your role. Ask an administrator for the business or technical dashboard permission.
      </div>
    )
  }

  const userName = user.name ?? user.email ?? undefined

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#1F2937]">
            {active === "business" ? "Business overview" : "Technical overview"}
          </h2>
          <p className="text-xs text-[#6B7280]">
            {active === "business"
              ? "How many transactions merchants made and how much was collected."
              : "Payment health, failures, stuck payments and platform operations."}
          </p>
        </div>
        {allowed.length > 1 && (
          <div role="tablist" aria-label="Dashboard view" className="flex rounded-xl border border-[#F1E7D0] bg-[#FFFDF7] p-0.5">
            {allowed.map(({ key, label, description, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active === key}
                title={description}
                onClick={() => choose(key)}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-[10px] px-4 text-xs font-semibold transition-colors",
                  active === key ? "bg-white text-[#5b371f] shadow-sm ring-1 ring-[#f8b513]/40" : "text-[#754319]/60 hover:text-[#5b371f]",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {active === "business" ? (
        <BusinessDashboard filters={filters} onFiltersChange={setFilters} merchants={merchants} onMerchants={setMerchants} userName={userName} />
      ) : (
        <TechnicalDashboard filters={filters} onFiltersChange={setFilters} merchants={merchants} onMerchants={setMerchants} userName={userName} />
      )}
    </div>
  )
}
