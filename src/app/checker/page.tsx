"use client"

import { useState, useEffect } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
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
  AlertTriangle, 
  Building2, 
  User, 
  Phone, 
  MapPin, 
  Link as LinkIcon,
  FileCheck,
  ExternalLink,
  MessageSquare,
  TrendingUp,
  Hash
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { db, type Merchant } from "@/app/lib/db"

export default function BranchApprovalPortal() {
  const { toast } = useToast()
  const [pending, setPending] = useState<Merchant[]>([])
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  
  const [limits, setLimits] = useState({
    dailyLimit: "10000",
    transactionLimit: "1000",
    dailyCountLimit: "100"
  })
  
  const [rejectionReason, setRejectionReason] = useState("")
  const [isRejecting, setIsRejecting] = useState(false)

  useEffect(() => {
    setPending(db.getMerchants().filter(m => m.status === 'pending'))
  }, [])

  const handleAction = (id: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !rejectionReason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please provide a reason for rejecting this application."
      })
      return
    }

    if (action === 'approve') {
      db.updateMerchant(id, {
        dailyLimit: Number(limits.dailyLimit),
        transactionLimit: Number(limits.transactionLimit),
        dailyCountLimit: Number(limits.dailyCountLimit),
        status: 'branch_approved'
      })
      toast({
        title: "Branch Approved",
        description: "Application moved to Head Office for final review.",
      })
    } else {
      db.updateMerchantStatus(id, 'rejected', rejectionReason)
      toast({
        title: "Registration Rejected",
        description: `Merchant account has been rejected.`,
        variant: 'destructive'
      })
    }

    setPending(prev => prev.filter(m => m.id !== id))
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
            <ShieldCheck className="text-primary w-5 h-5" />
            <h1 className="text-lg font-semibold font-headline">Branch Approval</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-muted/20">
          <div className="max-w-6xl mx-auto space-y-6">
            
            <Card className="border-none shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Initial Reviews</CardTitle>
                    <CardDescription>Review new applications and set transaction constraints for HO approval.</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-primary font-bold">
                    {pending.length} Pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company & Branch</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Documents</TableHead>
                      <TableHead>District</TableHead>
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
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">{m.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            <FileCheck className="w-3 h-3" />
                            {m.documents.length} Files
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{m.district}</span>
                        </TableCell>
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
                                  <Building2 className="w-5 h-5 text-primary" />
                                  Branch Review: {selectedMerchant?.name}
                                </DialogTitle>
                                <DialogDescription>
                                  Set limits and verify identity before forwarding to Head Office.
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
                                        <MapPin className="w-3 h-3" /> Location
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
                                  </div>
                                </div>

                                <Separator />

                                {/* LIMIT SETTING SECTION */}
                                <div className="space-y-4 bg-primary/5 p-4 rounded-lg border border-primary/10">
                                  <h4 className="text-sm font-bold flex items-center gap-2 text-primary">
                                    <TrendingUp className="w-4 h-4" /> Set Transaction Limits
                                  </h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                      <Label htmlFor="dailyLimit">Daily Amount ($)</Label>
                                      <Input 
                                        id="dailyLimit" 
                                        type="number" 
                                        value={limits.dailyLimit}
                                        onChange={(e) => setLimits({...limits, dailyLimit: e.target.value})}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="txLimit">Max Tx Amount ($)</Label>
                                      <Input 
                                        id="txLimit" 
                                        type="number" 
                                        value={limits.transactionLimit}
                                        onChange={(e) => setLimits({...limits, transactionLimit: e.target.value})}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="countLimit">Daily Tx Count</Label>
                                      <Input 
                                        id="countLimit" 
                                        type="number" 
                                        value={limits.dailyCountLimit}
                                        onChange={(e) => setLimits({...limits, dailyCountLimit: e.target.value})}
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <p className="text-xs text-muted-foreground font-bold uppercase">Uploaded Documents</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {selectedMerchant?.documents.map((doc) => (
                                      <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                          <FileCheck className="w-4 h-4 text-primary shrink-0" />
                                          <div className="overflow-hidden">
                                            <p className="text-xs font-medium truncate">{doc.name}</p>
                                          </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-7 w-7">
                                          <ExternalLink className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {isRejecting && (
                                  <div className="space-y-2 p-4 bg-muted rounded-lg border animate-in slide-in-from-top-2">
                                    <Label htmlFor="reason" className="flex items-center gap-2 text-destructive">
                                      <MessageSquare className="w-4 h-4" />
                                      Reason for Rejection
                                    </Label>
                                    <Textarea 
                                      id="reason" 
                                      placeholder="Provide detailed feedback..." 
                                      value={rejectionReason}
                                      onChange={(e) => setRejectionReason(e.target.value)}
                                      className="bg-white"
                                    />
                                    <div className="flex justify-end gap-2">
                                      <Button variant="ghost" size="sm" onClick={() => setIsRejecting(false)}>Cancel</Button>
                                      <Button variant="destructive" size="sm" onClick={() => handleAction(selectedMerchant!.id, 'reject')}>Confirm Rejection</Button>
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
                                    Reject
                                  </Button>
                                  <Button 
                                    className="bg-primary"
                                    onClick={() => handleAction(selectedMerchant!.id, 'approve')}
                                  >
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    Set Limits & Forward
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
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          No pending branch reviews.
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
