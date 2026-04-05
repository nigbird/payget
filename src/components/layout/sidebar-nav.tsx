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
import { useSession } from "next-auth/react"

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
      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="text-red-400 hover:text-red-300">
              <LogOut className="w-5 h-5" />
              <span>Log Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
