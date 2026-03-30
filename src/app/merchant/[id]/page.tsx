"use client"

import { use, useEffect, useState } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { 
  LayoutDashboard, 
  ArrowUpRight, 
  Wallet, 
  CreditCard,
  History,
  TrendingUp,
  CircleDollarSign,
  AlertCircle,
  Clock
} from "lucide-react"
import { db, type Merchant, type Transaction } from "@/app/lib/db"

export default function MerchantDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    const m = db.getMerchantById(id)
    if (m) {
      setMerchant(m)
      setTransactions(db.getTransactionsByMerchant(id))
    }
  }, [id])

  if (!merchant) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-muted/20 gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Merchant Not Found</h2>
        <p className="text-muted-foreground">The requested merchant account does not exist.</p>
      </div>
    )
  }

  const isPending = merchant.status === 'pending'
  const isRejected = merchant.status === 'rejected'
  const isApproved = merchant.status === 'approved'

  const totalVolume = transactions.reduce((acc, tx) => acc + (tx.status === 'success' ? tx.amount : 0), 0)

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <LayoutDashboard className="text-primary w-5 h-5" />
            <h1 className="text-lg font-semibold font-headline">Merchant Insights: {merchant.name}</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-muted/20">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Status Alert for Unapproved Merchants */}
            {!isApproved && (
              <Card className={`border-none ${isPending ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    {isPending ? <Clock className="w-6 h-6 text-orange-500 mt-1" /> : <AlertCircle className="w-6 h-6 text-red-500 mt-1" />}
                    <div>
                      <h3 className={`font-bold text-lg ${isPending ? 'text-orange-800' : 'text-red-800'}`}>
                        Account Status: {merchant.status.toUpperCase()}
                      </h3>
                      <p className={`text-sm ${isPending ? 'text-orange-700' : 'text-red-700'}`}>
                        {isPending 
                          ? "Your application is currently being reviewed by our compliance team. Some dashboard features may be restricted until activation."
                          : `Your application was rejected. Reason: ${merchant.rejectionReason || "No specific reason provided."}`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Merchant Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Settled Balance</CardTitle>
                  <Wallet className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${(totalVolume * 0.98).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <p className="text-xs text-muted-foreground">Net of 2% gateway fee</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Volume (Life)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-accent-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <p className="text-xs text-muted-foreground">{transactions.filter(t => t.status === 'success').length} successful transactions</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Daily Limit</CardTitle>
                  <CircleDollarSign className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${merchant.dailyLimit.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">Max daily processing capacity</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Account Status</CardTitle>
                  <Badge className={isApproved ? 'bg-green-500' : isPending ? 'bg-orange-500' : 'bg-destructive'}>
                    {merchant.status}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{isApproved ? 'Verified' : 'Unverified'}</div>
                  <p className="text-xs text-muted-foreground">Business Type: {merchant.businessType}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Recent Transactions</CardTitle>
                  <CardDescription>Real-time log of your payments across all channels.</CardDescription>
                </div>
                <History className="text-muted-foreground w-5 h-5" />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-xs text-primary font-medium">{tx.id}</TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell className="font-semibold">${tx.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={tx.status === 'success' ? 'default' : 'destructive'} className={tx.status === 'success' ? 'bg-green-500' : ''}>
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(tx.timestamp).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {transactions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground italic">
                          No transactions found for this account.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Quick API Docs Preview */}
            <Card className="border-none shadow-sm bg-primary/5 border border-primary/10">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  Integration Guide
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 bg-white rounded-lg border border-primary/10 space-y-2">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Merchant ID</p>
                    <code className="text-sm text-primary block truncate">{merchant.id}</code>
                  </div>
                  <div className="p-4 bg-white rounded-lg border border-primary/10 space-y-2">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Callback Endpoint</p>
                    <code className="text-sm text-primary block truncate">{merchant.callbackUrl}</code>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
