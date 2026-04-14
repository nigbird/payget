"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { Bell, Search, Settings2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const routeTitles: Array<{ href: string; title: string; subtitle?: string }> = [
  { href: "/admin", title: "Management Overview", subtitle: "NibTera merchants administration" },
  { href: "/admin/onboarding", title: "Merchant Onboarding", subtitle: "Register and verify new merchants" },
  { href: "/admin/review", title: "Review & Approvals", subtitle: "Compliance queue and activation" },
  { href: "/admin/users", title: "Staff Management", subtitle: "Teams, access, and assignments" },
  { href: "/admin/roles", title: "Permission Governance", subtitle: "Roles and granular permissions" },
]

export function AdminTopbar({ className }: { className?: string }) {
  const pathname = usePathname()
  const { data: session } = useSession()

  const header = useMemo(() => {
    const exact = routeTitles.find((r) => r.href === pathname)
    if (exact) return exact
    const fuzzy = routeTitles.find((r) => pathname.startsWith(r.href + "/"))
    return fuzzy ?? routeTitles[0]
  }, [pathname])

  const initials =
    (session?.user?.name ?? "User")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U"

  return (
    <header
      className={cn(
        "sticky top-0 z-40",
        "border-b border-white/20",
        "bg-white/35 backdrop-blur-xl",
        className
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-6">
        <SidebarTrigger className="text-[#754319] hover:bg-white/50" />

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-tight text-slate-900">
            {header.title}
          </div>
          {header.subtitle ? (
            <div className="truncate text-xs text-slate-600">{header.subtitle}</div>
          ) : null}
        </div>

        <div className="hidden w-[420px] max-w-[40vw] md:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search merchants, users, transactions…"
              className={cn(
                "h-10 pl-9",
                "rounded-2xl border-white/30 bg-white/45 backdrop-blur",
                "shadow-sm shadow-amber-900/5",
                "focus-visible:ring-2 focus-visible:ring-[#f8b513]/40"
              )}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-2xl bg-white/35 hover:bg-white/55"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4 text-slate-700" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-2xl bg-white/35 hover:bg-white/55"
            aria-label="Quick settings"
          >
            <Settings2 className="h-4 w-4 text-slate-700" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "group flex items-center gap-2 rounded-2xl",
                  "bg-white/35 px-2 py-1.5 hover:bg-white/55",
                  "border border-white/20 shadow-sm shadow-amber-900/5",
                  "transition-colors"
                )}
                aria-label="Profile"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-[#f8b513]/15 text-[#754319] text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden min-w-0 md:block">
                  <div className="max-w-[160px] truncate text-xs font-semibold text-slate-900">
                    {session?.user?.name ?? "User"}
                  </div>
                  <div className="max-w-[160px] truncate text-[10px] text-slate-600">
                    {(session?.user as any)?.role ?? "Staff"}
                  </div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-700"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

