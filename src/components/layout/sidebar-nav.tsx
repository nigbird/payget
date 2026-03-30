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
  LogOut
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
  SidebarSeparator
} from "@/components/ui/sidebar"

const menuItems = [
  { name: "Admin Oversight", href: "/admin", icon: Activity, role: "admin" },
  { name: "Maker Portal", href: "/maker", icon: UserPlus, role: "maker" },
  { name: "Checker Portal", href: "/checker", icon: ShieldCheck, role: "checker" },
  { name: "Merchant Dashboard", href: "/merchant/m1", icon: LayoutDashboard, role: "merchant" },
  { name: "Transaction History", href: "/history", icon: History, role: "merchant" },
]

export function SidebarNav() {
  const pathname = usePathname()

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
        <SidebarMenu className="px-2 py-4">
          {menuItems.map((item) => (
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