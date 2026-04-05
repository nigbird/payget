"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  UserPlus, 
  ShieldCheck, 
  Settings, 
  CreditCard, 
  History,
  Activity,
  LogOut,
  BadgeCheck,
  Shield,
  Users,
  Building2
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
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="p-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <CreditCard className="text-primary-foreground w-5 h-5" />
        </div>
        <span className="font-bold text-xl tracking-tight text-white group-data-[collapsible=icon]:hidden">Finflow</span>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-white/40 px-4 group-data-[collapsible=icon]:hidden">Core Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="px-2">
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === item.href}
                    tooltip={item.name}
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
            <SidebarGroupLabel className="text-white/40 px-4 group-data-[collapsible=icon]:hidden">Merchant Portal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2">
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === `/merchant/${merchantId}`}
                    tooltip="My Dashboard"
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
            <SidebarGroupLabel className="text-white/40 px-4 group-data-[collapsible=icon]:hidden">Governance</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2">
                {filteredAdminItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={pathname === item.href}
                      tooltip={item.name}
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
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/5 border border-white/10 group-data-[collapsible=icon]:justify-center">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <UserIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold text-white truncate">{session.user.name || 'User'}</span>
              <span className="text-[10px] text-white/50 truncate">{(session.user as any).role || 'Staff'}</span>
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="text-red-400 hover:text-red-300"
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
