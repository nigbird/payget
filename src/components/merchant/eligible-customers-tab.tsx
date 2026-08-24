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
  Pencil,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { downloadCsv } from "@/lib/export-csv"

type Props = { merchantId: string }

type Status = { approvedCount: number }

type PendingRow = { id: string; phone: string }
type PendingRequest = {
  id: string
  status: "DRAFT" | "PENDING" | "REJECTED"
  fileName: string | null
  totalRows: number
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  rejectionReason: string | null
  editable: boolean
}

type ApprovedCustomer = { id: string; phone: string; approvedAt: string }

const ROWS_PAGE_SIZE = 25
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
/** Mirrors ELIGIBILITY_MANUAL_ADD_MAX_ROWS on the server. */
const MANUAL_ADD_MAX = 100

/** One number, or a pasted batch separated by spaces, commas, or newlines. */
function splitPhoneInput(value: string): string[] {
  return value.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean)
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  label,
  onPageChange,
  onPageSizeChange,
  disabled,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  label: string
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  disabled?: boolean
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        {total === 0 ? `0 ${label}` : `${from}–${to} of ${total} ${label}`}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Show</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-7 w-[68px] rounded-lg px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)} className="text-xs">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 rounded-lg p-0"
              disabled={disabled || page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-1 text-xs tabular-nums text-slate-600">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 rounded-lg p-0"
              disabled={disabled || page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

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

  const [rows, setRows] = useState<PendingRow[]>([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [rowsLoadedOnce, setRowsLoadedOnce] = useState(false)
  const [rowsSearch, setRowsSearch] = useState("")
  // Debounced mirror of rowsSearch — page/pageSize changes fetch immediately, typing waits.
  const [rowsSearchTerm, setRowsSearchTerm] = useState("")
  const [rowsPage, setRowsPage] = useState(1)
  const [rowsPageSize, setRowsPageSize] = useState(ROWS_PAGE_SIZE)
  const [rowsTotal, setRowsTotal] = useState(0)
  const [rowsTotalPages, setRowsTotalPages] = useState(0)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editingPhone, setEditingPhone] = useState("")
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [downloadingRows, setDownloadingRows] = useState(false)

  const [isApprovedOpen, setIsApprovedOpen] = useState(false)
  const [approvedSearch, setApprovedSearch] = useState("")
  const [approvedSearchTerm, setApprovedSearchTerm] = useState("")
  const [approvedPage, setApprovedPage] = useState(1)
  const [approvedPageSize, setApprovedPageSize] = useState(ROWS_PAGE_SIZE)
  const [approvedTotal, setApprovedTotal] = useState(0)
  const [approvedTotalPages, setApprovedTotalPages] = useState(0)
  const [approvedCustomers, setApprovedCustomers] = useState<ApprovedCustomer[]>([])
  const [approvedLoading, setApprovedLoading] = useState(false)
  const [approvedLoadedOnce, setApprovedLoadedOnce] = useState(false)
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set())
  const [submittingRemoval, setSubmittingRemoval] = useState(false)
  const [downloadingApproved, setDownloadingApproved] = useState(false)
  const [selectingAllApproved, setSelectingAllApproved] = useState(false)
  /** True once "select all N matching" has run — lets the banner read as a completed action. */
  const [allApprovedSelected, setAllApprovedSelected] = useState(false)

  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [addInput, setAddInput] = useState("")
  const [addPhones, setAddPhones] = useState<string[]>([])
  const [submittingAdd, setSubmittingAdd] = useState(false)

  const loadRows = useCallback(
    async (page: number, search: string, pageSize: number) => {
      setRowsLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
        if (search) params.set("search", search)
        const res = await fetch(
          `/api/merchants/${merchantId}/payment-eligibility/pending/rows?${params.toString()}`
        )
        if (res.ok) {
          const data = await res.json()
          setRows(data.rows ?? [])
          setRowsTotal(data.total ?? 0)
          setRowsTotalPages(data.totalPages ?? 0)
          if (data.page && data.page !== page) setRowsPage(data.page)
        }
      } catch {
        toast({ variant: "destructive", title: "Failed to load the imported list" })
      } finally {
        setRowsLoading(false)
        setRowsLoadedOnce(true)
      }
    },
    [merchantId, toast]
  )

  /** `silent` skips the full-card spinner so post-mutation refreshes don't flash the UI. */
  const loadStatus = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const [statusRes, pendingRes] = await Promise.all([
        fetch(`/api/merchants/${merchantId}/payment-eligibility`),
        fetch(`/api/merchants/${merchantId}/payment-eligibility/pending`),
      ])
      if (statusRes.ok) setStatus(await statusRes.json())
      if (pendingRes.ok) {
        const data = await pendingRes.json()
        setActiveRequest(data.request ?? null)
        if (!data.request) {
          setRows([])
          setRowsTotal(0)
          setRowsTotalPages(0)
        }
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

  const hasRequest = Boolean(activeRequest)

  useEffect(() => {
    const timer = setTimeout(() => {
      setRowsSearchTerm(rowsSearch.trim())
      setRowsPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [rowsSearch])

  useEffect(() => {
    if (!hasRequest) return
    loadRows(rowsPage, rowsSearchTerm, rowsPageSize)
  }, [hasRequest, rowsPage, rowsPageSize, rowsSearchTerm, loadRows])

  /** Reloads the request meta and the current page of rows together. */
  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadStatus({ silent: true }),
      loadRows(rowsPage, rowsSearchTerm, rowsPageSize),
    ])
  }, [loadStatus, loadRows, rowsPage, rowsSearchTerm, rowsPageSize])

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
      setRowsPage(1)
      setRowsSearch("")
      setSelectedRowIds(new Set())
      await refreshAll()
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
      await refreshAll()
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

  const startEditRow = (row: PendingRow) => {
    setEditingRowId(row.id)
    setEditingPhone(row.phone)
  }

  const cancelEditRow = () => {
    setEditingRowId(null)
    setEditingPhone("")
  }

  const handleSaveRow = async (rowId: string) => {
    if (!editingPhone.trim()) return
    setSavingRowId(rowId)
    try {
      const res = await fetch(
        `/api/merchants/${merchantId}/payment-eligibility/pending/rows/${rowId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: editingPhone }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to update phone number")
      cancelEditRow()
      await refreshAll()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to update",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setSavingRowId(null)
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
      setSelectedRowIds((prev) => {
        if (!prev.has(rowId)) return prev
        const next = new Set(prev)
        next.delete(rowId)
        return next
      })
      await refreshAll()
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
      setSelectedRowIds(new Set())
      await refreshAll()
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
      toast({ title: "List discarded" })
      setRowsPage(1)
      setRowsSearch("")
      setSelectedRowIds(new Set())
      await loadStatus({ silent: true })
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
    async (search: string, page: number, pageSize: number) => {
      setApprovedLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
        if (search) params.set("search", search)
        const res = await fetch(
          `/api/merchants/${merchantId}/payment-eligibility/customers?${params.toString()}`
        )
        if (res.ok) {
          const data = await res.json()
          setApprovedCustomers(data.customers ?? [])
          setApprovedTotal(data.total ?? 0)
          setApprovedTotalPages(data.totalPages ?? 0)
          if (data.page && data.page !== page) setApprovedPage(data.page)
        }
      } catch {
        toast({ variant: "destructive", title: "Failed to load approved customers" })
      } finally {
        setApprovedLoading(false)
        setApprovedLoadedOnce(true)
      }
    },
    [merchantId, toast]
  )

  const openApprovedList = () => {
    setSelectedPhones(new Set())
    setAllApprovedSelected(false)
    setApprovedSearch("")
    setApprovedSearchTerm("")
    setApprovedPage(1)
    setApprovedLoadedOnce(false)
    setIsAddPanelOpen(false)
    setAddInput("")
    setAddPhones([])
    setIsApprovedOpen(true)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setApprovedSearchTerm(approvedSearch.trim())
      setApprovedPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [approvedSearch])

  useEffect(() => {
    if (!isApprovedOpen) return
    loadApprovedCustomers(approvedSearchTerm, approvedPage, approvedPageSize)
  }, [approvedSearchTerm, approvedPage, approvedPageSize, isApprovedOpen, loadApprovedCustomers])

  // The matching set changes under a "select all" once the search term changes, so drop the
  // selection rather than let it silently carry over customers outside the new filter.
  useEffect(() => {
    setSelectedPhones(new Set())
    setAllApprovedSelected(false)
  }, [approvedSearchTerm])

  const togglePhone = (phone: string) => {
    setAllApprovedSelected(false)
    setSelectedPhones((prev) => {
      const next = new Set(prev)
      if (next.has(phone)) next.delete(phone)
      else next.add(phone)
      return next
    })
  }

  const toggleSelectAllApproved = () => {
    setAllApprovedSelected(false)
    setSelectedPhones((prev) => {
      const allSelected =
        approvedCustomers.length > 0 && approvedCustomers.every((c) => prev.has(c.phone))
      if (allSelected) {
        const next = new Set(prev)
        approvedCustomers.forEach((c) => next.delete(c.phone))
        return next
      }
      const next = new Set(prev)
      approvedCustomers.forEach((c) => next.add(c.phone))
      return next
    })
  }

  /** Selects every approved customer matching the current search, not just the loaded page. */
  const selectAllApprovedMatching = async () => {
    setSelectingAllApproved(true)
    try {
      const params = new URLSearchParams({ download: "true" })
      if (approvedSearchTerm) params.set("search", approvedSearchTerm)
      const res = await fetch(
        `/api/merchants/${merchantId}/payment-eligibility/customers?${params.toString()}`
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to select all customers")
      const phones: string[] = (data.customers ?? []).map((c: ApprovedCustomer) => c.phone)
      setSelectedPhones(new Set(phones))
      setAllApprovedSelected(true)
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Could not select all",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setSelectingAllApproved(false)
    }
  }

  const clearApprovedSelection = () => {
    setSelectedPhones(new Set())
    setAllApprovedSelected(false)
  }

  const handleDownloadApproved = async () => {
    setDownloadingApproved(true)
    try {
      const params = new URLSearchParams({ download: "true" })
      if (approvedSearchTerm) params.set("search", approvedSearchTerm)
      const res = await fetch(
        `/api/merchants/${merchantId}/payment-eligibility/customers?${params.toString()}`
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to download the list")
      let exportCustomers: ApprovedCustomer[] = data.customers ?? []
      if (selectedPhones.size > 0) {
        exportCustomers = exportCustomers.filter((c) => selectedPhones.has(c.phone))
      }
      if (exportCustomers.length === 0) {
        toast({ title: "No phone numbers to download" })
        return
      }
      downloadCsv(
        "approved_eligible_customers",
        ["Phone", "Approved At"],
        exportCustomers.map((c) => [c.phone, new Date(c.approvedAt).toLocaleString()])
      )
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setDownloadingApproved(false)
    }
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
      await loadStatus({ silent: true })
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

  // Anything typed but not staged still counts — merchants forget to press Add.
  const pendingAddPhones = [...new Set([...addPhones, ...splitPhoneInput(addInput)])]

  const stageAddPhones = () => {
    const parts = splitPhoneInput(addInput)
    if (parts.length === 0) return
    let overflow = false
    setAddPhones((prev) => {
      const next = [...prev]
      for (const part of parts) {
        if (next.includes(part)) continue
        if (next.length >= MANUAL_ADD_MAX) {
          overflow = true
          break
        }
        next.push(part)
      }
      return next
    })
    setAddInput("")
    if (overflow) {
      toast({
        variant: "destructive",
        title: `Limit is ${MANUAL_ADD_MAX} numbers`,
        description: "Import a file instead for a longer list.",
      })
    }
  }

  const unstageAddPhone = (phone: string) => {
    setAddPhones((prev) => prev.filter((p) => p !== phone))
  }

  const handleRequestAddition = async () => {
    const phones = pendingAddPhones
    if (phones.length === 0) return
    setSubmittingAdd(true)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/payment-eligibility/add-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to submit add request")
      toast({
        title: "Add request submitted",
        description:
          data.skipped > 0
            ? `${data.totalRows} number(s) sent for admin approval. ${data.skipped} already approved.`
            : `${data.totalRows} number(s) sent for admin approval.`,
      })
      setIsApprovedOpen(false)
      await refreshAll()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Request failed",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setSubmittingAdd(false)
    }
  }

  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const toggleSelectAllRows = () => {
    setSelectedRowIds((prev) => {
      const allSelected = rows.length > 0 && rows.every((row) => prev.has(row.id))
      if (allSelected) {
        const next = new Set(prev)
        rows.forEach((row) => next.delete(row.id))
        return next
      }
      const next = new Set(prev)
      rows.forEach((row) => next.add(row.id))
      return next
    })
  }

  const handleDownloadRows = async () => {
    setDownloadingRows(true)
    try {
      const params = new URLSearchParams({ download: "true" })
      if (rowsSearchTerm) params.set("search", rowsSearchTerm)
      const res = await fetch(
        `/api/merchants/${merchantId}/payment-eligibility/pending/rows?${params.toString()}`
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to download the list")
      let exportRows: PendingRow[] = data.rows ?? []
      if (selectedRowIds.size > 0) {
        exportRows = exportRows.filter((row) => selectedRowIds.has(row.id))
      }
      if (exportRows.length === 0) {
        toast({ title: "No phone numbers to download" })
        return
      }
      downloadCsv(
        "eligible_customers_import",
        ["Phone"],
        exportRows.map((row) => [row.phone])
      )
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setDownloadingRows(false)
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
  const isEditable = Boolean(activeRequest?.editable)
  const isRejected = activeRequest?.status === "REJECTED"

  const listHeading =
    activeRequest?.status === "DRAFT"
      ? "Draft list"
      : activeRequest?.status === "PENDING"
        ? "Pending list"
        : "Rejected list"

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

          {isRejected && activeRequest && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div className="text-sm text-rose-900 space-y-1">
                <p className="font-semibold">Rejected by admin</p>
                <p className="whitespace-pre-wrap text-rose-800">
                  <span className="font-medium">Reason: </span>
                  {activeRequest.rejectionReason || "No reason provided."}
                </p>
                <p className="text-xs text-rose-800/70">
                  {activeRequest.reviewedBy ? `Reviewed by ${activeRequest.reviewedBy}` : "Reviewed"}
                  {activeRequest.reviewedAt
                    ? ` on ${new Date(activeRequest.reviewedAt).toLocaleString()}`
                    : ""}
                  .
                </p>
                <p className="text-xs text-rose-800/70">
                  Correct the list below then resubmit it for approval.
                </p>
              </div>
            </div>
          )}

          {activeRequest && (
            <div className="rounded-xl border border-black/5 overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-black/5 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {listHeading} ({activeRequest.totalRows})
                </p>
                {isEditable && (
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

              <div className="px-4 py-2 border-b border-black/5 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                  <Checkbox
                    checked={rows.length > 0 && rows.every((row) => selectedRowIds.has(row.id))}
                    onCheckedChange={toggleSelectAllRows}
                    disabled={rows.length === 0}
                    aria-label="Select all phone numbers on this page"
                  />
                  {selectedRowIds.size > 0 ? `${selectedRowIds.size} selected` : "Select all"}
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-lg text-xs"
                  onClick={handleDownloadRows}
                  disabled={downloadingRows || rowsTotal === 0}
                >
                  {downloadingRows ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Download{selectedRowIds.size > 0 ? ` (${selectedRowIds.size})` : ""}
                </Button>
              </div>

              {(activeRequest.totalRows > 10 || rowsSearch) && (
                <div className="px-3 pt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      value={rowsSearch}
                      onChange={(e) => setRowsSearch(e.target.value)}
                      placeholder="Search phone number..."
                      className="h-9 rounded-xl pl-9"
                    />
                  </div>
                </div>
              )}

              {/*
                The list keeps the previous page mounted while the next one loads and only
                dims — swapping in a spinner collapsed the container and made paging flicker.
              */}
              <div className="relative" aria-busy={rowsLoading}>
                {rowsLoading && rowsLoadedOnce && (
                  <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/50 pt-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                <div
                  className={`divide-y divide-black/5 transition-opacity duration-150 ${
                    rowsLoading && rowsLoadedOnce ? "opacity-40" : "opacity-100"
                  }`}
                >
                {!rowsLoadedOnce ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : rows.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    {rowsSearchTerm
                      ? "No phone numbers match your search."
                      : "No phone numbers yet. Add one below."}
                  </div>
                ) : (
                  rows.map((row) => (
                    <div key={row.id} className="px-4 py-2 flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedRowIds.has(row.id)}
                        onCheckedChange={() => toggleRowSelection(row.id)}
                        aria-label={`Select ${row.phone}`}
                        className="shrink-0"
                      />
                      <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                      {editingRowId === row.id ? (
                        <>
                          <Input
                            value={editingPhone}
                            onChange={(e) => setEditingPhone(e.target.value)}
                            className="h-8 rounded-lg font-mono text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                handleSaveRow(row.id)
                              }
                              if (e.key === "Escape") cancelEditRow()
                            }}
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleSaveRow(row.id)}
                              disabled={savingRowId === row.id || !editingPhone.trim()}
                              className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                              aria-label="Save phone number"
                            >
                              {savingRowId === row.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={cancelEditRow}
                              disabled={savingRowId === row.id}
                              className="text-slate-400 hover:text-slate-600"
                              aria-label="Cancel edit"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="font-mono">{row.phone}</span>
                          {isEditable && (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => startEditRow(row)}
                                className="text-slate-300 hover:text-[#754319] transition-colors"
                                aria-label="Edit phone number"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveRow(row.id)}
                                disabled={removingRowId === row.id}
                                className="text-slate-300 hover:text-rose-600 transition-colors"
                                aria-label="Delete phone number"
                              >
                                {removingRowId === row.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      </div>
                    </div>
                  ))
                )}
                </div>
              </div>

              <div className="px-4 py-2 bg-slate-50/60 border-t border-black/5">
                <Pagination
                  page={rowsPage}
                  totalPages={rowsTotalPages}
                  total={rowsTotal}
                  pageSize={rowsPageSize}
                  label="phone number(s)"
                  onPageChange={setRowsPage}
                  onPageSizeChange={(size) => {
                    setRowsPageSize(size)
                    setRowsPage(1)
                  }}
                  disabled={rowsLoading}
                />
              </div>

              {isEditable && (
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
                    disabled={submitting || activeRequest.totalRows === 0}
                    className="w-full rounded-2xl border border-white/20 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 hover:opacity-95"
                  >
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isRejected ? "Resubmit for Approval" : "Submit for Approval"}
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
          </DialogHeader>

          {!isAddPanelOpen ? (
            <Button
              variant="outline"
              className="w-full justify-center rounded-2xl border-dashed border-amber-200 bg-amber-50/40 text-[#754319] hover:bg-amber-50"
              onClick={() => setIsAddPanelOpen(true)}
              disabled={hasActiveRequest}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add new numbers
            </Button>
          ) : (
            <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800/70">
                  Add new numbers
                </p>
                <button
                  onClick={() => {
                    setIsAddPanelOpen(false)
                    setAddInput("")
                    setAddPhones([])
                  }}
                  className="text-slate-400 hover:text-slate-600"
                  aria-label="Close add panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex gap-2">
                <Input
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  placeholder="Enter a phone number"
                  className="h-9 rounded-xl bg-white"
                  disabled={hasActiveRequest}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      stageAddPhones()
                    }
                  }}
                />
                <Button
                  variant="outline"
                  className="h-9 shrink-0 rounded-xl bg-white"
                  onClick={stageAddPhones}
                  disabled={hasActiveRequest || !addInput.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Paste several at once separated by commas, spaces, or new lines.
              </p>

              {addPhones.length > 0 && (
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {addPhones.map((phone) => (
                    <span
                      key={phone}
                      className="flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2 py-1 font-mono text-xs"
                    >
                      {phone}
                      <button
                        onClick={() => unstageAddPhone(phone)}
                        className="text-slate-300 transition-colors hover:text-rose-600"
                        aria-label={`Remove ${phone}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <Button
                onClick={handleRequestAddition}
                disabled={hasActiveRequest || submittingAdd || pendingAddPhones.length === 0}
                className="w-full rounded-2xl border border-white/20 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 hover:opacity-95"
              >
                {submittingAdd ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Request Addition ({pendingAddPhones.length})
              </Button>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={approvedSearch}
              onChange={(e) => setApprovedSearch(e.target.value)}
              placeholder="Search phone number..."
              className="h-10 rounded-2xl pl-9"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
              <Checkbox
                checked={
                  approvedCustomers.length > 0 &&
                  approvedCustomers.every((c) => selectedPhones.has(c.phone))
                }
                onCheckedChange={toggleSelectAllApproved}
                disabled={approvedCustomers.length === 0 || hasActiveRequest}
                aria-label="Select all approved phone numbers on this page"
              />
              {selectedPhones.size > 0 ? `${selectedPhones.size} selected` : "Select all"}
            </label>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-lg text-xs"
              onClick={handleDownloadApproved}
              disabled={downloadingApproved || approvedTotal === 0}
            >
              {downloadingApproved ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              Download{selectedPhones.size > 0 ? ` (${selectedPhones.size})` : ""}
            </Button>
          </div>

          {!hasActiveRequest &&
            approvedCustomers.length > 0 &&
            approvedTotal > approvedCustomers.length &&
            approvedCustomers.every((c) => selectedPhones.has(c.phone)) &&
            !allApprovedSelected && (
              <div className="rounded-xl bg-amber-50/70 border border-amber-100 px-3 py-2 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                <span>
                  All {approvedCustomers.length} on this page are selected.
                </span>
                <button
                  onClick={selectAllApprovedMatching}
                  disabled={selectingAllApproved}
                  className="font-semibold text-[#754319] hover:underline disabled:opacity-50 flex items-center gap-1.5"
                >
                  {selectingAllApproved && <Loader2 className="h-3 w-3 animate-spin" />}
                  Select all {approvedTotal.toLocaleString()}
                  {approvedSearchTerm ? " matching" : ""} customers
                </button>
              </div>
            )}

          {allApprovedSelected && (
            <div className="rounded-xl bg-amber-50/70 border border-amber-100 px-3 py-2 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
              <span>All {selectedPhones.size.toLocaleString()} customers are selected.</span>
              <button
                onClick={clearApprovedSelection}
                className="font-semibold text-[#754319] hover:underline"
              >
                Clear selection
              </button>
            </div>
          )}

          <div className="relative" aria-busy={approvedLoading}>
            {approvedLoading && approvedLoadedOnce && (
              <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/50 pt-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!approvedLoadedOnce ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div
                className={`max-h-80 overflow-y-auto rounded-xl border border-black/5 divide-y divide-black/5 transition-opacity duration-150 ${
                  approvedLoading ? "opacity-40" : "opacity-100"
                }`}
              >
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
          </div>

          <Pagination
            page={approvedPage}
            totalPages={approvedTotalPages}
            total={approvedTotal}
            pageSize={approvedPageSize}
            label="approved customer(s)"
            onPageChange={setApprovedPage}
            onPageSizeChange={(size) => {
              setApprovedPageSize(size)
              setApprovedPage(1)
            }}
            disabled={approvedLoading}
          />

          {hasActiveRequest && (
            <p className="text-xs text-amber-700">
              You already have a request in progress — finish or discard it before adding numbers or
              requesting a removal.
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
