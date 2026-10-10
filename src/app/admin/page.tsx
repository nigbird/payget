"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { Building2, ChevronRight, ShieldCheck, UserPlus } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AdminAnalytics } from "@/components/admin/dashboard/admin-analytics"

export default function AdminDashboard() {
  const { user } = useAuth()

  const [merchants, setMerchants] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    fetch("/api/merchants").then(async (res) => {
      if (res.ok) setMerchants(await res.json())
    })
  }, [])

  const userPermissions = user?.permissions || []
  const canApprove = userPermissions.includes("MERCHANT_APPROVE")

  const filteredMerchants = useMemo(() => {
    let list = merchants
    
    // Visibility Constraint: Self-registered merchants (createdBy === null) 
    // should only appear here AFTER they are approved.
    list = list.filter((m) => {
      const isSelfRegistered = !m.createdBy;
      const isApproved = m.status === "approved" || m.status === "active";
      if (isSelfRegistered && !isApproved) return false;
      return true;
    });

    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((m) => {
      const name = String(m?.name ?? "").toLowerCase()
      const id = String(m?.id ?? "").toLowerCase()
      const email = String(m?.email ?? "").toLowerCase()
      return name.includes(q) || id.includes(q) || email.includes(q)
    })
  }, [merchants, searchQuery])

  return (
    <div className="space-y-6 bg-white">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="card-soft-cream group rounded-[20px] transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-[#1F2937]">
              <UserPlus className="h-5 w-5 text-[#754319]" />
              <CardTitle className="text-base tracking-tight">Merchant onboarding</CardTitle>
            </div>
            <CardDescription className="text-[#6B7280]">Register new merchants and manage submissions.</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/onboarding">
              <Button
                className="button-honey-solid w-full justify-between rounded-[18px] px-4"
              >
                Open onboarding portal
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="card-soft-cream group rounded-[20px] transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/10">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-[#1F2937]">
              <ShieldCheck className="h-5 w-5 text-[#754319]" />
              <CardTitle className="text-base tracking-tight">Review & approvals</CardTitle>
            </div>
            <CardDescription className="text-[#6B7280]">Compliance queue for audits and activation.</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/review">
              <Button
                className="button-honey-solid w-full justify-between rounded-[18px] px-4"
              >
                Open review queue
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <AdminAnalytics />

      <Card className="card-soft-cream rounded-[20px]">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base tracking-tight">Merchant registry</CardTitle>
            <CardDescription className="text-[#6B7280]">Search and inspect merchants across the gateway.</CardDescription>
          </div>
          <div className="w-full md:w-80">
            <Input
              placeholder="Search by name, id, email…"
              className="h-10 rounded-[18px] border-[#F1E7D0] bg-[#FFFDF7]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredMerchants.slice(0, 9).map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-[18px] border border-[#F1E7D0] bg-[#FFFDF7] p-4",
                  "shadow-sm shadow-black/5 transition-all duration-200",
                  "hover:-translate-y-0.5 hover:bg-amber-50/30"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">{m.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] uppercase text-slate-500">{m.id}</div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "rounded-full",
                      m.status === "approved" || m.status === "active"
                        ? "bg-blue-50 text-blue-700"
                        : m.status === "pending" || m.status === "branch_approved"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                    )}
                  >
                    {m.status}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    <span className="truncate">{m.branchName}</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-700">
                    {(m.dailyLimit ?? 0).toLocaleString()} ETB
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    Txns: <span className="font-mono text-slate-700">{m._count?.transactions ?? 0}</span>
                  </div>
                  {m.status === "approved" && canApprove ? (
                    <Button variant="outline" size="sm" className="h-8 rounded-[16px] border-[#F1E7D0] bg-white hover:bg-amber-50/40">
                      Resend setup
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {filteredMerchants.length === 0 ? (
              <div className="col-span-full rounded-[20px] border border-dashed border-[#F1E7D0] bg-[#FFFDF7] p-10 text-center text-sm text-slate-600">
                No merchants match your search.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
