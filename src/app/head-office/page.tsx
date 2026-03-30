"use client"

import { useState, useEffect } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
import { 
  ShieldCheck, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  Building2, 
  User, 
  MapPin, 
  FileCheck,
  TrendingUp,
  Hash,
  MessageSquare,
  BadgeCheck
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { db, type Merchant } from "@/app/lib/db"

export default function HeadOfficePortal() {
  const { toast } = useToast()
  const [pending, setPending] = useState<Merchant[]>([])
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [isRejecting, setIsRejecting] = useState(false)

  useEffect(() => {
    setPending(db.getMerchants().filter(m => m.status === 'branch_approved'))
  }, [])

  const handleAction = (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !rejectionReason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please provide a reason for rejecting this HO application."
      })
      return
    }

    db.updateMerchantStatus(id, action === 'approve' ? 'approved' : 'rejected', action === 'reject' ? rejectionReason : undefined)
    setPending(prev => prev.filter(m => m.id !== id))
    toast({
      title: action === 'approve' ? "Merchant Activated" : "HO Rejected",
      description: `Merchant account has been ${action}d.`,
      variant: action === 'reject' ? 'destructive' : 'default'
    })
    setSelectedMerchant(null)
    setRejectionReason("")
    setIsRejecting(false)
  }

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <BadgeCheck className="text-primary w-5 h-5" />
            <h1 className="text-lg font-semibold font-headline">Head Office Approval</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-muted/20">
          <div className="max-w-6xl mx-auto space-y-6">
            
            <Card className="border-none shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Final Activation Queue</CardTitle>
                    <CardDescription>Final verification of merchants approved by regional branches.</CardDescription>
                  </div>
                  <Badge className="bg-primary">
                    {pending.length} Awaiting Activation
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Daily Limit</TableHead>
                      <TableHead>Tx Limit</TableHead>
                      <TableHead>Tx Count</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell className="text-xs">{m.branchName}</TableCell>
                        <TableCell className="font-semibold">${m.dailyLimit.toLocaleString()}</TableCell>
                        <TableCell className="font-semibold">${m.transactionLimit.toLocaleString()}</TableCell>
                        <TableCell className="font-semibold">{m.dailyCountLimit}</TableCell>
                        <TableCell className="text-right">
                          <Dialog onOpenChange={(open) => { if(!open) { setIsRejecting(false); setRejectionReason(""); } }}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setSelectedMerchant(m)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <ShieldCheck className="w-5 h-5 text-primary" />
                                  HO Final Approval: {selectedMerchant?.name}
                                </DialogTitle>
                                <DialogDescription>
                                  Verify branch-assigned limits and company profile.
                                </DialogDescription>
                              </DialogHeader>
                              
                              <div className="space-y-6 py-4">
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-4">
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground font-bold uppercase flex items-center gap-1">
                                        <User className="w-3 h-3" /> Representative
                                      </p>
                                      <p className="font-medium">{selectedMerchant?.contactName}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground font-bold uppercase flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> Branch Authority
                                      </p>
                                      <p className="font-medium">{selectedMerchant?.branchName}</p>
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-4">
                                    <div className="p-3 bg-muted rounded-lg border">
                                      <p className="text-[10px] text-muted-foreground font-bold uppercase mb-2">Limits Assigned by Branch</p>
                                      <div className="space-y-1 text-sm">
                                        <div className="flex justify-between">
                                          <span>Daily Amount:</span>
                                          <span className="font-bold">${selectedMerchant?.dailyLimit.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Per Tx Amount:</span>
                                          <span className="font-bold">${selectedMerchant?.transactionLimit.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Daily Count:</span>
                                          <span className="font-bold">{selectedMerchant?.dailyCountLimit}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <Separator />

                                <div className="space-y-3">
                                  <p className="text-xs text-muted-foreground font-bold uppercase">Compliance Check</p>
                                  <div className="flex flex-wrap gap-2">
                                    {selectedMerchant?.documents.map((doc) => (
                                      <Badge key={doc.id} variant="outline" className="gap-2 p-2">
                                        <FileCheck className="w-3 h-3 text-primary" />
                                        {doc.name}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>

                                {isRejecting && (
                                  <div className="space-y-2 p-4 bg-muted rounded-lg border animate-in slide-in-from-top-2">
                                    <Label htmlFor="ho-reason" className="flex items-center gap-2 text-destructive">
                                      <MessageSquare className="w-4 h-4" />
                                      Head Office Rejection Reason
                                    </Label>
                                    <Textarea 
                                      id="ho-reason" 
                                      placeholder="State why activation is being denied..." 
                                      value={rejectionReason}
                                      onChange={(e) => setRejectionReason(e.target.value)}
                                      className="bg-white"
                                    />
                                    <div className="flex justify-end gap-2">
                                      <Button variant="ghost" size="sm" onClick={() => setIsRejecting(false)}>Cancel</Button>
                                      <Button variant="destructive" size="sm" onClick={() => handleAction(selectedMerchant!.id, 'reject')}>Confirm Final Rejection</Button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {!isRejecting && (
                                <DialogFooter className="gap-2 sm:gap-0 border-t pt-4">
                                  <Button 
                                    variant="outline" 
                                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => setIsRejecting(true)}
                                  >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Reject to Maker
                                  </Button>
                                  <Button 
                                    className="bg-primary"
                                    onClick={() => handleAction(selectedMerchant!.id, 'approve')}
                                  >
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    Final Approval & Activate
                                  </Button>
                                </DialogFooter>
                              )}
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pending.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground italic">
                          No merchants awaiting Head Office activation.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
