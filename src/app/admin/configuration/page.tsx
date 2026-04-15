"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  Building2,
  MapPin,
  Briefcase,
  Tag,
  Plus,
  Search,
  Edit2,
  Trash2,
  Download,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type TabType = "branches" | "districts" | "categories" | "businessTypes"

interface MasterDataEntry {
  name: string
  code?: string
  active: boolean
}

type MasterData = {
  branches: MasterDataEntry[]
  districts: MasterDataEntry[]
  categories: MasterDataEntry[]
  businessTypes: MasterDataEntry[]
}

const TAB_CONFIG: Record<TabType, { label: string; icon: typeof Building2; description: string }> = {
  branches: {
    label: "Branches",
    icon: Building2,
    description: "Manage branch locations for your organization",
  },
  districts: {
    label: "Districts",
    icon: MapPin,
    description: "Configure district/region master data",
  },
  categories: {
    label: "Industry Categories",
    icon: Tag,
    description: "Set up merchant industry categories",
  },
  businessTypes: {
    label: "Business Types",
    icon: Briefcase,
    description: "Define business type classifications",
  },
}

const PAGE_SIZE = 10

export default function MasterDataConfigPage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabType>("branches")
  const [masterData, setMasterData] = useState<MasterData>({
    branches: [],
    districts: [],
    categories: [],
    businessTypes: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [pageIndex, setPageIndex] = useState(0)

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<MasterDataEntry | null>(null)

  const [formName, setFormName] = useState("")
  const [formCode, setFormCode] = useState("")
  const [formActive, setFormActive] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<MasterDataEntry[]>([])
  const [importErrors, setImportErrors] = useState<{ row: number; error: string }[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const fetchMasterData = useCallback(async () => {
    try {
      const response = await fetch("/api/master-data")
      if (response.ok) {
        const data = await response.json()
        setMasterData({
          branches: (data.branches || []).map((item: any) =>
            typeof item === "string" ? { name: item, active: true } : item
          ),
          districts: (data.districts || []).map((item: any) =>
            typeof item === "string" ? { name: item, active: true } : item
          ),
          categories: (data.categories || []).map((item: any) =>
            typeof item === "string" ? { name: item, active: true } : item
          ),
          businessTypes: (data.businessTypes || []).map((item: any) =>
            typeof item === "string" ? { name: item, active: true } : item
          ),
        })
      }
    } catch (error) {
      console.error("Failed to fetch master data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMasterData()
  }, [fetchMasterData])

  const currentData = masterData[activeTab]

  const filteredData = useMemo(() => {
    let data = [...currentData]

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      data = data.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          (item.code && item.code.toLowerCase().includes(query))
      )
    }

    if (statusFilter === "active") {
      data = data.filter((item) => item.active)
    } else if (statusFilter === "inactive") {
      data = data.filter((item) => !item.active)
    }

    return data
  }, [currentData, searchQuery, statusFilter])

  const pageCount = Math.ceil(filteredData.length / PAGE_SIZE)
  const safePageIndex = Math.min(Math.max(0, pageIndex), pageCount - 1)
  const paginatedData = filteredData.slice(
    safePageIndex * PAGE_SIZE,
    (safePageIndex + 1) * PAGE_SIZE
  )

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    setSearchQuery("")
    setStatusFilter("all")
    setPageIndex(0)
  }

  const openAddDialog = () => {
    setFormName("")
    setFormCode("")
    setFormActive(true)
    setIsAddDialogOpen(true)
  }

  const openEditDialog = (entry: MasterDataEntry) => {
    setSelectedEntry(entry)
    setFormName(entry.name)
    setFormCode(entry.code || "")
    setFormActive(entry.active)
    setIsEditDialogOpen(true)
  }

  const handleAdd = async () => {
    if (!formName.trim()) {
      toast({ variant: "destructive", title: "Validation Error", description: "Name is required" })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/master-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          action: "add",
          name: formName.trim(),
          code: formCode.trim() || undefined,
        }),
      })

      const data = await response.json()
      if (response.ok && data.success) {
        toast({ title: "Success", description: `${TAB_CONFIG[activeTab].label.slice(0, -1)} added successfully` })
        setIsAddDialogOpen(false)
        fetchMasterData()
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error || "Failed to add entry" })
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!formName.trim() || !selectedEntry) {
      toast({ variant: "destructive", title: "Validation Error", description: "Name is required" })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/master-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          action: "update",
          name: selectedEntry.name,
          newName: formName.trim(),
          code: formCode.trim() || undefined,
          active: formActive,
        }),
      })

      const data = await response.json()
      if (response.ok && data.success) {
        toast({ title: "Success", description: "Entry updated successfully" })
        setIsEditDialogOpen(false)
        fetchMasterData()
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error || "Failed to update entry" })
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggle = async (entry: MasterDataEntry) => {
    try {
      const response = await fetch("/api/master-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          action: "toggle",
          name: entry.name,
        }),
      })

      const data = await response.json()
      if (response.ok && data.success) {
        toast({
          title: entry.active ? "Disabled" : "Enabled",
          description: `${entry.name} is now ${entry.active ? "inactive" : "active"}`,
        })
        fetchMasterData()
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error || "Failed to update status" })
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred" })
    }
  }

  const handleDelete = async (entry: MasterDataEntry) => {
    if (!confirm(`Are you sure you want to delete "${entry.name}"?`)) return

    try {
      const response = await fetch("/api/master-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          action: "delete",
          name: entry.name,
        }),
      })

      const data = await response.json()
      if (response.ok && data.success) {
        toast({ title: "Deleted", description: `${entry.name} has been removed` })
        fetchMasterData()
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error || "Failed to delete entry" })
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred" })
    }
  }

  const handleExport = () => {
    const headers = ["Name", "Code", "Status"]
    const rows = filteredData.map((item) => [
      item.name,
      item.code || "",
      item.active ? "Active" : "Inactive",
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${activeTab}-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)

    toast({ title: "Export Complete", description: `${filteredData.length} rows exported to CSV` })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const processFile = (file: File) => {
    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]
    if (!validTypes.includes(file.type) && !file.name.endsWith(".csv") && !file.name.endsWith(".xlsx")) {
      toast({
        variant: "destructive",
        title: "Invalid File",
        description: "Please upload a CSV or Excel file (.csv, .xlsx)",
      })
      return
    }

    setImportFile(file)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split("\n").filter((line) => line.trim())
        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())

        const nameIndex = headers.findIndex((h) => h.includes("name"))
        const codeIndex = headers.findIndex((h) => h.includes("code"))

        if (nameIndex === -1) {
          toast({
            variant: "destructive",
            title: "Invalid Format",
            description: "CSV must have a 'Name' column",
          })
          return
        }

        const entries: MasterDataEntry[] = []
        const errors: { row: number; error: string }[] = []

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map((v) => v.trim())
          const name = values[nameIndex]?.replace(/^"|"$/g, "")

          if (!name) {
            errors.push({ row: i + 1, error: "Missing name" })
            continue
          }

          entries.push({
            name,
            code: codeIndex >= 0 ? values[codeIndex]?.replace(/^"|"$/g, "") : undefined,
            active: true,
          })
        }

        setImportPreview(entries)
        setImportErrors(errors)
      } catch {
        toast({
          variant: "destructive",
          title: "Parse Error",
          description: "Could not parse the file. Please check the format.",
        })
      }
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (importPreview.length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "No valid entries to import" })
      return
    }

    setIsImporting(true)
    try {
      const response = await fetch("/api/master-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          entries: importPreview,
        }),
      })

      const data = await response.json()
      if (response.ok && data.success) {
        toast({
          title: "Import Complete",
          description: `${data.imported} entries imported. ${data.skipped?.length || 0} skipped.`,
        })
        setIsImportDialogOpen(false)
        setImportFile(null)
        setImportPreview([])
        setImportErrors([])
        fetchMasterData()
      } else {
        toast({ variant: "destructive", title: "Error", description: data.error || "Import failed" })
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred" })
    } finally {
      setIsImporting(false)
    }
  }

  const activeCount = currentData.filter((item) => item.active).length
  const inactiveCount = currentData.filter((item) => !item.active).length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Master Data Configuration</h2>
          <p className="text-sm text-slate-600">Manage dropdown values used across the system</p>
        </div>
      </div>

      <Card className="border-[#F1E7D0] shadow-sm">
        <CardHeader className="pb-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {(Object.keys(TAB_CONFIG) as TabType[]).map((tab) => {
              const config = TAB_CONFIG[tab]
              const Icon = config.icon
              const isActive = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap",
                    isActive
                      ? "bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-md shadow-amber-900/20"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {config.label}
                </button>
              )
            })}
          </div>
          <CardDescription className="mt-2 px-1">{TAB_CONFIG[activeTab].description}</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder={`Search ${TAB_CONFIG[activeTab].label.toLowerCase()}...`}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setPageIndex(0)
                  }}
                  className="pl-9 rounded-xl border-[#F1E7D0] bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as "all" | "active" | "inactive")
                    setPageIndex(0)
                  }}
                  className="h-10 rounded-xl border border-[#F1E7D0] bg-white px-3 text-sm text-slate-700"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <Button variant="outline" onClick={openAddDialog} className="gap-2 rounded-xl">
                  <Plus className="h-4 w-4" /> Add New
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-xl">
                      <Upload className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setIsImportDialogOpen(true)} className="gap-2">
                      <Upload className="h-4 w-4" /> Import CSV/Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExport} className="gap-2">
                      <Download className="h-4 w-4" /> Export CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-600">{activeCount} Active</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <span className="text-slate-600">{inactiveCount} Inactive</span>
              </div>
              <span className="text-slate-400 ml-auto">{filteredData.length} total</span>
            </div>

            <div className="rounded-xl border border-[#F1E7D0] bg-white overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="pl-6 w-1/3">Name</TableHead>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-24 text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-slate-500">
                        <div className="flex flex-col items-center gap-2">
                          <FileSpreadsheet className="h-8 w-8 text-slate-300" />
                          <p>No {TAB_CONFIG[activeTab].label.toLowerCase()} found</p>
                          <Button variant="outline" size="sm" onClick={openAddDialog} className="mt-2 gap-2">
                            <Plus className="h-4 w-4" /> Add First Entry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedData.map((item, index) => (
                      <TableRow key={`${item.name}-${index}`} className="group">
                        <TableCell className="pl-6">
                          <span className="font-medium text-slate-900">{item.name}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-slate-500 font-mono text-sm">{item.code || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full text-[10px] font-bold uppercase tracking-wider",
                              item.active
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-50 text-slate-500"
                            )}
                          >
                            {item.active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-6">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg hover:bg-slate-100"
                              onClick={() => openEditDialog(item)}
                            >
                              <Edit2 className="h-3.5 w-3.5 text-slate-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg hover:bg-red-50"
                              onClick={() => handleDelete(item)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg hover:bg-amber-50"
                              onClick={() => handleToggle(item)}
                              title={item.active ? "Disable" : "Enable"}
                            >
                              <div
                                className={cn(
                                  "h-3.5 w-3.5 rounded-sm border-2",
                                  item.active ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white"
                                )}
                              >
                                {item.active && <CheckCircle2 className="h-3 w-3 text-white" />}
                              </div>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  Page {safePageIndex + 1} of {pageCount}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                    disabled={safePageIndex === 0}
                    className="rounded-xl gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={safePageIndex >= pageCount - 1}
                    className="rounded-xl gap-1"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New {TAB_CONFIG[activeTab].label.slice(0, -1)}</DialogTitle>
            <DialogDescription>
              Add a new entry to the {TAB_CONFIG[activeTab].label.toLowerCase()} list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={`Enter ${TAB_CONFIG[activeTab].label.slice(0, -1).toLowerCase()} name`}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Code (Optional)</Label>
              <Input
                id="code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g., HQ, DIST-01"
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={isSubmitting}
              className="rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] hover:from-[#f8b513]/90 hover:to-[#754319]/90"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
            <DialogDescription>Update the details for this entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-code">Code (Optional)</Label>
              <Input
                id="edit-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-active">Active Status</Label>
              <Switch id="edit-active" checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={isSubmitting}
              className="rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] hover:from-[#f8b513]/90 hover:to-[#754319]/90"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Import {TAB_CONFIG[activeTab].label}</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file to bulk import entries. Required column: Name
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 text-center transition-colors",
                isDragging ? "border-[#f8b513] bg-amber-50/50" : "border-slate-200 hover:border-slate-300"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input type="file" accept=".csv,.xlsx" onChange={handleFileSelect} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <FileSpreadsheet className="h-6 w-6 text-slate-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {importFile ? importFile.name : "Drop your file here or click to browse"}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Supports CSV and Excel files (.csv, .xlsx)</p>
                </div>
              </label>
            </div>

            {importFile && (
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  <span className="text-sm font-medium">{importFile.name}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setImportFile(null); setImportPreview([]); setImportErrors([]) }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {importPreview.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Preview ({importPreview.length} entries)</h4>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      const template = "Name,Code\nSample Entry,CODE-01"
                      const blob = new Blob([template], { type: "text/csv" })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement("a")
                      a.href = url
                      a.download = `${activeTab}-template.csv`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Download Template
                  </a>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-[#F1E7D0]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead>Name</TableHead>
                        <TableHead>Code</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.slice(0, 10).map((entry, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{entry.name}</TableCell>
                          <TableCell className="text-sm text-slate-500">{entry.code || "—"}</TableCell>
                        </TableRow>
                      ))}
                      {importPreview.length > 10 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-sm text-slate-500">
                            ...and {importPreview.length - 10} more entries
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {importErrors.length} Errors
                </h4>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-red-100 bg-red-50 p-3 space-y-1">
                  {importErrors.map((err, i) => (
                    <p key={i} className="text-xs text-red-700">
                      Row {err.row}: {err.error}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsImportDialogOpen(false); setImportFile(null); setImportPreview([]); setImportErrors([]) }} className="rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={isImporting || importPreview.length === 0}
              className="rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] hover:from-[#f8b513]/90 hover:to-[#754319]/90"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Import {importPreview.length} Entries
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}