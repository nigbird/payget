"use client"

import { use, type ReactNode } from "react"
import MerchantPortalShell from "@/components/merchant/merchant-portal-shell"

export default function MerchantLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <MerchantPortalShell merchantId={id}>
      {children}
    </MerchantPortalShell>
  )
}

