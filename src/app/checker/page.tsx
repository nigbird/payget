"use client"

import { useState } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Button } from "@/components/ui/button"
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
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { ShieldCheck, Eye, CheckCircle2, XCircle, AlertTriangle, Building2, User, Phone, MapPin, Link as LinkIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Mock pending registrations with new fields
const initialPending = [
  {
    id: "m2",
    name: "Bloom Florals",
    email: "contact@bloom.com",
    accountNumber: "9876543210",
    dailyLimit: 2000,
    transactionLimit: 500,
    category: "Florist",
    businessType: "Retail",
    contactName: "Alice Smith",
    contactPhone: "+1 555-010-2233",
    branchName: "Westside Hub",
    district: "Greenwood District",
    callbackUrl: "https://bloom.com/hooks/payments",
    riskFactors: ["Seasonal Demand Fluctuations"],
    createdAt: "2024-05-20T10:30:00Z"
  },
  {
    id: "m3",
    name: "Nitro Hosting",
    email: "admin@nitrohosting.io",
    accountNumber: "5556667778",
    dailyLimit: 25000,
    transactionLimit: 2500,
    category: "Web Services",
    businessType: "E-commerce",
    contactName: "Bob Johnson",
    contactPhone: "+1 555-010-4455",
    branchName: "Tech Park Office",
    district: "Digital District",
    callbackUrl: "https://nitrohosting.io/webhooks/pay",
    riskFactors: ["High chargeback risk domain"],
    createdAt: "2024-05-21T09:15:00Z"
  }
]

export default function CheckerPortal() {
  const { toast } = useToast()
  const [pending, setPending] = useState(initialPending)
  const [selectedMerchant, setSelectedMerchant] = useState<typeof initialPending[0] | null>(null)

  const handleAction = (id: string, action: 'approve' | 'reject') => {
    setPending(prev => prev.filter(m => m.id !== id))
    toast({
      title: action === 'approve' ? "Merchant Approved" : "Registration Rejected",
      description: `Merchant has been ${action}d successfully.`,
      variant: action === 'reject' ? 'destructive' : 'default'
    })
    setSelectedMerchant(null)
  }

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary w-5 h-5" />
            <h1 className="text-lg font-semibold font-headline">Merchant Approval (Checker)</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-muted/20">
          <div className="max-w-6xl mx-auto space-y-6">
            
            <Card className="border-none shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Pending Applications</CardTitle>
                    <CardDescription>Review new merchant applications submitted by Makers.</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-primary font-bold">
                    {pending.length} Pending Review
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company & Branch</TableHead>
                      <TableHead>Account No.</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Daily/Tx Limits</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{m.name}</span>
                            <span className="text-xs text-muted-foreground">{m.branchName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{m.accountNumber}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">{m.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">${m.dailyLimit.toLocaleString()} / ${m.transactionLimit.toLocaleString()}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{m.district}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setSelectedMerchant(m)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Building2 className="w-5 h-5 text-primary" />
                                  Application Review: {selectedMerchant?.name}
                                </DialogTitle>
                                <DialogDescription>
                                  Verify the registration details before activation.
                                </DialogDescription>
                              </DialogHeader>
                              
                              <div className="space-y-6 py-4">
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-4">
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground font-bold uppercase flex items-center gap-1">
                                        <User className="w-3 h-3" /> Contact Person
                                      </p>
                                      <p className="font-medium">{selectedMerchant?.contactName}</p>
                                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                                        <Phone className="w-3 h-3" /> {selectedMerchant?.contactPhone}
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground font-bold uppercase flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> Branch Details
                                      </p>
                                      <p className="font-medium">{selectedMerchant?.branchName}</p>
                                      <p className="text-sm text-muted-foreground">{selectedMerchant?.district}</p>
                                    </div>
                                  </div>
                                  <div className="space-y-4">
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground font-bold uppercase flex items-center gap-1">
                                        <LinkIcon className="w-3 h-3" /> Callback URL
                                      </p>
                                      <p className="text-xs font-mono text-primary truncate bg-primary/5 p-1 rounded">
                                        {selectedMerchant?.callbackUrl}
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground font-bold uppercase">Account Number</p>
                                      <p className="font-mono text-sm">{selectedMerchant?.accountNumber}</p>
                                    </div>
                                  </div>
                                </div>

                                <Separator />

                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground font-bold uppercase">Daily Limit</p>
                                    <p className="font-medium text-lg">${selectedMerchant?.dailyLimit.toLocaleString()}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground font-bold uppercase">Tx Limit</p>
                                    <p className="font-medium text-lg">${selectedMerchant?.transactionLimit.toLocaleString()}</p>
                                  </div>
                                </div>

                                {selectedMerchant?.riskFactors && selectedMerchant.riskFactors.length > 0 && (
                                  <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                                    <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-2">
                                      <AlertTriangle className="w-4 h-4" />
                                      AI Risk Assessment
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {selectedMerchant.riskFactors.map((risk, i) => (
                                        <Badge key={i} variant="secondary" className="bg-white/50 border-red-200 text-red-600">
                                          {risk}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <DialogFooter className="gap-2 sm:gap-0 border-t pt-4">
                                <Button 
                                  variant="outline" 
                                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => handleAction(selectedMerchant!.id, 'reject')}
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Reject
                                </Button>
                                <Button 
                                  className="bg-primary"
                                  onClick={() => handleAction(selectedMerchant!.id, 'approve')}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-2" />
                                  Approve & Activate
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pending.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No pending applications for review.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Checker Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Avg. Review Time</CardTitle>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">12.4 mins</div>
                  <p className="text-xs text-muted-foreground">+2% from last week</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500">92%</div>
                  <p className="text-xs text-muted-foreground">-1.5% from last week</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Flagged by AI</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-500">14</div>
                  <p className="text-xs text-muted-foreground">+3 since yesterday</p>
                </CardContent>
              </Card>
            </div>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
