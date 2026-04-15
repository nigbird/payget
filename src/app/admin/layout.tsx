"use client"

import type { ReactNode } from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { AdminTopbar } from "@/components/admin/admin-topbar"

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <SidebarNav />
      <SidebarInset className="min-h-svh bg-[#fffdf9]">
        <AdminTopbar />
        <div className="flex-1 overflow-auto bg-[#fffdf9] px-6 pb-10 pt-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

