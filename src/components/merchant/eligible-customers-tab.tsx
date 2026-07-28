"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Loader2,
  Upload,
  Download,
  Clock,
  CheckCircle2,
  ListChecks,
  Trash2,
  Plus,
  Search,
  Eye,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

type Props = { merchantId: string }

type Status = { approvedCount: number }

type PendingRow = { id: string; phone: string }
type PendingRequest = {
  id: string
  status: "DRAFT" | "PENDING"
  fileName: string | null
  totalRows: number
  createdAt: string
  rows: PendingRow[]
}

type ApprovedCustomer = { id: string; phone: string; approvedAt: string }

export function EligibleCustomersTab({ merchantId }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Status | null>(null)
  const [activeRequest, setActiveRequest] = useState<PendingRequest | null>(null)
  const [importing, setImporting] = useState(false)
  const [newPhone, setNewPhone] = useState("")
  const [addingRow, setAddingRow] = useState(false)
  const [removingRowId, setRemovingRowId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isApprovedOpen, setIsApprovedOpen] = useState(false)
  const [approvedSearch, setApprovedSearch] = useState("")
  const [approvedCustomers, setApprovedCustomers] = useState<ApprovedCustomer[]>([])
  const [approvedLoading, setApprovedLoading] = useState(false)
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set())
  const [submittingRemoval, setSubmittingRemoval] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, pendingRes] = await Promise.all([
        fetch(`/api/merchants/${merchantId}/payment-eligibility`),
        fetch(`/api/merchants/${merchantId}/payment-eligibility/pending`),
      ])
      if (statusRes.ok) setStatus(await statusRes.json())
      if (pendingRes.ok) {
        const data = await pendingRes.json()
        setActiveRequest(data.request ?? null)
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to load eligible customers status" })
    } finally {
      setLoading(false)
    }
  }, [merchantId, toast])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleImport = async (file: File) => {
    setImporting(true)
    const fd = new FormData()
    fd.append("file", file)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/payment-eligibility`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Import failed")
      toast({
        title: "Draft created",
        description: `${data.totalRows} customer(s) parsed. Review the list, then submit for approval.`,
      })
      await loadStatus()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleAddRow = async () => {
    if (!newPhone.trim()) return
    setAddingRow(true)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/payment-eligibility/pending/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to add phone number")
      setNewPhone("")
      await loadStatus()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to add",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setAddingRow(false)
    }
  }

  const handleRemoveRow = async (rowId: string) => {
    setRemovingRowId(rowId)
    try {
      const res = await fetch(
        `/api/merchants/${merchantId}/payment-eligibility/pending/rows/${rowId}`,
        { method: "DELETE" }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to remove phone number")
      await loadStatus()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to remove",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setRemovingRowId(null)
    }
  }

  const handleSubmitDraft = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/payment-eligibility/pending/submit`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to submit")
      toast({ title: "Submitted for admin approval" })
      await loadStatus()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Submit failed",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDiscardDraft = async () => {
    setDiscarding(true)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/payment-eligibility/pending`, {
        method: "DELETE",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to discard")
      toast({ title: "Draft discarded" })
      await loadStatus()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to discard",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setDiscarding(false)
    }
  }

  const loadApprovedCustomers = useCallback(
    async (search: string) => {
      setApprovedLoading(true)
      try {
        const params = new URLSearchParams()
        if (search) params.set("search", search)
        const res = await fetch(
          `/api/merchants/${merchantId}/payment-eligibility/customers?${params.toString()}`
        )
        if (res.ok) {
          const data = await res.json()
          setApprovedCustomers(data.customers ?? [])
        }
      } catch {
        toast({ variant: "destructive", title: "Failed to load approved customers" })
      } finally {
        setApprovedLoading(false)
      }
    },
    [merchantId, toast]
  )

  const openApprovedList = () => {
    setSelectedPhones(new Set())
    setApprovedSearch("")
    setIsApprovedOpen(true)
    loadApprovedCustomers("")
  }

  useEffect(() => {
    if (!isApprovedOpen) return
    const timer = setTimeout(() => loadApprovedCustomers(approvedSearch), 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedSearch, isApprovedOpen])

  const togglePhone = (phone: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev)
      if (next.has(phone)) next.delete(phone)
      else next.add(phone)
      return next
    })
  }

  const handleRequestRemoval = async () => {
    if (selectedPhones.size === 0) return
    setSubmittingRemoval(true)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/payment-eligibility/removal-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: [...selectedPhones] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to submit removal request")
      toast({
        title: "Removal request submitted",
        description: "An admin must approve this before the numbers are removed.",
      })
      setIsApprovedOpen(false)
      await loadStatus()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Request failed",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setSubmittingRemoval(false)
    }
  }

  const downloadTemplate = () => {
    const blob = new Blob(["phone\n"], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.setAttribute("hidden", "")
    a.setAttribute("href", url)
    a.setAttribute("download", "eligible_customers_template.csv")
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasActiveRequest = Boolean(activeRequest)

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-white/60 bg-white/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg text-[#5b371f]">
            <ListChecks className="h-5 w-5 text-[#754319]" />
            Payment eligibility
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Import a phone-number allowlist to restrict Push, Payment Link, and QR payments to only these
            customers. Once you have at least one admin-approved entry, payments to any other number will be
            rejected. Until then, all customers can be paid as usual.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100/50 flex-1 min-w-[180px]">
              <p className="text-xs uppercase font-bold text-amber-800/70 tracking-wider">Approved eligible customers</p>
              <p className="mt-1 text-2xl font-black text-[#5b371f]">{status?.approvedCount ?? 0}</p>
            </div>
            <Button variant="outline" onClick={openApprovedList} className="rounded-2xl">
              <Eye className="mr-2 h-4 w-4" />
              View / manage approved list
            </Button>
          </div>

          {activeRequest?.status === "PENDING" && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex gap-3">
              <Clock className="w-5 h-5 text-blue-600 shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold">Awaiting admin approval</p>
                <p className="text-xs text-blue-800/80 mt-0.5">
                  {activeRequest.totalRows} customer(s), submitted{" "}
                  {new Date(activeRequest.createdAt).toLocaleString()}.
                </p>
              </div>
            </div>
          )}

          {activeRequest && (
            <div className="rounded-xl border border-black/5 overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-black/5 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {activeRequest.status === "DRAFT" ? "Draft" : "Pending"} list ({activeRequest.rows.length})
                </p>
                {activeRequest.status === "DRAFT" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    onClick={handleDiscardDraft}
                    disabled={discarding}
                  >
                    {discarding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Discard"}
                  </Button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-black/5">
                {activeRequest.rows.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No phone numbers yet. Add one below.
                  </div>
                )}
                {activeRequest.rows.map((row) => (
                  <div key={row.id} className="px-4 py-2 flex items-center justify-between text-sm font-mono">
                    <span>{row.phone}</span>
                    {activeRequest.status === "DRAFT" && (
                      <button
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={removingRowId === row.id}
                        className="text-slate-300 hover:text-rose-600 transition-colors"
                      >
                        {removingRowId === row.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {activeRequest.status === "DRAFT" && (
                <div className="p-3 bg-slate-50 border-t border-black/5 space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="Add a phone number"
                      className="h-9 rounded-xl"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleAddRow()
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl shrink-0"
                      onClick={handleAddRow}
                      disabled={addingRow || !newPhone.trim()}
                    >
                      {addingRow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button
                    onClick={handleSubmitDraft}
                    disabled={submitting || activeRequest.rows.length === 0}
                    className="w-full rounded-2xl border border-white/20 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 hover:opacity-95"
                  >
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit for Approval
                  </Button>
                </div>
              )}
            </div>
          )}

          {!hasActiveRequest && (
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleImport(f)
                }}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="rounded-2xl border border-white/20 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 hover:opacity-95"
              >
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {importing ? "Importing..." : "Import eligible customers"}
              </Button>
              <Button variant="outline" onClick={downloadTemplate} className="rounded-2xl">
                <Download className="mr-2 h-4 w-4" />
                Download template
              </Button>
            </div>
          )}

          {!hasActiveRequest && status && status.approvedCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Payment eligibility is active for this merchant.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isApprovedOpen} onOpenChange={setIsApprovedOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-primary" />
              Approved Eligible Customers
            </DialogTitle>
            <DialogDescription>
              Select customers to request their removal. A different admin must approve the removal before it
              takes effect.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={approvedSearch}
              onChange={(e) => setApprovedSearch(e.target.value)}
              placeholder="Search phone number..."
              className="h-10 rounded-2xl pl-9"
            />
          </div>

          {approvedLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-xl border border-black/5 divide-y divide-black/5">
              {approvedCustomers.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">No customers found.</div>
              )}
              {approvedCustomers.map((c) => (
                <label
                  key={c.id}
                  className="px-4 py-2 flex items-center gap-3 text-sm font-mono cursor-pointer hover:bg-slate-50"
                >
                  <Checkbox
                    checked={selectedPhones.has(c.phone)}
                    onCheckedChange={() => togglePhone(c.phone)}
                    disabled={hasActiveRequest}
                  />
                  {c.phone}
                </label>
              ))}
            </div>
          )}

          {hasActiveRequest && (
            <p className="text-xs text-amber-700">
              You already have a request pending — finish or discard it before requesting a removal.
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-2xl border-black/10 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
              disabled={selectedPhones.size === 0 || submittingRemoval || hasActiveRequest}
              onClick={handleRequestRemoval}
            >
              {submittingRemoval ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              Request Removal ({selectedPhones.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
