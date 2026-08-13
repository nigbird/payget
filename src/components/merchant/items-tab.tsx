"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Plus, Trash2, Pencil, Check, X, Package, FolderPlus, Tag, Upload, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

type Props = { merchantId: string }

export type MerchantItemCategoryDto = { id: string; name: string; sortOrder: number; isActive: boolean }
export type MerchantItemDto = {
  id: string
  name: string
  price: number
  categoryId: string | null
  sortOrder: number
  isActive: boolean
}

const UNCATEGORIZED = "__uncategorized__"
const PRICE_PATTERN = /^\d{0,7}(\.\d{0,2})?$/

export function ItemsTab({ merchantId }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<MerchantItemCategoryDto[]>([])
  const [items, setItems] = useState<MerchantItemDto[]>([])

  const [newCategoryName, setNewCategoryName] = useState("")
  const [addingCategory, setAddingCategory] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)

  const [itemForm, setItemForm] = useState({ name: "", price: "", categoryId: UNCATEGORIZED })
  const [addingItem, setAddingItem] = useState(false)

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemForm, setEditItemForm] = useState({ name: "", price: "", categoryId: UNCATEGORIZED })
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/merchants/${merchantId}/items`)
      if (res.ok) {
        const data = await res.json()
        setCategories(data.categories ?? [])
        setItems(data.items ?? [])
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to load items" })
    } finally {
      setLoading(false)
    }
  }, [merchantId, toast])

  useEffect(() => {
    load()
  }, [load])

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    setAddingCategory(true)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/items/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to add category")
      setNewCategoryName("")
      await load()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to add category",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setAddingCategory(false)
    }
  }

  const handleDeleteCategory = async (categoryId: string) => {
    setDeletingCategoryId(categoryId)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/items/categories/${categoryId}`, {
        method: "DELETE",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to delete category")
      await load()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to delete category",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setDeletingCategoryId(null)
    }
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    const fd = new FormData()
    fd.append("file", file)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/items/import`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Import failed")
      const parts = [`${data.created} added`, `${data.updated} updated`]
      if (data.parseErrors?.length) parts.push(`${data.parseErrors.length} skipped`)
      toast({ title: "Import complete", description: parts.join(", ") })
      await load()
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

  const downloadTemplate = () => {
    const csv = "Item Name,Price,Category\nEspresso,70,Drinks\nBurger,250,Main Course\n"
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.setAttribute("hidden", "")
    a.setAttribute("href", url)
    a.setAttribute("download", "items_import_template.csv")
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  const handleAddItem = async () => {
    if (!itemForm.name.trim() || !itemForm.price) return
    setAddingItem(true)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: itemForm.name.trim(),
          price: Number(itemForm.price),
          categoryId: itemForm.categoryId === UNCATEGORIZED ? null : itemForm.categoryId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to add item")
      setItemForm((p) => ({ name: "", price: "", categoryId: p.categoryId }))
      await load()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to add item",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setAddingItem(false)
    }
  }

  const startEditItem = (item: MerchantItemDto) => {
    setEditingItemId(item.id)
    setEditItemForm({ name: item.name, price: String(item.price), categoryId: item.categoryId ?? UNCATEGORIZED })
  }

  const cancelEditItem = () => setEditingItemId(null)

  const handleSaveItem = async (itemId: string) => {
    if (!editItemForm.name.trim() || !editItemForm.price) return
    setSavingItemId(itemId)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editItemForm.name.trim(),
          price: Number(editItemForm.price),
          categoryId: editItemForm.categoryId === UNCATEGORIZED ? null : editItemForm.categoryId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to update item")
      setEditingItemId(null)
      await load()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to update item",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setSavingItemId(null)
    }
  }

  const handleToggleItemActive = async (item: MerchantItemDto) => {
    try {
      const res = await fetch(`/api/merchants/${merchantId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      })
      if (!res.ok) throw new Error("Failed")
      await load()
    } catch {
      toast({ variant: "destructive", title: "Failed to update item" })
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    setDeletingItemId(itemId)
    try {
      const res = await fetch(`/api/merchants/${merchantId}/items/${itemId}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to delete item")
      await load()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to delete item",
        description: e instanceof Error ? e.message : "Try again",
      })
    } finally {
      setDeletingItemId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const groups = [
    ...categories.map((c) => ({ category: c as MerchantItemCategoryDto | null, items: items.filter((i) => i.categoryId === c.id) })),
    { category: null, items: items.filter((i) => i.categoryId === null) },
  ]

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-white/60 bg-white/80 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg text-[#5b371f]">
              <Package className="h-5 w-5 text-[#754319]" />
              Items & Categories
            </CardTitle>
            <div className="flex items-center gap-2">
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
                variant="outline"
                size="sm"
                className="h-8 rounded-xl text-xs"
                onClick={downloadTemplate}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-xl text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                {importing ? "Importing..." : "Import"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-black/5 bg-slate-50/60 p-3">
            <div className="min-w-[180px] flex-1 space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                New category (optional)
              </Label>
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Drinks, Main Course"
                className="h-9 rounded-xl bg-white"
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAddCategory()
                  }
                }}
              />
            </div>
            <Button
              variant="outline"
              className="h-9 rounded-xl"
              onClick={handleAddCategory}
              disabled={addingCategory || !newCategoryName.trim()}
            >
              {addingCategory ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
              )}
              Add Category
            </Button>
          </div>

          <div className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3 sm:grid-cols-[1fr,120px,160px,auto]">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Item name</Label>
              <Input
                value={itemForm.name}
                onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Espresso"
                className="h-9 rounded-xl bg-white"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Price (ETB)</Label>
              <Input
                value={itemForm.price}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === "" || PRICE_PATTERN.test(val)) setItemForm((p) => ({ ...p, price: val }))
                }}
                placeholder="0.00"
                inputMode="decimal"
                className="h-9 rounded-xl bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</Label>
              <Select
                value={itemForm.categoryId}
                onValueChange={(v) => setItemForm((p) => ({ ...p, categoryId: v }))}
              >
                <SelectTrigger className="h-9 rounded-xl bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNCATEGORIZED}>No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleAddItem}
                disabled={addingItem || !itemForm.name.trim() || !itemForm.price}
                className="h-9 w-full rounded-xl border border-white/20 bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-sm shadow-amber-950/15 hover:opacity-95 sm:w-auto sm:px-4"
              >
                {addingItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {items.length === 0 && categories.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
              No items configured yet. Add one above — it&apos;s optional.
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(({ category, items: groupItems }) => {
                if (!category && groupItems.length === 0) return null
                return (
                  <div key={category?.id ?? "uncategorized"} className="overflow-hidden rounded-xl border border-black/5">
                    <div className="flex items-center justify-between gap-2 border-b border-black/5 bg-slate-50 px-4 py-2">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <Tag className="h-3.5 w-3.5" />
                        {category ? category.name : "Uncategorized"} ({groupItems.length})
                      </p>
                      {category && (
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          disabled={deletingCategoryId === category.id}
                          className="text-slate-300 transition-colors hover:text-rose-600"
                          aria-label={`Delete category ${category.name}`}
                        >
                          {deletingCategoryId === category.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                    {groupItems.length === 0 ? (
                      <div className="px-4 py-4 text-center text-xs text-muted-foreground">
                        No items in this category yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-black/5">
                        {groupItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                            {editingItemId === item.id ? (
                              <>
                                <div className="flex flex-1 flex-wrap items-center gap-2">
                                  <Input
                                    value={editItemForm.name}
                                    onChange={(e) => setEditItemForm((p) => ({ ...p, name: e.target.value }))}
                                    className="h-8 min-w-[120px] flex-1 rounded-lg text-sm"
                                    autoFocus
                                    maxLength={60}
                                  />
                                  <Input
                                    value={editItemForm.price}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      if (val === "" || PRICE_PATTERN.test(val)) {
                                        setEditItemForm((p) => ({ ...p, price: val }))
                                      }
                                    }}
                                    className="h-8 w-24 rounded-lg text-sm"
                                    inputMode="decimal"
                                  />
                                  <Select
                                    value={editItemForm.categoryId}
                                    onValueChange={(v) => setEditItemForm((p) => ({ ...p, categoryId: v }))}
                                  >
                                    <SelectTrigger className="h-8 w-36 rounded-lg text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={UNCATEGORIZED}>No category</SelectItem>
                                      {categories.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                          {c.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    onClick={() => handleSaveItem(item.id)}
                                    disabled={savingItemId === item.id || !editItemForm.name.trim() || !editItemForm.price}
                                    className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                                    aria-label="Save item"
                                  >
                                    {savingItemId === item.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={cancelEditItem}
                                    disabled={savingItemId === item.id}
                                    className="text-slate-400 hover:text-slate-600"
                                    aria-label="Cancel edit"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className={item.isActive ? "" : "text-slate-400 line-through"}>{item.name}</span>
                                  <span className="text-xs font-semibold text-[#754319]">
                                    ETB {item.price.toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                  <Switch checked={item.isActive} onCheckedChange={() => handleToggleItemActive(item)} />
                                  <button
                                    onClick={() => startEditItem(item)}
                                    className="text-slate-300 transition-colors hover:text-[#754319]"
                                    aria-label="Edit item"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    disabled={deletingItemId === item.id}
                                    className="text-slate-300 transition-colors hover:text-rose-600"
                                    aria-label="Delete item"
                                  >
                                    {deletingItemId === item.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
