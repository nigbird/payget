"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import {
  Gift,
  Loader2,
  Save,
  Upload,
  Plus,
  Trash2,
  Users,
  History,
  FileSpreadsheet,
  AlertCircle,
  Settings2,
  Download,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  sanitizeSubsidiaryAccountNumberInput,
  getSubsidiaryAccountNumberValidationError,
  SUBSIDIARY_ACCOUNT_MAX_LENGTH,
} from "@/lib/account-number"
import {
  CASHBACK_LIMITS,
  sanitizePercentInput,
  sanitizeAmountInput,
  sanitizeCategoryNameInput,
  validatePercent,
  validateAmount,
  validateCategoryName,
  validateMinMaxAmounts,
  validateImportFile,
  formatFileSize,
} from "@/lib/cashback/validation"
import type {
  CashbackCategoryDto,
  CashbackConfigDto,
  CashbackEligibleCustomerDto,
  CashbackLogDto,
  CashbackTransactionDto,
} from "@/lib/cashback/types"

type Props = { merchantId: string }

const THEME_BTN =
  "rounded-xl border border-white/20 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 hover:opacity-95 hover:shadow-md transition-all"
const THEME_BTN_SM = `${THEME_BTN} h-9 px-4 text-sm font-semibold`
const THEME_BTN_MD = `${THEME_BTN} h-11 px-6 font-semibold`

type ConfirmState = {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => Promise<void>
}

const emptyCategoryForm = {
  name: "",
  percent: "5",
  minTransactionAmount: "",
  maxTransactionAmount: "",
}

