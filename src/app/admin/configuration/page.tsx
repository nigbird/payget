"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
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
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  Loader2,
  SlidersHorizontal,
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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type TabType = "branches" | "districts" | "categories" | "businessTypes"

interface MasterDataEntry {
  name: string
  code?: string
  active: boolean
  district?: string // For branches
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
    description: "Manage branch locations and map them to districts",
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
  const [selectedEntryIndex, setSelectedEntryIndex] = useState<number | null>(null)

  // Safety fix for Radix UI modal pointer-events lock issue
  useEffect(() => {
    if (!isAddDialogOpen && !isEditDialogOpen && !isImportDialogOpen) {
      const timer = setTimeout(() => {
        document.body.style.pointerEvents = "auto"
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isAddDialogOpen, isEditDialogOpen, isImportDialogOpen])

  const [formName, setFormName] = useState("")
  const [formCode, setFormCode] = useState("")
  const [formActive, setFormActive] = useState(true)
  const [formDistrict, setFormDistrict] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<MasterDataEntry[]>([])
  const [importErrors, setImportErrors] = useState<{ row: number; error: string }[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const resetImportState = () => {
    setIsDragging(false)
    setImportFile(null)
    setImportPreview([])
    setImportErrors([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const fetchMasterData = useCallback(async () => {
    try {
      const response = await fetch("/api/master-data")
      if (response.ok) {
        const data = await response.json()
        setMasterData({
          branches: (data.branches || []).map((item: any) =>
            typeof item === "string" ? { name: item, active: true } : { ...item, name: item.name || '' }
          ),
          districts: (data.districts || []).map((item: any) =>
            typeof item === "string" ? { name: item, active: true } : { ...item, name: item.name || '' }
          ),
          categories: (data.categories || []).map((item: any) =>
            typeof item === "string" ? { name: item, active: true } : { ...item, name: item.name || '' }
          ),
          businessTypes: (data.businessTypes || []).map((item: any) =>
            typeof item === "string" ? { name: item, active: true } : { ...item, name: item.name || '' }
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
          (item.name && item.name.toLowerCase().includes(query)) ||
          (item.code && item.code.toLowerCase().includes(query)) ||
          (item.district && item.district.toLowerCase().includes(query))
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
    setFormDistrict("")
    setIsAddDialogOpen(true)
  }

  const openEditDialog = (entry: MasterDataEntry, index: number) => {
    setSelectedEntryIndex(index)
    setFormName(entry.name)
    setFormCode(entry.code || "")
    setFormActive(entry.active)
    setFormDistrict(entry.district || "")
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
          district: activeTab === "branches" ? formDistrict : undefined,
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
    if (!formName.trim() || selectedEntryIndex === null) {
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
          id: (safePageIndex * PAGE_SIZE + selectedEntryIndex).toString(),
          name: formName.trim(),
          code: formCode.trim() || undefined,
          active: formActive,
          district: activeTab === "branches" ? formDistrict : undefined,
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

  const handleToggle = async (entry: MasterDataEntry, index: number) => {
    try {
      const realIndex = safePageIndex * PAGE_SIZE + index
      const response = await fetch("/api/master-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          action: "toggle",
          id: realIndex.toString(),
          active: !entry.active,
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

  const handleDelete = async (entry: MasterDataEntry, index: number) => {
    if (!confirm(`Are you sure you want to delete "${entry.name}"?`)) return

    try {
      const realIndex = safePageIndex * PAGE_SIZE + index
      const response = await fetch("/api/master-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab,
          action: "delete",
          id: realIndex.toString(),
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
    if (file) {
      processFile(file)
    }
    if (e.target) {
      e.target.value = ''
    }
  }

  const handleImportDialogOpenChange = (open: boolean) => {
    setIsImportDialogOpen(open)
    if (!open) {
      resetImportState()
    }
  }

  const processFile = async (file: File) => {
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
    reader.onload = async (e) => {
      try {
        let rows: unknown[][] = []
        if (file.name.toLowerCase().endsWith(".xlsx")) {
          const arrayBuffer = e.target?.result as ArrayBuffer
          const xlsxModule = await import('xlsx')
          const XLSX = (xlsxModule as any).default ?? xlsxModule
          const workbook = XLSX.read(arrayBuffer, { type: 'array' })
          const worksheet = workbook.Sheets[workbook.SheetNames[0]]
          rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false }) as unknown[][]
        } else {
          const text = e.target?.result as string
          rows = text
            .split(/\r?\n/)
            .filter((line) => line.trim())
            .map((line) => line.split(",").map((value) => value.trim()))
        }

        if (rows.length === 0) {
          toast({
            variant: "destructive",
            title: "Invalid Format",
            description: "Uploaded file does not contain any rows.",
          })
          return
        }

        const headers = (rows[0] || []).map((h) => String(h || '').trim().toLowerCase())
        const nameIndex = headers.findIndex((h) => h.includes("name"))
        const codeIndex = headers.findIndex((h) => h.includes("code"))

        if (nameIndex === -1) {
          toast({
            variant: "destructive",
            title: "Invalid Format",
            description: "File must have a 'Name' column.",
          })
          return
        }

        const entries: MasterDataEntry[] = []
        const errors: { row: number; error: string }[] = []

        for (let i = 1; i < rows.length; i++) {
          const values = Array.isArray(rows[i]) ? rows[i].map((v) => String(v ?? '').trim()) : []
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
      } catch (error) {
        console.error("Import parse error", error)
        toast({
          variant: "destructive",
          title: "Parse Error",
          description: "Could not parse the file. Please check the format.",
        })
      }
    }

    if (file.name.toLowerCase().endsWith(".xlsx")) {
      reader.readAsArrayBuffer(file)
    } else {
      reader.readAsText(file)
    }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-[#5b371f]">Master Data Config</h2>
          <p className="text-sm text-amber-800/60 font-medium">Manage dropdown values and organization hierarchy.</p>
        </div>
      </div>

      <Card className="overflow-hidden rounded-2xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/10">
        <CardHeader className="bg-[#FFFDF7] border-b border-black/5 p-6">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {(Object.keys(TAB_CONFIG) as TabType[]).map((tab) => {
                const config = TAB_CONFIG[tab]
                const Icon = config.icon
                const isActive = activeTab === tab
                return (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    className={cn(
                      "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all whitespace-nowrap border-2",
                      isActive
                        ? "bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] border-white/30 text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all translate-y-[-1px]"
                        : "bg-white border-black/5 text-slate-600 hover:bg-amber-50/50 hover:border-amber-200"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {config.label}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-base tracking-tight">{TAB_CONFIG[activeTab].label}</CardTitle>
                <CardDescription className="text-slate-600">{TAB_CONFIG[activeTab].description}</CardDescription>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    placeholder={`Search ${TAB_CONFIG[activeTab].label.toLowerCase()}...`}
                    className="h-10 rounded-2xl border-black/10 bg-white pl-9 focus-visible:ring-2 focus-visible:ring-[#f8b513]/30"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setPageIndex(0)
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={statusFilter}
                    onValueChange={(val) => {
                      setStatusFilter(val as any)
                      setPageIndex(0)
                    }}
                  >
                    <SelectTrigger className="h-10 w-32 rounded-2xl border-black/10 bg-white">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Button 
                    onClick={openAddDialog} 
                    className="h-10 rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all gap-2"
                  >
                    <Plus className="h-4 w-4" /> Add New
                  </Button>

                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-2xl border-black/10 bg-white">
                        <Upload className="h-4 w-4 text-slate-600" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl border-black/5 shadow-xl">
                      <DropdownMenuItem onClick={() => setIsImportDialogOpen(true)} className="gap-2 rounded-lg py-2.5">
                        <Upload className="h-4 w-4 text-blue-600" /> Bulk Import
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExport} className="gap-2 rounded-lg py-2.5">
                        <Download className="h-4 w-4 text-emerald-600" /> Export CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] hover:bg-white/95">
                  <TableHead className="pl-6 py-4 text-xs font-semibold tracking-wide text-slate-700">Name</TableHead>
                  {activeTab === "branches" && (
                    <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">District Mapping</TableHead>
                  )}
                  <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Code</TableHead>
                  <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Status</TableHead>
                  <TableHead className="text-right pr-6 py-4 text-xs font-semibold tracking-wide text-slate-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={activeTab === "branches" ? 5 : 4} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
                          <FileSpreadsheet className="h-6 w-6 text-slate-300" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">No entries found</p>
                          <p className="text-xs text-slate-500 mt-1">Start by adding your first {TAB_CONFIG[activeTab].label.slice(0, -1).toLowerCase()}.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map((item, index) => (
                    <TableRow key={`${item.name}-${index}`} className="bg-[#FFFDF7] group transition-all duration-200 hover:bg-amber-50/40 hover:shadow-sm">
                      <TableCell className="pl-6 py-5 align-middle">
                        <span className="font-semibold text-slate-950">{item.name}</span>
                      </TableCell>
                      {activeTab === "branches" && (
                        <TableCell className="py-5 align-middle">
                          {item.district ? (
                            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 w-fit px-2.5 py-1 rounded-lg border border-amber-100/50">
                              <MapPin className="w-3 h-3" /> {item.district}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium italic">Not mapped</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="py-5 align-middle">
                        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">{item.code || "—"}</span>
                      </TableCell>
                      <TableCell className="py-5 align-middle">
                        <Badge
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border-0",
                            item.active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {item.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-5 align-middle text-right pr-6">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-2xl text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                            onClick={() => openEditDialog(item, index)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-2xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            onClick={() => handleDelete(item, index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-9 w-9 rounded-2xl transition-colors",
                              item.active ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-50"
                            )}
                            onClick={() => handleToggle(item, index)}
                            title={item.active ? "Disable" : "Enable"}
                          >
                            <CheckCircle2 className={cn("h-4 w-4", item.active ? "fill-emerald-50" : "")} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-black/5 bg-amber-50/20">
              <div className="text-xs font-medium text-slate-500">
                Showing <span className="text-slate-900 font-bold">{safePageIndex * PAGE_SIZE + 1}</span> to <span className="text-slate-900 font-bold">{Math.min((safePageIndex + 1) * PAGE_SIZE, filteredData.length)}</span> of <span className="text-slate-900 font-bold">{filteredData.length}</span> results
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setPageIndex(0)}
                  disabled={safePageIndex === 0}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  disabled={safePageIndex === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                
                <div className="flex items-center gap-1 mx-1">
                  {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
                    let pageNum = safePageIndex + 1
                    if (pageCount <= 5) pageNum = i + 1
                    else if (safePageIndex <= 2) pageNum = i + 1
                    else if (safePageIndex >= pageCount - 3) pageNum = pageCount - 4 + i
                    else pageNum = safePageIndex - 1 + i

                    return (
                      <Button
                        key={pageNum}
                        variant={safePageIndex + 1 === pageNum ? "default" : "outline"}
                        size="sm"
                        className={`h-8 min-w-[32px] rounded-xl border-black/10 text-xs font-bold transition-all ${
                          safePageIndex + 1 === pageNum 
                            ? "bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-900/20" 
                            : "bg-white text-slate-600 hover:bg-amber-50/50"
                        }`}
                        onClick={() => setPageIndex(pageNum - 1)}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePageIndex >= pageCount - 1}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setPageIndex(pageCount - 1)}
                  disabled={safePageIndex >= pageCount - 1}
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px] border border-slate-100 bg-white p-0 rounded-2xl shadow-sm">
          <DialogHeader className="p-6 border-b border-slate-50">
            <DialogTitle className="text-xl font-medium text-slate-800">Add New {TAB_CONFIG[activeTab].label.slice(0, -1)}</DialogTitle>
            <DialogDescription className="text-slate-500">
              Create a new entry in the {TAB_CONFIG[activeTab].label.toLowerCase()} master list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 py-6">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-xs font-medium text-slate-500">Name *</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={`e.g., ${activeTab === 'branches' ? 'Downtown Branch' : 'Northern District'}`}
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm"
              />
            </div>
            
            {activeTab === "branches" && (
              <div className="grid gap-2">
                <Label htmlFor="district" className="text-xs font-medium text-slate-500">District Mapping *</Label>
                <Select value={formDistrict} onValueChange={setFormDistrict}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-slate-200 shadow-sm bg-white">
                    <SelectValue placeholder="Select a district" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 bg-white">
                    {masterData.districts.filter(d => d.active).map((district) => (
                      <SelectItem key={district.name} value={district.name} className="rounded-lg">
                        {district.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-amber-600 font-medium ml-1">Connect this branch to a geographical district.</p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="code" className="text-xs font-medium text-slate-500">Code (Optional)</Label>
              <Input
                id="code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g., BR-001"
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm"
              />
            </div>
          </div>
          <DialogFooter className="pt-2 px-6 pb-6">
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50 h-11">
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={isSubmitting}
              className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-11 px-6"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px] border border-slate-100 bg-white p-0 rounded-2xl shadow-sm">
          <DialogHeader className="p-6 border-b border-slate-50">
            <DialogTitle className="text-xl font-medium text-slate-800">Edit {TAB_CONFIG[activeTab].label.slice(0, -1)}</DialogTitle>
            <DialogDescription className="text-slate-500">Update master data entry details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 py-6">
            <div className="grid gap-2">
              <Label htmlFor="edit-name" className="text-xs font-medium text-slate-500">Name *</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm"
              />
            </div>

            {activeTab === "branches" && (
              <div className="grid gap-2">
                <Label htmlFor="edit-district" className="text-xs font-medium text-slate-500">District Mapping *</Label>
                <Select value={formDistrict} onValueChange={setFormDistrict}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-slate-200 shadow-sm bg-white">
                    <SelectValue placeholder="Select a district" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 bg-white">
                    {masterData.districts.filter(d => d.active).map((district) => (
                      <SelectItem key={district.name} value={district.name} className="rounded-lg">
                        {district.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="edit-code" className="text-xs font-medium text-slate-500">Code (Optional)</Label>
              <Input
                id="edit-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 shadow-sm mt-2">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-slate-800">Active Status</Label>
                <div className="text-[10px] text-slate-500">Enable or disable this entry system-wide.</div>
              </div>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>
          <DialogFooter className="pt-2 px-6 pb-6">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50 h-11">
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={isSubmitting}
              className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-11 px-6"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={handleImportDialogOpenChange}>
        <DialogContent className="sm:max-w-[600px] border border-slate-100 bg-white p-0 rounded-2xl shadow-sm">
          <DialogHeader className="p-6 border-b border-slate-50">
            <DialogTitle className="text-xl font-medium text-slate-800">Bulk Import {TAB_CONFIG[activeTab].label}</DialogTitle>
            <DialogDescription className="text-slate-500">
              Upload a CSV or Excel file to bulk import entries. Required column: Name
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 px-6 py-6">
            <div
              className={cn(
                "border-2 border-dashed rounded-2xl p-10 text-center transition-all",
                isDragging ? "border-amber-500 bg-amber-50/50" : "border-slate-200 hover:border-amber-200 hover:bg-slate-50/50"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx" onChange={handleFileSelect} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-3xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-400 group-hover:text-amber-500 transition-colors">
                  <FileSpreadsheet className="h-8 w-8" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">
                    {importFile ? importFile.name : "Drop your file here or click to browse"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1.5 font-medium">Supports CSV and Excel files (.csv, .xlsx)</p>
                </div>
              </label>
            </div>

            {importFile && (
              <div className="flex items-center justify-between rounded-xl bg-amber-50/50 border border-amber-100 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                    <FileSpreadsheet className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">{importFile.name}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">{(importFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setImportFile(null); setImportPreview([]); setImportErrors([]) }} className="rounded-xl hover:bg-rose-50 hover:text-rose-600">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {importPreview.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Preview ({importPreview.length} entries)
                  </h4>
                  <button
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
                    className="text-[10px] font-bold uppercase tracking-widest text-amber-600 hover:text-amber-700 transition-colors"
                  >
                    Download Template
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-black/5 bg-white shadow-inner">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                        <TableHead className="text-[10px] font-bold uppercase">Name</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase">Code</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.slice(0, 10).map((entry, i) => (
                        <TableRow key={i} className="hover:bg-slate-50/30">
                          <TableCell className="text-xs font-medium text-slate-800">{entry.name}</TableCell>
                          <TableCell className="text-[10px] font-mono font-bold text-slate-500 uppercase">{entry.code || "—"}</TableCell>
                        </TableRow>
                      ))}
                      {importPreview.length > 10 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-4 text-[10px] font-bold uppercase text-slate-400 bg-slate-50/20">
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {importErrors.length} Errors detected
                </h4>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-rose-100 bg-rose-50/50 p-4 space-y-2">
                  {importErrors.map((err, i) => (
                    <p key={i} className="text-[10px] text-rose-700 font-medium">
                      Row {err.row}: <span className="font-bold">{err.error}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button variant="outline" onClick={() => { setIsImportDialogOpen(false); setImportFile(null); setImportPreview([]); setImportErrors([]) }} className="rounded-xl border-slate-200 h-11">
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={isImporting || importPreview.length === 0}
              className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-11 px-6"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" /> Import {importPreview.length} Entries
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
