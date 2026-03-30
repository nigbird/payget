"use client"

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
  ArrowDownLeft, 
  Wallet, 
  CreditCard,
  History,
  TrendingUp,
  CircleDollarSign
} from "lucide-react"

// Mock merchant transactions
const transactions = [
  { id: "tx_101", amount: 250.50, status: "success", date: "2024-05-22T14:20:00Z", method: "Card", ref: "ORD-9901" },
  { id: "tx_102", amount: 1200.00, status: "success", date: "2024-05-22T11:45:00Z", method: "Bank Transfer", ref: "ORD-9902" },
  { id: "tx_103", amount: 45.00, status: "failed", date: "2024-05-21T18:10:00Z", method: "Card", ref: "ORD-9903" },
  { id: "tx_104", amount: 890.75, status: "success", date: "2024-05-21T09:30:00Z", method: "Card", ref: "ORD-9904" },
  { id: "tx_105", amount: 300.00, status: "success", date: "2024-05-20T16:55:00Z", method: "Card", ref: "ORD-9905" },
]

export default function MerchantDashboard({ params }: { params: { id: string } }) {
  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <LayoutDashboard className="text-primary w-5 h-5" />
            <h1 className="text-lg font-semibold font-headline">Merchant Insights</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-muted/20">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Merchant Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Settled Balance</CardTitle>
                  <Wallet className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">$14,240.50</div>
                  <p className="text-xs text-muted-foreground">+12% this month</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Volume (24h)</CardTitle>
                  <TrendingUp className="h-4 w-4 text-accent-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">$2,686.25</div>
                  <p className="text-xs text-muted-foreground">8 successful transactions</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tx Limit Used</CardTitle>
                  <CircleDollarSign className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">24%</div>
                  <p className="text-xs text-muted-foreground">$1,200 of $5,000</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</CardTitle>
                  <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Verified</div>
                  <p className="text-xs text-muted-foreground">Gateway Fully Operational</p>
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
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-xs text-primary font-medium">{tx.id}</TableCell>
                        <TableCell>{tx.ref}</TableCell>
                        <TableCell className="font-semibold">${tx.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={tx.status === 'success' ? 'default' : 'destructive'} className={tx.status === 'success' ? 'bg-green-500' : ''}>
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{tx.method}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(tx.date).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
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
                    <p className="text-xs font-bold uppercase text-muted-foreground">Payment Endpoint</p>
                    <code className="text-sm text-primary block truncate">POST /api/pay/initiate</code>
                  </div>
                  <div className="p-4 bg-white rounded-lg border border-primary/10 space-y-2">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Auth Token</p>
                    <code className="text-sm text-primary block truncate">Bearer live_sk_f672...88a1</code>
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