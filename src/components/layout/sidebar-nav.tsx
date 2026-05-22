"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  UserPlus, 
  ShieldCheck, 
  Activity,
  LogOut,
  Shield,
  Users,
  Settings,
  User as UserIcon,
  FileText,
  type LucideIcon,
} from "lucide-react"
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

const mainMenuItems = [
  { name: "Management Overview", href: "/admin", icon: Activity, permission: "DASHBOARD_VIEW" },
  { name: "Merchant Onboarding", href: "/admin/onboarding", icon: UserPlus, permission: "MERCHANT_REGISTER" },
  { name: "Review & Approvals", href: "/admin/review", icon: ShieldCheck, permission: "MERCHANT_APPROVE" },
  { name: "QR Generation", href: "/admin/merchants", icon: Settings, permission: "CONFIGURATION_MANAGE" },
]

const adminMenuItems = [
  { name: "Staff Management", href: "/admin/users", icon: Users, permission: "USER_CREATE" },
  { name: "Permission Governance", href: "/admin/roles", icon: Shield, permission: "ROLE_CREATE" },
  { name: "Audit Logs", href: "/admin/audit-logs", icon: FileText, permission: "AUDIT_LOG_VIEW" },
  { name: "Master Data Config", href: "/admin/configuration", icon: Settings, permission: "CONFIGURATION_MANAGE" },
]

type MenuItem = {
  name: string
  href: string
  icon: LucideIcon
}

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

  const renderSection = (items: MenuItem[]) =>
    items.map((item) => (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          asChild
          isActive={pathname === item.href}
          tooltip={item.name}
          className="sidebar-menu-item sidebar-proportional min-h-[46px] rounded-[14px] px-2.5 py-1.5 text-[13px] font-medium tracking-[0.01em] group-data-[collapsible=icon]:!h-12 group-data-[collapsible=icon]:!w-12 group-data-[collapsible=icon]:!justify-center group-data-[collapsible=icon]:!rounded-[14px] group-data-[collapsible=icon]:!p-0 [&>svg]:hidden"
        >
          <Link href={item.href} className="flex min-w-0 items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
            <span className="sidebar-hex-icon">
              <item.icon />
            </span>
            <span className="truncate text-[13px] text-current group-data-[collapsible=icon]:hidden">{item.name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ))

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className="sidebar-warm-shell"
    >
      <SidebarHeader className="sidebar-proportional px-3.5 py-4">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <div className="sidebar-logo-orb overflow-hidden">
            <img 
              src="/niblogo.png" 
              alt="NibTera Logo" 
              className="sidebar-logo-image"
            />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-[14px] font-semibold tracking-tight text-[#754319]">NibTera Merchants</div>
            <div className="text-[11px] text-[#754319]/60">Admin console</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarSeparator className="mx-4 bg-[#754319]/10" />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-[0.11em] text-[#754319]/52 group-data-[collapsible=icon]:hidden">Core Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 px-2">
              {renderSection(filteredMenuItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {merchantId && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-[0.11em] text-[#754319]/52 group-data-[collapsible=icon]:hidden">Merchant Portal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1 px-2">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === `/merchant/${merchantId}`}
                    tooltip="My Dashboard"
                    className="sidebar-menu-item sidebar-proportional min-h-[46px] rounded-[14px] px-2.5 py-1.5 text-[13px] font-medium tracking-[0.01em] group-data-[collapsible=icon]:!h-12 group-data-[collapsible=icon]:!w-12 group-data-[collapsible=icon]:!justify-center group-data-[collapsible=icon]:!rounded-[14px] group-data-[collapsible=icon]:!p-0 [&>svg]:hidden"
                  >
                    <Link href={`/merchant/${merchantId}`} className="flex min-w-0 items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
                      <span className="sidebar-hex-icon">
                        <LayoutDashboard />
                      </span>
                      <span className="truncate text-[13px] text-current group-data-[collapsible=icon]:hidden">My Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredAdminItems.length > 0 && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-[0.11em] text-[#754319]/52 group-data-[collapsible=icon]:hidden">Governance</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1 px-2">
                {renderSection(filteredAdminItems)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="space-y-4 p-4">
        {session?.user && (
          <div className="sidebar-profile-chip sidebar-proportional flex items-center gap-2.5 px-2.5 py-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div className="sidebar-hex-icon">
              <UserIcon className="text-[#4e2a12]" />
            </div>
            <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="truncate text-[13px] font-semibold text-[#754319]">{session.user.name || 'User'}</span>
              <span className="truncate text-[9px] uppercase tracking-[0.15em] text-[#754319]/55">{(session.user as any).role || 'Staff'}</span>
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="sidebar-menu-item sidebar-proportional min-h-[46px] rounded-[14px] px-2.5 py-1.5 text-[13px] font-medium text-[#754319] group-data-[collapsible=icon]:!h-12 group-data-[collapsible=icon]:!w-12 group-data-[collapsible=icon]:!justify-center group-data-[collapsible=icon]:!rounded-[14px] group-data-[collapsible=icon]:!p-0 [&>svg]:hidden"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <span className="sidebar-hex-icon">
                <LogOut />
              </span>
              <span className="group-data-[collapsible=icon]:hidden">Log Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
