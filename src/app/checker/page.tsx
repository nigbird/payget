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
  AlertTriangle, 
  Building2, 
  User, 
  Phone, 
  MapPin, 
  Link as LinkIcon,
  FileCheck,
  ExternalLink,
  MessageSquare
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { db, type Merchant } from "@/app/lib/db"

export default function CheckerPortal() {
  const { toast } = useToast()
  const [pending, setPending] = useState<Merchant[]>([])
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
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

    db.updateMerchantStatus(id, action === 'approve' ? 'approved' : 'rejected', action === 'reject' ? rejectionReason : undefined)
    setPending(prev => prev.filter(m => m.id !== id))
    toast({
      title: action === 'approve' ? "Merchant Approved" : "Registration Rejected",
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
                      <TableHead>Category</TableHead>
                      <TableHead>Limits</TableHead>
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
                          <span className="text-sm">${m.dailyLimit.toLocaleString()} / ${m.transactionLimit.toLocaleString()}</span>
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
                                  Application Review: {selectedMerchant?.name}
                                </DialogTitle>
                                <DialogDescription>
                                  Verify registration details and compliance documents before activation.
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
                                        <MapPin className="w-3 h-3" /> Branch & Location
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
                                      <p className="text-xs text-muted-foreground font-bold uppercase">Limits</p>
                                      <p className="text-sm font-medium">Daily: ${selectedMerchant?.dailyLimit.toLocaleString()}</p>
                                      <p className="text-sm font-medium">Tx: ${selectedMerchant?.transactionLimit.toLocaleString()}</p>
                                    </div>
                                  </div>
                                </div>

                                <Separator />

                                <div className="space-y-3">
                                  <p className="text-xs text-muted-foreground font-bold uppercase">Uploaded Documents</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {selectedMerchant?.documents.map((doc) => (
                                      <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                          <FileCheck className="w-4 h-4 text-primary shrink-0" />
                                          <div className="overflow-hidden">
                                            <p className="text-xs font-medium truncate">{doc.name}</p>
                                            <p className="text-[10px] text-muted-foreground">{(doc.size / 1024).toFixed(1)} KB</p>
                                          </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-7 w-7">
                                          <ExternalLink className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ))}
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

                                {isRejecting && (
                                  <div className="space-y-2 p-4 bg-muted rounded-lg border animate-in slide-in-from-top-2">
                                    <Label htmlFor="reason" className="flex items-center gap-2 text-destructive">
                                      <MessageSquare className="w-4 h-4" />
                                      Reason for Rejection
                                    </Label>
                                    <Textarea 
                                      id="reason" 
                                      placeholder="e.g. Invalid Trade License, KYC details mismatch..." 
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
                                    Approve & Activate
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
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No pending applications for review.
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
