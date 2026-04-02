"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { ChevronLeft, Clock, Wallet, ShieldCheck } from "lucide-react"
import { db, type Merchant, type Transaction } from "@/app/lib/db"
import { useIsMobile } from "@/hooks/use-mobile"

const nonTerminalStatuses: Transaction["status"][] = ["pending", "initiated", "awaiting_pin", "processing"]

export default function MerchantTransactionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isMobile = useIsMobile()

  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])

  const pendingCount = useMemo(
    () => transactions.filter((tx) => nonTerminalStatuses.includes(tx.status)).length,
    [transactions]
  )

  useEffect(() => {
    const m = db.getMerchantById(id)
    if (m) setMerchant(m)

    const refresh = () => {
      setTransactions(
        [...db.getTransactionsByMerchant(id)].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
      )
    }

    refresh()

    const interval = setInterval(() => {
      const live = db
        .getTransactionsByMerchant(id)
        .some((tx) => nonTerminalStatuses.includes(tx.status))
      if (live) refresh()
      else clearInterval(interval)
    }, 2500)

    return () => clearInterval(interval)
  }, [id])

  const totalReceived = transactions.reduce((acc, tx) => acc + (tx.status === "success" ? tx.amount : 0), 0)

  if (!merchant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/20 gap-4">
        <Clock className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Merchant Not Found</h2>
      </div>
    )
  }

  const badgeFor = (status: Transaction["status"]) => {
    if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700"
    if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700"
    return "border-amber-200 bg-amber-50 text-amber-700"
  }

  const statusLabel = (status: Transaction["status"]) => {
    if (status === "awaiting_pin") return "Awaiting PIN"
    if (status === "processing") return "Processing"
    if (status === "initiated") return "Initiated"
    if (status === "pending") return "Pending"
    return status
  }

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset className="bg-[linear-gradient(135deg,#fff9ef_0%,#fdf1d4_45%,#fbe8bc_100%)]">
        <main className="mx-auto w-full max-w-7xl p-4 md:p-8 pb-24">
          <section className="rounded-3xl border border-white/40 bg-white/65 p-5 md:p-7 shadow-xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Transactions</p>
                <h1 className="mt-2 text-2xl md:text-3xl font-bold text-[#5b371f]">
                  {merchant.name}
                </h1>
                <p className="mt-1 text-sm md:text-base text-[#754319]/70">
                  {pendingCount} active requests • {transactions.length} total
                </p>
              </div>
              <div className="hidden md:flex items-center gap-3">
                <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-2 shadow-sm flex items-center gap-3">
                  <Wallet className="h-4 w-4 text-[#754319]" />
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-[#754319]/70">Received</p>
                    <p className="font-black text-[#5b371f]">${totalReceived.toFixed(2)}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-2 shadow-sm flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-[#754319]" />
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-[#754319]/70">Status</p>
                    <p className="font-semibold text-[#5b371f]">{merchant.status}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button
                asChild
                variant="outline"
                className="rounded-2xl border-white/60 bg-white/70 text-[#754319] hover:bg-white/90"
              >
                <Link href={`/merchant/${merchant.id}`}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back to dashboard
                </Link>
              </Button>
              <div className="hidden md:flex items-center text-xs text-[#754319]/70">
                <Clock className="mr-2 h-4 w-4" />
                Polling updates in near real-time
              </div>
            </div>
          </section>

          <section className="mt-4 space-y-3">
            {transactions.length === 0 && (
              <Card className="rounded-3xl border-white/60 bg-white/70 shadow-md backdrop-blur-sm">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No transactions yet.
                </CardContent>
              </Card>
            )}

            {transactions.map((tx) => (
              <Card key={tx.id} className="rounded-3xl border-white/60 bg-white/70 shadow-md backdrop-blur-sm">
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#5b371f] truncate">
                        {tx.serviceDescription}
                      </p>
                      <p className="text-xs text-[#754319]/70 mt-1">
                        Customer: {tx.payerPhone || "Web checkout"} • Ref:{" "}
                        <span className="font-mono">{tx.transactionReference}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(tx.timestamp).toLocaleString()}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-black text-[#5b371f]">${tx.amount.toFixed(2)}</p>
                      <Badge
                        variant="outline"
                        className={`mt-2 text-[10px] capitalize rounded-full border ${badgeFor(tx.status)}`}
                      >
                        {statusLabel(tx.status)}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

