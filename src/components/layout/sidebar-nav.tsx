"use client"

import Link from "next/link"
import Image from "next/image"
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
} from "lucide-react"
import logo from "../../app/admin/logo/niblogo.png"
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
      className="sidebar-dark-glass"
    >
      <SidebarHeader className="p-4 flex items-center gap-2">
        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-black/20 overflow-hidden">
          <Image 
            src={logo} 
            alt="NibTera Logo" 
            width={40} 
            height={40} 
            className="object-cover w-full h-full"
          />
        </div>
        <div className="min-w-0 group-data-[collapsible=icon]:hidden">
          <div className="font-bold tracking-tight text-[#F8E8C8]">NibTera Merchants</div>
          <div className="text-[10px] text-amber-200/60">Admin console</div>
        </div>
      </SidebarHeader>
      <SidebarSeparator className="bg-amber-700/20" />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-amber-200/40 px-4 group-data-[collapsible=icon]:hidden">Core Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="px-2">
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.name}
                    className="rounded-xl text-amber-100/70 hover:text-amber-100 hover:bg-amber-700/30 data-[active=true]:bg-gradient-to-r data-[active=true]:from-amber-500 data-[active=true]:to-amber-600 data-[active=true]:text-slate-900 data-[active=true]:shadow-lg data-[active=true]:shadow-amber-900/40"
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
            <SidebarGroupLabel className="text-amber-200/40 px-4 group-data-[collapsible=icon]:hidden">Merchant Portal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === `/merchant/${merchantId}`}
                    tooltip="My Dashboard"
                    className="rounded-xl text-amber-100/70 hover:text-amber-100 hover:bg-amber-700/30 data-[active=true]:bg-gradient-to-r data-[active=true]:from-amber-500 data-[active=true]:to-amber-600 data-[active=true]:text-slate-900 data-[active=true]:shadow-lg data-[active=true]:shadow-amber-900/40"
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
            <SidebarGroupLabel className="text-amber-200/40 px-4 group-data-[collapsible=icon]:hidden">Governance</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-2">
                {filteredAdminItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      tooltip={item.name}
                      className="rounded-xl text-amber-100/70 hover:text-amber-100 hover:bg-amber-700/30 data-[active=true]:bg-gradient-to-r data-[active=true]:from-amber-500 data-[active=true]:to-amber-600 data-[active=true]:text-slate-900 data-[active=true]:shadow-lg data-[active=true]:shadow-amber-900/40"
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
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-amber-900/30 border border-amber-700/30 group-data-[collapsible=icon]:justify-center">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0 shadow-sm shadow-amber-900/40">
              <UserIcon className="w-4 h-4 text-slate-900" />
            </div>
            <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold text-amber-50 truncate">{session.user.name || 'User'}</span>
              <span className="text-[10px] text-amber-300/60 truncate">{(session.user as any).role || 'Staff'}</span>
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="rounded-xl text-rose-300 hover:text-rose-200 hover:bg-rose-900/30"
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
