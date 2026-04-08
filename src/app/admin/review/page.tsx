"use client"

import { useState, useEffect, use } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
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
  Hash,
  Clock,
  ArrowRight,
  Filter,
  CheckCircle,
  AlertCircle,
  Loader2,
  Plus
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { Merchant } from "@/app/lib/db"
import { useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

function MerchantReviewContent() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const merchantIdParam = searchParams.get('merchantId')
  
  const [pending, setPending] = useState<Merchant[]>([])
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  
  const [limits, setLimits] = useState({
    dailyLimit: "10000",
    transactionLimit: "1000",
    dailyCountLimit: "100"
  })
  
  const [rejectionReason, setRejectionReason] = useState("")
  const [isRejecting, setIsRejecting] = useState(false)

  const userPermissions = (session?.user as any)?.permissions || []
  const canSetLimits = userPermissions.includes('TRANSACTION_LIMIT_SET') || userPermissions.includes('TRANSACTION_LIMIT_OVERRIDE')
  const canApprove = userPermissions.includes('MERCHANT_APPROVE')

  useEffect(() => {
    fetchMerchants()
  }, [])

  useEffect(() => {
    if (merchantIdParam && pending.length > 0) {
      const m = pending.find(p => p.id === merchantIdParam)
      if (m) {
        setSelectedMerchant(m)
        setIsDetailsOpen(true)
      }
    }
  }, [merchantIdParam, pending])

  const fetchMerchants = async () => {
    try {
      const response = await fetch('/api/merchants')
      if (response.ok) {
        const merchants = await response.json()
        // Centralized queue: show anything not fully approved or rejected
        setPending(merchants.filter((m: Merchant) => m.status === 'pending' || m.status === 'branch_approved'))
      }
    } catch (error) {
      console.error('Failed to fetch merchants:', error)
    }
  }

  const handleAction = async (id: string, action: 'initial_approve' | 'final_approve' | 'reject') => {
    if (action === 'reject' && !rejectionReason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please provide a reason for rejection."
      })
      return
    }

    try {
      let body: any = {}
      
      if (action === 'initial_approve') {
        body = {
          dailyLimit: Number(limits.dailyLimit),
          transactionLimit: Number(limits.transactionLimit),
          dailyCountLimit: Number(limits.dailyCountLimit),
          status: 'branch_approved'
        }
      } else if (action === 'final_approve') {
        body = { status: 'approved' }
      } else {
        body = { status: 'rejected', rejectionReason }
      }

      const response = await fetch(`/api/merchants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (response.ok) {
        toast({
          title: "Action Successful",
          description: `Merchant status updated successfully.`
        })
        setSelectedMerchant(null)
        setIsDetailsOpen(false)
        setRejectionReason("")
        setIsRejecting(false)
        fetchMerchants()
      } else {
        const err = await response.json()
        throw new Error(err.error || 'Failed to update status')
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message
      })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>
      case 'active': return <Badge className="bg-emerald-500 gap-1"><CheckCircle2 className="w-3 h-3" /> Active</Badge>
      case 'branch_approved': return <Badge className="bg-blue-500 gap-1"><ShieldCheck className="w-3 h-3" /> Initial Review OK</Badge>
      case 'pending': return <Badge variant="outline" className="text-orange-500 border-orange-200 bg-orange-50 gap-1"><Clock className="w-3 h-3" /> New Submission</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-white/50 bg-white/70 backdrop-blur-md px-4 sticky top-0 z-50">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-[#754319] w-5 h-5" />
            <h1 className="text-lg font-bold text-[#5b371f] font-headline tracking-tight">Review & Approvals</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-slate-50/50">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Centralized Review Queue</h2>
                <p className="text-muted-foreground">Approve new registrations, adjust limits, and perform final audits.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="bg-white gap-2">
                  <Filter className="w-4 h-4" /> Filter Queue
                </Button>
              </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white hover:bg-white">
                      <TableHead className="pl-6">Merchant</TableHead>
                      <TableHead>Review Stage</TableHead>
                      <TableHead>Submitted By</TableHead>
                      <TableHead>Days in Queue</TableHead>
                      <TableHead className="text-right pr-6">Review</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((m) => (
                      <TableRow key={m.id} className="bg-white group hover:bg-slate-50 transition-colors">
                        <TableCell className="pl-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{m.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{m.id}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(m.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-xs">
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">
                              {m.contactName.charAt(0)}
                            </div>
                            <span>{m.contactName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {Math.floor((new Date().getTime() - new Date(m.createdAt).getTime()) / (1000 * 3600 * 24))} days
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-2"
                            onClick={() => {
                              setSelectedMerchant(m)
                              setIsDetailsOpen(true)
                            }}
                          >
                            Open Review <ArrowRight className="w-3 h-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {pending.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                          No pending actions in the review queue.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Unified Review Modal */}
          <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Building2 className="w-6 h-6 text-primary" />
                  Review Application: {selectedMerchant?.name}
                </DialogTitle>
                <DialogDescription>
                  Perform compliance checks and authorize merchant onboarding.
                </DialogDescription>
              </DialogHeader>

              {selectedMerchant && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-6">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Merchant ID</Label>
                        <p className="text-sm font-mono font-bold">{selectedMerchant.id}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Registered Email</Label>
                        <p className="text-sm font-medium">{selectedMerchant.email}</p>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-primary" /> Business Profile
                      </h4>
                      <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {selectedMerchant.businessDescription}
                      </p>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="flex justify-between p-2 border-b">
                          <span className="text-muted-foreground">Category:</span>
                          <span className="font-medium">{selectedMerchant.category}</span>
                        </div>
                        <div className="flex justify-between p-2 border-b">
                          <span className="text-muted-foreground">Type:</span>
                          <span className="font-medium">{selectedMerchant.businessType}</span>
                        </div>
                        <div className="flex justify-between p-2 border-b">
                          <span className="text-muted-foreground">Account #:</span>
                          <span className="font-medium">{selectedMerchant.accountNumber}</span>
                        </div>
                        <div className="flex justify-between p-2 border-b">
                          <span className="text-muted-foreground">Hub:</span>
                          <span className="font-medium">{selectedMerchant.branchName}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-bold">Uploaded Documents</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedMerchant.documents?.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between p-2 rounded bg-white border text-[10px] group hover:border-primary transition-colors">
                            <div className="flex items-center gap-2 truncate">
                              <FileCheck className="w-3 h-3 text-green-500" />
                              <span className="truncate">{doc.name}</span>
                            </div>
                            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100">
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Action Panel */}
                    <Card className="border-primary/10 bg-primary/5 shadow-none">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Compliance Actions</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {selectedMerchant.status === 'pending' && (
                          <div className="space-y-4">
                            <div className="space-y-3">
                              <Label className="text-xs font-bold uppercase text-primary flex items-center gap-2">
                                <TrendingUp className="w-3 h-3" /> Assign Limits
                              </Label>
                              <div className="space-y-2">
                                <div className="grid gap-1">
                                  <Label htmlFor="dailyLimit" className="text-[10px]">Daily Volume (ETB)</Label>
                                  <Input 
                                    id="dailyLimit" 
                                    className="h-8 text-sm" 
                                    value={limits.dailyLimit}
                                    onChange={(e) => setLimits({...limits, dailyLimit: e.target.value})}
                                    disabled={!canSetLimits}
                                  />
                                </div>
                                <div className="grid gap-1">
                                  <Label htmlFor="transactionLimit" className="text-[10px]">Per Tx Limit (ETB)</Label>
                                  <Input 
                                    id="transactionLimit" 
                                    className="h-8 text-sm" 
                                    value={limits.transactionLimit}
                                    onChange={(e) => setLimits({...limits, transactionLimit: e.target.value})}
                                    disabled={!canSetLimits}
                                  />
                                </div>
                              </div>
                            </div>
                            
                            <Button 
                              className="w-full bg-blue-600 hover:bg-blue-700" 
                              onClick={() => handleAction(selectedMerchant.id, 'initial_approve')}
                              disabled={!canSetLimits}
                            >
                              Confirm & Set Limits
                            </Button>
                          </div>
                        )}

                        {selectedMerchant.status === 'branch_approved' && (
                          <div className="space-y-4">
                            <div className="p-3 bg-blue-100/50 border border-blue-200 rounded-lg">
                              <p className="text-[10px] text-blue-800 font-medium leading-relaxed">
                                Initial review complete. Ready for final system activation.
                              </p>
                            </div>
                            <Button 
                              className="w-full bg-green-600 hover:bg-green-700" 
                              onClick={() => handleAction(selectedMerchant.id, 'final_approve')}
                              disabled={!canApprove}
                            >
                              Finalize Activation
                            </Button>
                          </div>
                        )}

                        <Separator />

                        {!isRejecting ? (
                          <Button 
                            variant="ghost" 
                            className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setIsRejecting(true)}
                          >
                            Reject Application
                          </Button>
                        ) : (
                          <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <Label className="text-xs font-bold text-red-800">Reason for Rejection</Label>
                            <Textarea 
                              className="min-h-[80px] text-xs" 
                              placeholder="Explain why this request is being denied..."
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button variant="outline" className="flex-1 text-xs h-8" onClick={() => setIsRejecting(false)}>Cancel</Button>
                              <Button variant="destructive" className="flex-1 text-xs h-8" onClick={() => handleAction(selectedMerchant.id, 'reject')}>Confirm Reject</Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Audit Visibility */}
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">Action History</Label>
                      <div className="space-y-2">
                        <div className="flex gap-3 text-[10px]">
                          <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                            <Plus className="w-2 h-2" />
                          </div>
                          <div>
                            <p className="font-bold">Application Submitted</p>
                            <p className="text-muted-foreground">{new Date(selectedMerchant.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        {selectedMerchant.status === 'branch_approved' && (
                          <div className="flex gap-3 text-[10px]">
                            <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                              <CheckCircle className="w-2 h-2 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-bold text-blue-800">Initial Review Passed</p>
                              <p className="text-muted-foreground">Limits assigned and verified.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function MerchantReviewPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <MerchantReviewContent />
    </Suspense>
  )
}