export function CashbackTab({ merchantId }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<CashbackConfigDto | null>(null)
  const [eligible, setEligible] = useState<CashbackEligibleCustomerDto[]>([])
  const [transactions, setTransactions] = useState<CashbackTransactionDto[]>([])
  const [transactionsTotal, setTransactionsTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(30)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const hadSearchFocusRef = useRef(false)
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm)
  const [importing, setImporting] = useState(false)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("")
  const [activeTab, setActiveTab] = useState<string>("settings")
  const [customerFilterCategoryId, setCustomerFilterCategoryId] = useState<string>("all")
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [categoryFieldErrors, setCategoryFieldErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    enabled: false,
    mode: "ALL_CUSTOMERS" as "ALL_CUSTOMERS" | "CATEGORY_ELIGIBLE",
    subsidiaryAccountNumber: "",
    allCustomersPercent: "",
    allCustomersMinAmount: "",
    allCustomersMaxAmount: "",
  })

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, eligRes] = await Promise.all([
        fetch(`/api/merchants/${merchantId}/cashback`),
        fetch(`/api/merchants/${merchantId}/cashback/eligible`),
      ])
      if (cfgRes.ok) {
        const cfg: CashbackConfigDto = await cfgRes.json()
        setConfig(cfg)
        setForm({
          enabled: cfg.enabled,
          mode: cfg.mode,
          subsidiaryAccountNumber: cfg.subsidiaryAccountNumber ?? "",
          allCustomersPercent: cfg.allCustomersPercent?.toString() ?? "",
          allCustomersMinAmount: cfg.allCustomersMinAmount?.toString() ?? "",
          allCustomersMaxAmount: cfg.allCustomersMaxAmount?.toString() ?? "",
        })
      }
      if (eligRes.ok) {
        const data = await eligRes.json()
        setEligible(data.customers ?? [])
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to load cashback settings" })
    } finally {
      setLoading(false)
    }
  }, [merchantId, toast])

  const loadTransactions = useCallback(async () => {
    // Track if search input had focus before we start loading
    hadSearchFocusRef.current = 
      document.activeElement === searchInputRef.current
    try {
      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('limit', itemsPerPage.toString())
      if (debouncedSearchQuery) params.set('search', debouncedSearchQuery)
      if (statusFilter && statusFilter !== "ALL") params.set('status', statusFilter)
      
      const txRes = await fetch(
        `/api/merchants/${merchantId}/cashback/transactions?${params.toString()}`
      )
      if (txRes.ok) {
        const data = await txRes.json()
        setTransactions(data.transactions ?? [])
        setTransactionsTotal(data.total ?? 0)
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to load transactions" })
    }
  }, [merchantId, toast, currentPage, itemsPerPage, debouncedSearchQuery, statusFilter])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load initial data (config and eligible customers) on mount
  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Load transactions initially and when search/filters change
  useEffect(() => {
    loadTransactions()
  }, [loadTransactions])

  // Reset page when search/filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchQuery, statusFilter, itemsPerPage])

  // Restore focus to search input after load if it had it before
  useEffect(() => {
    if (!loading && hadSearchFocusRef.current && searchInputRef.current) {
      searchInputRef.current.focus()
      // Also restore cursor position
      const end = searchQuery.length
      searchInputRef.current.setSelectionRange(end, end)
    }
  }, [loading, searchQuery])

  const saveConfig = async () => {
    const errors: Record<string, string> = {}

    const subsidiaryError = form.subsidiaryAccountNumber
      ? getSubsidiaryAccountNumberValidationError(form.subsidiaryAccountNumber)
      : form.enabled
        ? "Subsidiary account is required when cashback is enabled."
        : undefined
    if (subsidiaryError) errors.subsidiaryAccountNumber = subsidiaryError

    if (form.enabled && form.mode === "ALL_CUSTOMERS") {
      const pct = validatePercent(form.allCustomersPercent, true)
      if (!pct.valid && pct.error) errors.allCustomersPercent = pct.error

      const min = validateAmount(form.allCustomersMinAmount, "Min transaction amount")
      const max = validateAmount(form.allCustomersMaxAmount, "Max transaction amount")
      if (!min.valid && min.error) errors.allCustomersMinAmount = min.error
      if (!max.valid && max.error) errors.allCustomersMaxAmount = max.error
      const mm = validateMinMaxAmounts(form.allCustomersMinAmount, form.allCustomersMaxAmount)
      Object.assign(errors, mm.errors)
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast({
        variant: "destructive",
        title: "Validation",
        description: "Please fix the highlighted fields.",
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/cashback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          mode: form.mode,
          subsidiaryAccountNumber: form.subsidiaryAccountNumber || null,
          allCustomersPercent: parseNum(form.allCustomersPercent),
          allCustomersMinAmount: parseNum(form.allCustomersMinAmount),
          allCustomersMaxAmount: parseNum(form.allCustomersMaxAmount),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.errors) setFieldErrors(data.errors)
        throw new Error(
          data.error ||
            data.errors?.subsidiaryAccountNumber ||
            data.errors?.allCustomersPercent ||
            "Save failed"
        )
      }
      setConfig(data)
      setFieldErrors({})
      toast({ title: "Cashback settings saved" })
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setSaving(false)
    }
  }

  const addCategory = async () => {
    const errors: Record<string, string> = {}
    const nameCheck = validateCategoryName(categoryForm.name)
    if (!nameCheck.valid && nameCheck.error) errors.name = nameCheck.error

    const pct = validatePercent(categoryForm.percent, true)
    if (!pct.valid && pct.error) errors.percent = pct.error

    const mm = validateMinMaxAmounts(
      categoryForm.minTransactionAmount,
      categoryForm.maxTransactionAmount
    )
    Object.assign(errors, mm.errors)

    setCategoryFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast({
        variant: "destructive",
        title: "Validation",
        description: "Please fix the category form fields.",
      })
      return
    }

    try {
      const res = await fetch(`/api/merchants/${merchantId}/cashback/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryForm.name.trim(),
          percent: Number(categoryForm.percent),
          minTransactionAmount: parseNum(categoryForm.minTransactionAmount),
          maxTransactionAmount: parseNum(categoryForm.maxTransactionAmount),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.errors) setCategoryFieldErrors(data.errors)
        throw new Error(data.error || data.errors?.name || "Failed to add category")
      }
      setCategoryForm(emptyCategoryForm)
      setCategoryFieldErrors({})
      setIsCategoryModalOpen(false)
      // Reload both config and transactions
      await loadInitialData()
      await loadTransactions()
      toast({ title: "Category added" })
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed",
      })
    }
  }

  const requestDeleteCategory = (category: CashbackCategoryDto) => {
    setConfirmState({
      title: "Delete this category?",
      description: `"${category.name}" and all ${category.eligibleCount} eligible customer(s) in this group will be permanently removed. This cannot be undone.`,
      confirmLabel: "Delete category",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(
          `/api/merchants/${merchantId}/cashback/categories/${category.id}`,
          { method: "DELETE" }
        )
        if (!res.ok) throw new Error("Failed to delete category")
        await loadInitialData()
        await loadTransactions()
        if (customerFilterCategoryId === category.id) {
          setCustomerFilterCategoryId("all")
        }
        toast({ title: "Category removed" })
      },
    })
  }

  const requestDeleteCustomer = (customer: CashbackEligibleCustomerDto) => {
    setConfirmState({
      title: "Remove eligible customer?",
      description: `Remove ${customer.phone} from the "${customer.categoryName}" group? They will no longer receive category cashback until re-imported.`,
      confirmLabel: "Remove customer",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/merchants/${merchantId}/cashback/eligible`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [customer.id] }),
        })
        if (!res.ok) throw new Error("Failed to remove customer")
        await loadInitialData()
        await loadTransactions()
        toast({ title: "Customer removed" })
      },
    })
  }

  const requestClearGroupImports = () => {
    const categoryId =
      customerFilterCategoryId === "all" ? null : customerFilterCategoryId
    const rows = eligible.filter(
      (row) => !categoryId || row.categoryId === categoryId
    )
    if (rows.length === 0) {
      toast({ title: "Nothing to clear", description: "No customers in this view." })
      return
    }

    const groupLabel =
      categoryId === null
        ? "all groups"
        : config?.categories.find((c) => c.id === categoryId)?.name ?? "this group"

    setConfirmState({
      title: "Clear imported customers?",
      description: `Remove ${rows.length} customer(s) from ${groupLabel}? This only deletes eligibility records, not payment history.`,
      confirmLabel: "Clear imports",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/merchants/${merchantId}/cashback/eligible`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: rows.map((r) => r.id) }),
        })
        if (!res.ok) throw new Error("Failed to clear imports")
        await loadInitialData()
        await loadTransactions()
        toast({ title: "Imports cleared", description: `${rows.length} customer(s) removed.` })
      },
    })
  }

  const runConfirm = async () => {
    if (!confirmState) return
    setConfirmLoading(true)
    try {
      await confirmState.onConfirm()
      setConfirmState(null)
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setConfirmLoading(false)
    }
  }

  const handleImport = async (file: File) => {
    if (!selectedCategoryId) {
      toast({
        variant: "destructive",
        title: "Category required",
        description: "Please select a category to import customers into.",
      })
      return
    }

    const fileCheck = validateImportFile(file)
    if (!fileCheck.valid) {
      toast({
        variant: "destructive",
        title: "Invalid file",
        description: fileCheck.error,
      })
      return
    }

    setImporting(true)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("categoryId", selectedCategoryId)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/cashback/import`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Import failed")
      toast({
        title: "Import complete",
        description: `${data.imported} imported, ${data.skipped} skipped`,
      })
      setIsImportModalOpen(false)
      setSelectedCategoryId("")
      await loadInitialData()
      await loadTransactions()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    const headers = "phone,account"
    const blob = new Blob([headers], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.setAttribute("hidden", "")
    a.setAttribute("href", url)
    a.setAttribute("download", "customer_import_template.csv")
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }



  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#754319]" />
      </div>
    )
  }

  const filteredEligible = eligible.filter(
    (row) => customerFilterCategoryId === "all" || row.categoryId === customerFilterCategoryId
  )

  return (
    <div className="space-y-6 p-4 md:p-8">
      <AlertDialog
        open={!!confirmState}
        onOpenChange={(open) => {
          if (!open && !confirmLoading) setConfirmState(null)
        }}
      >
        <AlertDialogContent className="max-w-md rounded-2xl border-amber-100/80 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#5b371f] text-center sm:text-left">
              {confirmState?.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center sm:text-left leading-relaxed">
              {confirmState?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center gap-2">
            <AlertDialogCancel
              disabled={confirmLoading}
              className="rounded-xl h-11 px-6 border-slate-200"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={confirmLoading}
              onClick={runConfirm}
              className={
                confirmState?.destructive
                  ? "rounded-xl h-11 px-6 bg-rose-600 hover:bg-rose-700 text-white"
                  : THEME_BTN_MD
              }
            >
              {confirmLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                confirmState?.confirmLabel
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
        <Gift className="h-5 w-5 text-amber-700 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-900">Cashback program</p>
          <p className="text-xs text-amber-800/80 mt-1">
            Configure rules and eligibility. Cashback is processed automatically after confirmed
            payment settlement. Banking APIs use a stub provider until integration is complete.
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border-white/60 bg-white/85 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cashback-enabled" className="text-base font-semibold text-[#5b371f]">
                Enable Cashback Program
              </Label>
              <p className="text-sm text-muted-foreground">
                Activate automated rewards for your customers.
              </p>
            </div>
            <Switch
              id="cashback-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => {
                setForm((p) => ({ ...p, enabled: v }))
                // If we're enabling for the first time or toggling, 
                // we might want to save immediately or let them see the tabs
              }}
            />
          </div>
        </CardContent>
      </Card>

      {form.enabled && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 rounded-xl h-12 bg-amber-50/50 p-1 border border-amber-100/60">
            <TabsTrigger
              value="settings"
              className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#f8b513] data-[state=active]:to-[#754319] data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:text-[#754319]/70"
            >
              <Settings2 className="h-4 w-4 mr-2" /> Settings
            </TabsTrigger>
            <TabsTrigger
              value="categories"
              disabled={form.mode !== "CATEGORY_ELIGIBLE"}
              className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#f8b513] data-[state=active]:to-[#754319] data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:text-[#754319]/70 disabled:opacity-40"
            >
              <Plus className="h-4 w-4 mr-2" /> Categories
            </TabsTrigger>
            <TabsTrigger
              value="customers"
              disabled={form.mode !== "CATEGORY_ELIGIBLE"}
              className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#f8b513] data-[state=active]:to-[#754319] data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:text-[#754319]/70 disabled:opacity-40"
            >
              <Users className="h-4 w-4 mr-2" /> Customers
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#f8b513] data-[state=active]:to-[#754319] data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:text-[#754319]/70"
            >
              <History className="h-4 w-4 mr-2" /> History
            </TabsTrigger>
          </TabsList>

          <div className="mt-6 space-y-6">
            <TabsContent value="settings" className="space-y-6">
              <Card className="rounded-2xl border-white/60 bg-white/85 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-[#5b371f]">General configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Operation mode</Label>
                      <Select
                        value={form.mode}
                        onValueChange={(v) =>
                          setForm((p) => ({
                            ...p,
                            mode: v as "ALL_CUSTOMERS" | "CATEGORY_ELIGIBLE",
                          }))
                        }
                      >
                        <SelectTrigger className="h-11 rounded-xl border-amber-200/80 bg-white text-sm text-[#5b371f] shadow-sm focus:ring-2 focus:ring-amber-500/25">
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-amber-100 bg-white shadow-lg">
                          <SelectItem value="ALL_CUSTOMERS" className="rounded-lg">
                            All customers (Universal rules)
                          </SelectItem>
                          <SelectItem value="CATEGORY_ELIGIBLE" className="rounded-lg">
                            Specific groups (Category-based)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subsidiary" className="text-sm font-medium">Subsidiary funding account</Label>
                      <Input
                        id="subsidiary"
                        maxLength={SUBSIDIARY_ACCOUNT_MAX_LENGTH}
                        placeholder="ABC7000123456789"
                        value={form.subsidiaryAccountNumber}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            subsidiaryAccountNumber: sanitizeSubsidiaryAccountNumberInput(e.target.value),
                          }))
                        }
                        className={`h-11 rounded-xl font-mono focus:ring-amber-500/20 ${fieldErrors.subsidiaryAccountNumber ? "border-rose-500" : ""}`}
                      />
                      {fieldErrors.subsidiaryAccountNumber && (
                        <p className="text-xs text-rose-600">{fieldErrors.subsidiaryAccountNumber}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        First 3 characters: letters or numbers; up to 13 digits after (16 total).
                      </p>
                    </div>
                  </div>

                  {form.mode === "ALL_CUSTOMERS" && (
                    <div className="pt-4 border-t">
                      <h4 className="text-sm font-semibold text-[#5b371f] mb-4">Universal cashback rules</h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <CashbackFormField
                          label="Cashback %"
                          hint="0.01 – 100"
                          fieldType="percent"
                          value={form.allCustomersPercent}
                          error={fieldErrors.allCustomersPercent}
                          onChange={(v) =>
                            setForm((p) => ({ ...p, allCustomersPercent: v }))
                          }
                        />
                        <CashbackFormField
                          label="Min transaction amount"
                          fieldType="amount"
                          value={form.allCustomersMinAmount}
                          error={fieldErrors.allCustomersMinAmount}
                          onChange={(v) =>
                            setForm((p) => ({ ...p, allCustomersMinAmount: v }))
                          }
                        />
                        <CashbackFormField
                          label="Max transaction amount"
                          fieldType="amount"
                          value={form.allCustomersMaxAmount}
                          error={fieldErrors.allCustomersMaxAmount}
                          onChange={(v) =>
                            setForm((p) => ({ ...p, allCustomersMaxAmount: v }))
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <Button onClick={saveConfig} disabled={saving} className={THEME_BTN_MD}>
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Save changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="categories" className="space-y-6">
              <Card className="rounded-2xl border-white/60 bg-white/85 shadow-sm">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base text-[#5b371f]">Management categories</CardTitle>
                  <Dialog
                    open={isCategoryModalOpen}
                    onOpenChange={(open) => {
                      setIsCategoryModalOpen(open)
                      if (!open) setCategoryFieldErrors({})
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" className={THEME_BTN_SM}>
                        <Plus className="h-4 w-4 mr-2" /> Add Category
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px] rounded-2xl">
                      <DialogHeader>
                        <DialogTitle className="text-[#5b371f]">Add New Category</DialogTitle>
                        <DialogDescription>
                          Define eligibility rules for a specific group of customers.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <CashbackFormField
                          label="Category name"
                          hint={`Max ${CASHBACK_LIMITS.categoryNameMax} characters`}
                          fieldType="categoryName"
                          value={categoryForm.name}
                          error={categoryFieldErrors.name}
                          onChange={(v) => setCategoryForm((p) => ({ ...p, name: v }))}
                        />
                        <CashbackFormField
                          label="Cashback percentage"
                          hint="0.01 – 100"
                          fieldType="percent"
                          value={categoryForm.percent}
                          error={categoryFieldErrors.percent}
                          onChange={(v) => setCategoryForm((p) => ({ ...p, percent: v }))}
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <CashbackFormField
                            label="Min transaction"
                            fieldType="amount"
                            value={categoryForm.minTransactionAmount}
                            error={categoryFieldErrors.minTransactionAmount}
                            onChange={(v) =>
                              setCategoryForm((p) => ({ ...p, minTransactionAmount: v }))
                            }
                          />
                          <CashbackFormField
                            label="Max transaction"
                            fieldType="amount"
                            value={categoryForm.maxTransactionAmount}
                            error={categoryFieldErrors.maxTransactionAmount}
                            onChange={(v) =>
                              setCategoryForm((p) => ({ ...p, maxTransactionAmount: v }))
                            }
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={addCategory} className={`w-full ${THEME_BTN_MD}`}>
                          Create Category
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4">
                    {config?.categories.map((cat) => (
                      <CategoryRow
                        key={cat.id}
                        category={cat}
                        onDelete={() => requestDeleteCategory(cat)}
                      />
                    ))}
                    {config?.categories.length === 0 && (
                      <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 bg-slate-50/30">
                        <Plus className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400 font-medium">No categories defined yet.</p>
                        <p className="text-xs text-slate-400 mt-1">Click "Add Category" to get started.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="customers" className="space-y-6">
              <Card className="rounded-2xl border-white/60 bg-white/85 shadow-sm">
                <CardHeader className="pb-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    <CardTitle className="text-base text-[#5b371f] flex items-center gap-2">
                      <Users className="h-4 w-4" /> Eligible customers
                    </CardTitle>
                    
                    <div className="flex items-center gap-2 border-l pl-4 md:pl-6">
                      <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider shrink-0">
                        Show group
                      </Label>
                      <Select
                        value={customerFilterCategoryId}
                        onValueChange={setCustomerFilterCategoryId}
                      >
                        <SelectTrigger className="h-9 min-w-[140px] rounded-xl border-amber-200/80 bg-white text-xs font-semibold text-[#754319] shadow-sm">
                          <SelectValue placeholder="All groups" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-amber-100 bg-white shadow-lg">
                          <SelectItem value="all" className="rounded-lg text-sm">
                            All groups
                          </SelectItem>
                          {config?.categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id} className="rounded-lg text-sm">
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {filteredEligible.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl h-9 border-rose-200 text-rose-700 hover:bg-rose-50"
                        onClick={requestClearGroupImports}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Clear {customerFilterCategoryId === "all" ? "all" : "group"}
                      </Button>
                    )}
                  <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
                    <DialogTrigger asChild>
                      <Button className={THEME_BTN_SM}>
                        <Upload className="h-4 w-4 mr-2" /> Batch Import
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px] rounded-2xl">
                      <DialogHeader>
                        <DialogTitle className="text-[#5b371f]">Import Customers</DialogTitle>
                        <DialogDescription>
                          Upload a list of customers to assign them to a cashback group.
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="grid gap-6 py-6">
                        <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">1. Get Template</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={downloadTemplate}
                              className="h-8 text-[10px] font-bold uppercase rounded-lg border-amber-200 text-amber-800"
                            >
                              <Download className="h-3 w-3 mr-1.5" /> Download Template
                            </Button>
                          </div>
                          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <FileSpreadsheet className="h-3.5 w-3.5 text-amber-600" />
                            Columns: <span className="font-mono font-bold">phone, account</span> (optional)
                          </p>
                          <p className="text-[10px] text-slate-400">
                            CSV, TXT, XLS, or XLSX · max {formatFileSize(CASHBACK_LIMITS.importMaxBytes)} · up to{" "}
                            {CASHBACK_LIMITS.importMaxRows.toLocaleString()} rows
                          </p>
                        </div>

                        <div className="space-y-4">
                          <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">2. Select Destination Group</p>
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-500 ml-1">Target category</Label>
                            <Select
                              value={selectedCategoryId || undefined}
                              onValueChange={setSelectedCategoryId}
                            >
                              <SelectTrigger className="h-11 rounded-xl border-amber-200/80 bg-white text-sm font-medium text-[#5b371f] shadow-sm">
                                <SelectValue placeholder="Select a category…" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-amber-100 bg-white shadow-lg">
                                {config?.categories.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id} className="rounded-lg">
                                    {cat.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <p className="text-xs font-bold uppercase text-slate-500 tracking-wider">3. Upload File</p>
                          <label className={`flex flex-col items-center justify-center w-full h-32 rounded-2xl border-2 border-dashed transition-all ${
                            selectedCategoryId 
                              ? "cursor-pointer border-amber-200 bg-amber-50/30 hover:bg-amber-50 hover:border-amber-300" 
                              : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                          }`}>
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              {importing ? (
                                <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
                              ) : (
                                <>
                                  <Upload className={`h-8 w-8 mb-2 ${selectedCategoryId ? "text-amber-600" : "text-slate-300"}`} />
                                  <p className="text-xs font-medium">Click to select CSV or Excel file</p>
                                </>
                              )}
                            </div>
                            <input
                              type="file"
                              accept=".csv,.xlsx,.xls,.txt"
                              className="hidden"
                              disabled={importing || !selectedCategoryId}
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) handleImport(f)
                                e.target.value = ""
                              }}
                            />
                          </label>
                          {!selectedCategoryId && (
                            <p className="text-[10px] text-rose-500 text-center font-medium italic">Please select a group first to enable upload.</p>
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-auto rounded-xl border border-slate-100 bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/50 sticky top-0 border-b">
                        <tr>
                          <th className="text-left p-3 font-semibold text-slate-600">Phone number</th>
                          <th className="text-left p-3 font-semibold text-slate-600">Account</th>
                          <th className="text-left p-3 font-semibold text-slate-600">Assigned category</th>
                          <th className="text-right p-3 font-semibold text-slate-600 w-16">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredEligible.map((row) => (
                          <tr key={row.id} className="hover:bg-amber-50/20 transition-colors">
                            <td className="p-3 font-mono text-xs">{row.phone}</td>
                            <td className="p-3 font-mono text-xs">{row.accountNumber ?? "—"}</td>
                            <td className="p-3">
                              <Badge variant="secondary" className="bg-amber-100/50 text-amber-800 border-none font-medium">
                                {row.categoryName}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                onClick={() => requestDeleteCustomer(row)}
                                title="Remove customer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {filteredEligible.length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-12 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <Users className="h-10 w-10 text-slate-200" />
                                <p className="text-sm text-slate-400 font-medium">
                                  {customerFilterCategoryId === "all" 
                                    ? "No eligible customers found." 
                                    : "No customers in this category."}
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-6">
              <Card className="rounded-2xl border-white/60 bg-white/85 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-[#5b371f] flex items-center gap-2">
                    <History className="h-4 w-4" /> Transaction history
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        ref={searchInputRef}
                        placeholder="Search by transaction ID, phone, or account..."
                        className="h-10 rounded-xl border-slate-200 bg-white pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-10 w-40 rounded-xl border-slate-200 bg-white">
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4" />
                          <SelectValue placeholder="Status" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Statuses</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="FAILED">Failed</SelectItem>
                        <SelectItem value="PROCESSING">Processing</SelectItem>
                        <SelectItem value="PENDING">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={String(itemsPerPage)} onValueChange={(val) => setItemsPerPage(Number(val))}>
                      <SelectTrigger className="h-10 w-24 rounded-xl border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="30">30</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Transactions List */}
                  <div className="space-y-3">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="rounded-xl border border-slate-100 p-4 text-sm bg-white hover:border-amber-200 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-base font-bold text-[#5b371f]">
                              {tx.cashbackAmount.toFixed(2)} ETB <span className="text-xs font-normal text-slate-400">({tx.cashbackPercent}%)</span>
                            </p>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span>Payment: <span className="font-semibold text-slate-700">{tx.paymentAmount.toFixed(2)}</span></span>
                              <span className="w-1 h-1 rounded-full bg-slate-300" />
                              <span>Customer: <span className="font-semibold text-slate-700">{tx.customerPhone ?? "—"}</span></span>
                              {tx.categoryName && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                                  <span>Group: <span className="font-semibold text-slate-700">{tx.categoryName}</span></span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusBadge status={tx.status} />
                            <p className="font-mono text-[10px] text-slate-400 uppercase tracking-tighter">{tx.paymentTransactionId}</p>
                          </div>
                        </div>

                        {tx.skipReason && (
                          <div className="mt-3 p-2 rounded-lg bg-amber-50/50 border border-amber-100/50 flex items-center gap-2 text-xs text-amber-800">
                            <AlertCircle className="h-3.5 w-3.5" /> {tx.skipReason}
                          </div>
                        )}
                        {tx.failureReason && (
                          <div className="mt-3 p-2 rounded-lg bg-rose-50 border border-rose-100 flex items-center gap-2 text-xs text-rose-700">
                            <AlertCircle className="h-3.5 w-3.5" /> {tx.failureReason}
                          </div>
                        )}
                      </div>
                    ))}
                    {transactions.length === 0 && (
                      <div className="text-center py-12">
                        <History className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400 font-medium">No transactions found.</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Pagination */}
                  {transactionsTotal > 0 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                      <p className="text-xs text-slate-500">
                        Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, transactionsTotal)} of {transactionsTotal}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(1)}
                          className="h-8 w-8 rounded-lg"
                        >
                          <ChevronsLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                          className="h-8 w-8 rounded-lg"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        
                        <div className="flex items-center gap-1">
                          {(() => {
                            const totalPages = Math.ceil(transactionsTotal / itemsPerPage)
                            const pages = []
                            let startPage = Math.max(1, currentPage - 2)
                            let endPage = Math.min(totalPages, startPage + 4)
                            if (endPage - startPage < 4) {
                              startPage = Math.max(1, endPage - 4)
                            }
                            for (let i = startPage; i <= endPage; i++) {
                              pages.push(
                                <Button
                                  key={i}
                                  variant={currentPage === i ? "default" : "ghost"}
                                  size="sm"
                                  className={`h-8 w-8 rounded-lg ${
                                    currentPage === i 
                                      ? "bg-gradient-to-r from-[#f8b513] to-[#754319] text-white" 
                                      : "text-slate-700"
                                  }`}
                                  onClick={() => setCurrentPage(i)}
                                >
                                  {i}
                                </Button>
                              )
                            }
                            return pages
                          })()}
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={currentPage >= Math.ceil(transactionsTotal / itemsPerPage)}
                          onClick={() => setCurrentPage((prev) => Math.min(Math.ceil(transactionsTotal / itemsPerPage), prev + 1))}
                          className="h-8 w-8 rounded-lg"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={currentPage >= Math.ceil(transactionsTotal / itemsPerPage)}
                          onClick={() => setCurrentPage(Math.ceil(transactionsTotal / itemsPerPage))}
                          className="h-8 w-8 rounded-lg"
                        >
                          <ChevronsRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  )
}

type CashbackFieldType = "percent" | "amount" | "categoryName"

function CashbackFormField({
  label,
  value,
  onChange,
  fieldType,
  error,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  fieldType: CashbackFieldType
  error?: string
  hint?: string
}) {
  const sanitize = (raw: string) => {
    if (fieldType === "percent") return sanitizePercentInput(raw)
    if (fieldType === "amount") return sanitizeAmountInput(raw)
    return sanitizeCategoryNameInput(raw)
  }

  const maxLength =
    fieldType === "percent"
      ? CASHBACK_LIMITS.percentMaxInputLength
      : fieldType === "categoryName"
        ? CASHBACK_LIMITS.categoryNameMax
        : CASHBACK_LIMITS.amountMaxInputLength

  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      <Input
        type="text"
        inputMode={fieldType === "categoryName" ? "text" : "decimal"}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(sanitize(e.target.value))}
        className={`h-10 rounded-xl ${error ? "border-rose-500 focus-visible:ring-rose-500/30" : ""}`}
      />
      {error ? (
        <p className="text-[11px] text-rose-600 font-medium">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function CategoryRow({
  category,
  onDelete,
}: {
  category: CashbackCategoryDto
  onDelete: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border p-3 bg-slate-50/50">
      <div>
        <p className="font-semibold text-sm">{category.name}</p>
        <p className="text-xs text-muted-foreground">
          {category.percent}% · min {category.minTransactionAmount ?? 0}
          {category.maxTransactionAmount != null ? ` · max ${category.maxTransactionAmount}` : ""}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {category.eligibleCount} eligible customers
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="h-9 w-9 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700 shrink-0"
        title="Delete category"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: "bg-emerald-100 text-emerald-800",
    FAILED: "bg-rose-100 text-rose-800",
    SKIPPED: "bg-slate-100 text-slate-700",
    PROCESSING: "bg-amber-100 text-amber-800",
    PENDING: "bg-blue-100 text-blue-800",
  }
  return (
    <Badge className={map[status] ?? "bg-slate-100"} variant="outline">
      {status}
    </Badge>
  )
}

function parseNum(v: string): number | null {
  if (v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
