"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  UserPlus, 
  ShieldCheck, 
  CreditCard, 
  Activity,
  LogOut,
  Shield,
  Users,
  Building2,
  Sparkles
} from "lucide-react"
import { cn } from "@/lib/utils"
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent
} from "@/components/ui/sidebar"
import { useSession, signOut } from "next-auth/react"
import { User as UserIcon } from "lucide-react"

const mainMenuItems = [
  { name: "Management Overview", href: "/admin", icon: Activity, permission: "DASHBOARD_GLOBAL_VIEW" },
  { name: "Merchant Onboarding", href: "/admin/onboarding", icon: UserPlus, permission: "MERCHANT_REGISTER" },
  { name: "Review & Approvals", href: "/admin/review", icon: ShieldCheck, permission: "MERCHANT_APPROVE" },
]

const adminMenuItems = [
  { name: "Staff Management", href: "/admin/users", icon: Users, permission: "USER_CREATE" },
  { name: "Permission Governance", href: "/admin/roles", icon: Shield, permission: "ROLE_CREATE" },
]

export function SidebarNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const userPermissions = (session?.user as any)?.permissions || []

  const filteredMenuItems = mainMenuItems.filter(item => 
    !item.permission || userPermissions.includes(item.permission)
  )

  const filteredAdminItems = adminMenuItems.filter(item => 
    !item.permission || userPermissions.includes(item.permission)
  )

  const merchantId = (session?.user as any)?.merchantId

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className={cn(
        "border-0",
        "[&_[data-sidebar=sidebar]]:bg-white/35 [&_[data-sidebar=sidebar]]:backdrop-blur-xl",
        "[&_[data-sidebar=sidebar]]:border [&_[data-sidebar=sidebar]]:border-white/25",
        "[&_[data-sidebar=sidebar]]:shadow-sm [&_[data-sidebar=sidebar]]:shadow-amber-900/10"
      )}
    >
      <SidebarHeader className="p-3 flex items-center gap-2">
        <div className="w-9 h-9 rounded-2xl bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_50%,#754319_115%)] flex items-center justify-center shadow-sm shadow-amber-900/20">
          <Sparkles className="text-white w-5 h-5" />
        </div>
        <div className="min-w-0 group-data-[collapsible=icon]:hidden">
          <div className="font-semibold tracking-tight text-slate-900">NibTera merchants</div>
          <div className="text-[10px] text-slate-600">Admin console</div>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 px-4 group-data-[collapsible=icon]:hidden">Core Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="px-2">
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === item.href}
                    tooltip={item.name}
                    className={cn(
                      "rounded-2xl",
                      "hover:bg-white/45 hover:text-slate-900",
                      "data-[active=true]:bg-amber-200/55 data-[active=true]:text-[#754319]",
                      "data-[active=true]:shadow-sm data-[active=true]:shadow-amber-900/10"
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon className="w-5 h-5" />
                      <span>{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {merchantId && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="text-sidebar-foreground/50 px-4 group-data-[collapsible=icon]:hidden">Merchant Portal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2">
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === `/merchant/${merchantId}`}
                    tooltip="My Dashboard"
                    className={cn(
                      "rounded-2xl",
                      "hover:bg-white/45 hover:text-slate-900",
                      "data-[active=true]:bg-amber-200/55 data-[active=true]:text-[#754319]",
                      "data-[active=true]:shadow-sm data-[active=true]:shadow-amber-900/10"
                    )}
                  >
                    <Link href={`/merchant/${merchantId}`}>
                      <LayoutDashboard className="w-5 h-5" />
                      <span>My Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredAdminItems.length > 0 && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="text-sidebar-foreground/50 px-4 group-data-[collapsible=icon]:hidden">Governance</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2">
                {filteredAdminItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={pathname === item.href}
                      tooltip={item.name}
                      className={cn(
                        "rounded-2xl",
                        "hover:bg-white/45 hover:text-slate-900",
                        "data-[active=true]:bg-amber-200/55 data-[active=true]:text-[#754319]",
                        "data-[active=true]:shadow-sm data-[active=true]:shadow-amber-900/10"
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon className="w-5 h-5" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-4">
        {session?.user && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-2xl bg-white/35 border border-white/25 group-data-[collapsible=icon]:justify-center">
            <div className="w-8 h-8 rounded-2xl bg-[#f8b513]/15 flex items-center justify-center shrink-0">
              <UserIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold text-slate-900 truncate">{session.user.name || 'User'}</span>
              <span className="text-[10px] text-slate-600 truncate">{(session.user as any).role || 'Staff'}</span>
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="rounded-2xl text-red-700 hover:text-red-800 hover:bg-red-50/70"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut className="w-5 h-5" />
              <span>Log Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
