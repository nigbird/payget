"use client"

import { useCallback, useEffect, useState } from "react"
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
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  sanitizeAccountNumberInput,
  getAccountNumberValidationError,
} from "@/lib/account-number"
import type {
  CashbackCategoryDto,
  CashbackConfigDto,
  CashbackEligibleCustomerDto,
  CashbackLogDto,
  CashbackTransactionDto,
} from "@/lib/cashback/types"

type Props = { merchantId: string }

const emptyCategoryForm = {
  name: "",
  percent: "5",
  minTransactionAmount: "0",
  maxCashbackAmount: "",
  transactionThreshold: "",
}

export function CashbackTab({ merchantId }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<CashbackConfigDto | null>(null)
  const [eligible, setEligible] = useState<CashbackEligibleCustomerDto[]>([])
  const [transactions, setTransactions] = useState<CashbackTransactionDto[]>([])
  const [expandedLogs, setExpandedLogs] = useState<Record<string, CashbackLogDto[]>>({})
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm)
  const [importing, setImporting] = useState(false)

  const [form, setForm] = useState({
    enabled: false,
    mode: "ALL_CUSTOMERS" as "ALL_CUSTOMERS" | "CATEGORY_ELIGIBLE",
    subsidiaryAccountNumber: "",
    allCustomersPercent: "",
    allCustomersMinAmount: "",
    allCustomersMaxCashback: "",
    allCustomersThreshold: "",
  })

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, eligRes, txRes] = await Promise.all([
        fetch(`/api/merchants/${merchantId}/cashback`),
        fetch(`/api/merchants/${merchantId}/cashback/eligible`),
        fetch(`/api/merchants/${merchantId}/cashback/transactions?limit=30`),
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
          allCustomersMaxCashback: cfg.allCustomersMaxCashback?.toString() ?? "",
          allCustomersThreshold: cfg.allCustomersThreshold?.toString() ?? "",
        })
      }
      if (eligRes.ok) {
        const data = await eligRes.json()
        setEligible(data.customers ?? [])
      }
      if (txRes.ok) {
        const data = await txRes.json()
        setTransactions(data.transactions ?? [])
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to load cashback settings" })
    } finally {
      setLoading(false)
    }
  }, [merchantId, toast])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const saveConfig = async () => {
    const subsidiaryError = form.subsidiaryAccountNumber
      ? getAccountNumberValidationError(form.subsidiaryAccountNumber)
      : form.enabled
        ? "Subsidiary account is required when cashback is enabled."
        : undefined

    if (subsidiaryError) {
      toast({ variant: "destructive", title: "Validation", description: subsidiaryError })
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
          allCustomersMaxCashback: parseNum(form.allCustomersMaxCashback),
          allCustomersThreshold: parseNum(form.allCustomersThreshold),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.errors?.subsidiaryAccountNumber || "Save failed")
      setConfig(data)
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
    if (!categoryForm.name.trim()) return
    try {
      const res = await fetch(`/api/merchants/${merchantId}/cashback/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryForm.name.trim(),
          percent: Number(categoryForm.percent),
          minTransactionAmount: Number(categoryForm.minTransactionAmount) || 0,
          maxCashbackAmount: parseNum(categoryForm.maxCashbackAmount),
          transactionThreshold: parseNum(categoryForm.transactionThreshold),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to add category")
      }
      setCategoryForm(emptyCategoryForm)
      await loadAll()
      toast({ title: "Category added" })
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed",
      })
    }
  }

  const deleteCategory = async (categoryId: string) => {
    if (!confirm("Delete this category and its eligible customers?")) return
    const res = await fetch(`/api/merchants/${merchantId}/cashback/categories/${categoryId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      await loadAll()
      toast({ title: "Category removed" })
    }
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    const fd = new FormData()
    fd.append("file", file)
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
      await loadAll()
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

  const toggleLogs = async (cashbackId: string) => {
    if (expandedLogs[cashbackId]) {
      const next = { ...expandedLogs }
      delete next[cashbackId]
      setExpandedLogs(next)
      return
    }
    const res = await fetch(
      `/api/merchants/${merchantId}/cashback/transactions/${cashbackId}/logs`
    )
    if (res.ok) {
      const data = await res.json()
      setExpandedLogs((p) => ({ ...p, [cashbackId]: data.logs ?? [] }))
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#754319]" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
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

      <Card className="rounded-2xl border-white/60 bg-white/85">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-[#5b371f]">General settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <Label htmlFor="cashback-enabled">Enable cashback</Label>
            <Switch
              id="cashback-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => setForm((p) => ({ ...p, enabled: v }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Cashback mode</Label>
            <select
              className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
              value={form.mode}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  mode: e.target.value as "ALL_CUSTOMERS" | "CATEGORY_ELIGIBLE",
                }))
              }
            >
              <option value="ALL_CUSTOMERS">All customers (no eligibility list)</option>
              <option value="CATEGORY_ELIGIBLE">Category-based eligible customers only</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subsidiary">Subsidiary funding account</Label>
            <Input
              id="subsidiary"
              inputMode="numeric"
              maxLength={13}
              placeholder="7000123456789"
              value={form.subsidiaryAccountNumber}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  subsidiaryAccountNumber: sanitizeAccountNumberInput(e.target.value),
                }))
              }
              className="h-11 rounded-xl font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Debited when cashback is credited to customers. Must start with 7000 (max 13 digits).
            </p>
          </div>

          <Button
            onClick={saveConfig}
            disabled={saving}
            className="rounded-xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save settings
          </Button>
        </CardContent>
      </Card>

      {form.mode === "ALL_CUSTOMERS" && (
        <Card className="rounded-2xl border-white/60 bg-white/85">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#5b371f]">All-customers rules</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <RuleField
              label="Cashback %"
              value={form.allCustomersPercent}
              onChange={(v) => setForm((p) => ({ ...p, allCustomersPercent: v }))}
            />
            <RuleField
              label="Min transaction amount"
              value={form.allCustomersMinAmount}
              onChange={(v) => setForm((p) => ({ ...p, allCustomersMinAmount: v }))}
            />
            <RuleField
              label="Max cashback amount"
              value={form.allCustomersMaxCashback}
              onChange={(v) => setForm((p) => ({ ...p, allCustomersMaxCashback: v }))}
            />
            <RuleField
              label="Threshold (payment must exceed)"
              value={form.allCustomersThreshold}
              onChange={(v) => setForm((p) => ({ ...p, allCustomersThreshold: v }))}
            />
          </CardContent>
        </Card>
      )}

      {form.mode === "CATEGORY_ELIGIBLE" && (
        <>
          <Card className="rounded-2xl border-white/60 bg-white/85">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-[#5b371f]">Cashback categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {config?.categories.map((cat) => (
                <CategoryRow key={cat.id} category={cat} onDelete={() => deleteCategory(cat.id)} />
              ))}
              {config?.categories.length === 0 && (
                <p className="text-sm text-muted-foreground">No categories yet. Add one below.</p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 border-t pt-4">
                <Input
                  placeholder="Category name (e.g. VIP)"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-10 rounded-xl"
                />
                <Input
                  placeholder="Percent"
                  value={categoryForm.percent}
                  onChange={(e) => setCategoryForm((p) => ({ ...p, percent: e.target.value }))}
                  className="h-10 rounded-xl"
                />
                <RuleField
                  label="Min amount"
                  value={categoryForm.minTransactionAmount}
                  onChange={(v) => setCategoryForm((p) => ({ ...p, minTransactionAmount: v }))}
                />
                <RuleField
                  label="Max cashback"
                  value={categoryForm.maxCashbackAmount}
                  onChange={(v) => setCategoryForm((p) => ({ ...p, maxCashbackAmount: v }))}
                />
                <RuleField
                  label="Threshold"
                  value={categoryForm.transactionThreshold}
                  onChange={(v) => setCategoryForm((p) => ({ ...p, transactionThreshold: v }))}
                />
              </div>
              <Button variant="outline" onClick={addCategory} className="rounded-xl">
                <Plus className="h-4 w-4 mr-2" /> Add category
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-white/60 bg-white/85">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base text-[#5b371f] flex items-center gap-2">
                <Users className="h-4 w-4" /> Eligible customers
              </CardTitle>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.txt"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleImport(f)
                    e.target.value = ""
                  }}
                />
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Import CSV/Excel
              </label>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Columns: phone, category, account (optional)
              </p>
              <div className="max-h-64 overflow-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Phone</th>
                      <th className="text-left p-2">Account</th>
                      <th className="text-left p-2">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligible.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2 font-mono">{row.phone}</td>
                        <td className="p-2 font-mono">{row.accountNumber ?? "—"}</td>
                        <td className="p-2">{row.categoryName}</td>
                      </tr>
                    ))}
                    {eligible.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-muted-foreground">
                          No eligible customers imported yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card className="rounded-2xl border-white/60 bg-white/85">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-[#5b371f] flex items-center gap-2">
            <History className="h-4 w-4" /> Cashback history & logs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{tx.paymentTransactionId}</p>
                  <p className="font-semibold text-[#5b371f]">
                    {tx.cashbackAmount.toFixed(2)} ETB @ {tx.cashbackPercent}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Payment: {tx.paymentAmount.toFixed(2)} · {tx.customerPhone ?? "—"}
                    {tx.categoryName ? ` · ${tx.categoryName}` : ""}
                  </p>
                </div>
                <StatusBadge status={tx.status} />
              </div>
              {tx.skipReason && (
                <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {tx.skipReason}
                </p>
              )}
              {tx.failureReason && (
                <p className="text-xs text-rose-600 mt-1">{tx.failureReason}</p>
              )}
              <button
                type="button"
                className="text-xs text-[#754319] mt-2 flex items-center gap-1"
                onClick={() => toggleLogs(tx.id)}
              >
                {expandedLogs[tx.id] ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Processing logs
              </button>
              {expandedLogs[tx.id] && (
                <ul className="mt-2 space-y-1 text-[10px] font-mono bg-slate-50 rounded-lg p-2">
                  {expandedLogs[tx.id].map((log) => (
                    <li key={log.id}>
                      <span className="text-slate-500">{log.level}</span> {log.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {transactions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No cashback transactions yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RuleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-xl"
      />
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
          {category.percent}% · min {category.minTransactionAmount}
          {category.maxCashbackAmount != null ? ` · max ${category.maxCashbackAmount}` : ""}
          {category.transactionThreshold != null ? ` · > ${category.transactionThreshold}` : ""}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {category.eligibleCount} eligible customers
        </p>
      </div>
      <Button variant="ghost" size="icon" onClick={onDelete} className="text-rose-600 shrink-0">
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
