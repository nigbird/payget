"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { 
  Search, 
  Clock, 
  User, 
  FileText, 
  Filter, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Code2,
  Download
} from "lucide-react"
import { useSession } from "next-auth/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface AuditLog {
  id: string
  userId: string | null
  user: { id: string; name: string; email: string } | null
  action: string
  entityType: string
  entityId: string | null
  oldValue: any
  newValue: any
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

interface FilterOptions {
  actions: string[]
  entityTypes: string[]
}

export default function AuditLogsPage() {
  const { data: session } = useSession()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAction, setSelectedAction] = useState<string | undefined>(undefined)
  const [selectedEntityType, setSelectedEntityType] = useState<string | undefined>(undefined)
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [itemsPerPage] = useState(20)

  useEffect(() => {
    fetchData()
  }, [currentPage])

  const handleFilter = () => {
    setCurrentPage(1)
    fetchData()
  }

  const handleReset = () => {
    setSearchQuery("")
    setSelectedAction(undefined)
    setSelectedEntityType(undefined)
    setStartDate("")
    setEndDate("")
    setCurrentPage(1)
    fetchData()
  }

  async function fetchData() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", currentPage.toString())
      params.set("limit", itemsPerPage.toString())
      
      if (searchQuery) params.set("search", searchQuery)
      if (selectedAction) params.set("action", selectedAction)
      if (selectedEntityType) params.set("entityType", selectedEntityType)
      if (startDate) params.set("startDate", startDate)
      if (endDate) params.set("endDate", endDate)

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setTotal(data.total)
        setTotalPages(data.totalPages)
        setFilterOptions(data.filterOptions)
      }
    } catch (error) {
      console.error("Failed to fetch audit logs:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const openLogDetail = (log: AuditLog) => {
    setSelectedLog(log)
    setIsDetailDialogOpen(true)
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      params.set("export", "true")
      
      if (searchQuery) params.set("search", searchQuery)
      if (selectedAction) params.set("action", selectedAction)
      if (selectedEntityType) params.set("entityType", selectedEntityType)
      if (startDate) params.set("startDate", startDate)
      if (endDate) params.set("endDate", endDate)

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error("Failed to export audit logs:", error)
    }
  }

  const formatAction = (action: string) => {
    return action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
  }

  const getActionColor = (action: string) => {
    if (action.includes("CREATE")) return "bg-blue-50 text-blue-700"
    if (action.includes("UPDATE") || action.includes("EDIT")) return "bg-amber-50 text-amber-700"
    if (action.includes("DELETE") || action.includes("DEACTIVATE")) return "bg-rose-50 text-rose-700"
    if (action.includes("APPROVE")) return "bg-emerald-50 text-emerald-700"
    if (action.includes("REJECT")) return "bg-rose-50 text-rose-700"
    return "bg-slate-50 text-slate-700"
  }

  const userPermissions = (session?.user as any)?.permissions || []
  const canViewAuditLogs = userPermissions.includes("AUDIT_LOG_VIEW")

  if (!canViewAuditLogs) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
          <p className="text-slate-500">You don't have permission to view audit logs.</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-[#5b371f]">Audit Logs</h2>
          <p className="text-sm text-amber-800/60 font-medium">Comprehensive audit trail of all system activities.</p>
        </div>
        <Button 
          onClick={handleExport}
          className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all"
        >
          <Download className="w-4 h-4 mr-2" /> Export Logs
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/10">
        <CardHeader className="bg-[#FFFDF7] border-b border-black/5 p-6 pb-0">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
              <div className="flex-1 w-full md:w-auto">
                <Label className="text-xs font-medium text-slate-500 mb-2 block">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    placeholder="Search by action, entity, or user..."
                    className="h-10 rounded-2xl border-black/10 bg-white pl-9 focus-visible:ring-2 focus-visible:ring-[#f8b513]/30"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="w-full md:w-48">
                <Label className="text-xs font-medium text-slate-500 mb-2 block">Action</Label>
                <Select value={selectedAction} onValueChange={setSelectedAction}>
                  <SelectTrigger className="h-10 rounded-2xl border-black/10 bg-white">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {filterOptions?.actions.map((action) => (
                      <SelectItem key={action} value={action}>{formatAction(action)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-full md:w-48">
                <Label className="text-xs font-medium text-slate-500 mb-2 block">Entity Type</Label>
                <Select value={selectedEntityType} onValueChange={setSelectedEntityType}>
                  <SelectTrigger className="h-10 rounded-2xl border-black/10 bg-white">
                    <SelectValue placeholder="All entities" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {filterOptions?.entityTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
              <div className="w-full md:w-48">
                <Label className="text-xs font-medium text-slate-500 mb-2 block">Start Date</Label>
                <Input
                  type="date"
                  className="h-10 rounded-2xl border-black/10 bg-white"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              
              <div className="w-full md:w-48">
                <Label className="text-xs font-medium text-slate-500 mb-2 block">End Date</Label>
                <Input
                  type="date"
                  className="h-10 rounded-2xl border-black/10 bg-white"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleFilter}
                  className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all"
                >
                  <Filter className="w-4 h-4 mr-2" /> Apply Filters
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleReset}
                  className="h-10 rounded-2xl border-amber-200 text-amber-900 hover:bg-amber-50"
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] hover:bg-white/95">
                  <TableHead className="pl-6 py-4 text-xs font-semibold tracking-wide text-slate-700">Timestamp</TableHead>
                  <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">User</TableHead>
                  <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Action</TableHead>
                  <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Entity</TableHead>
                  <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">IP Address</TableHead>
                  <TableHead className="text-right pr-6 py-4 text-xs font-semibold tracking-wide text-slate-700">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="bg-[#FFFDF7] group transition-all duration-200 hover:bg-amber-50/40 hover:shadow-sm">
                    <TableCell className="pl-6 py-5 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-slate-900">
                          {new Date(log.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-5 align-middle">
                      {log.user ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold text-slate-900">{log.user.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{log.user.email}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">System</span>
                      )}
                    </TableCell>
                    <TableCell className="py-5 align-middle">
                      <Badge className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${getActionColor(log.action)}`}>
                        {formatAction(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-5 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-slate-800">{log.entityType}</span>
                        {log.entityId && (
                          <span className="text-[10px] text-slate-400 font-mono">{log.entityId.slice(0, 8)}...</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-5 align-middle">
                      <span className="text-xs text-slate-500 font-mono">{log.ipAddress || "-"}</span>
                    </TableCell>
                    <TableCell className="py-5 align-middle text-right pr-6">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-9 w-9 rounded-2xl text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => openLogDetail(log)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-slate-300" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">No audit logs found</p>
                          <p className="text-xs text-slate-500 mt-1">Try adjusting your search filters.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-black/5 bg-amber-50/20">
              <div className="text-xs font-medium text-slate-500">
                Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * itemsPerPage, total)}</span> of <span className="text-slate-900 font-bold">{total}</span> results
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                
                <div className="flex items-center gap-1 mx-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = currentPage
                    if (totalPages <= 5) pageNum = i + 1
                    else if (currentPage <= 3) pageNum = i + 1
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                    else pageNum = currentPage - 2 + i

                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        className={`h-8 min-w-[32px] rounded-2xl border-black/10 text-xs font-bold transition-all ${
                          currentPage === pageNum 
                            ? "bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white border-white/30 shadow-sm shadow-amber-950/15" 
                            : "bg-white text-slate-600 hover:bg-amber-50/50"
                        }`}
                        onClick={() => setCurrentPage(pageNum)}
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
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-[600px] border border-slate-100 bg-white p-0 rounded-2xl shadow-sm max-h-[80vh]">
          <DialogHeader className="p-6 border-b border-slate-50">
            <DialogTitle className="text-xl font-medium text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              Audit Log Details
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Complete details of the selected audit log entry.
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <ScrollArea className="max-h-[60vh]">
              <div className="grid gap-4 px-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500">Timestamp</Label>
                    <div className="text-sm text-slate-800">
                      {new Date(selectedLog.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500">Action</Label>
                    <Badge className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${getActionColor(selectedLog.action)}`}>
                      {formatAction(selectedLog.action)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-500">User</Label>
                  <div className="text-sm text-slate-800">
                    {selectedLog.user ? (
                      <>
                        <div className="font-semibold">{selectedLog.user.name}</div>
                        <div className="text-xs text-slate-500">{selectedLog.user.email}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">System</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500">Entity Type</Label>
                    <div className="text-sm text-slate-800">{selectedLog.entityType}</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500">Entity ID</Label>
                    <div className="text-sm font-mono text-slate-600">{selectedLog.entityId || "-"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500">IP Address</Label>
                    <div className="text-sm font-mono text-slate-600">{selectedLog.ipAddress || "-"}</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500">Log ID</Label>
                    <div className="text-sm font-mono text-slate-600">{selectedLog.id}</div>
                  </div>
                </div>

                {selectedLog.userAgent && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500">User Agent</Label>
                    <div className="text-xs text-slate-600 font-mono bg-slate-50 p-3 rounded-xl">
                      {selectedLog.userAgent}
                    </div>
                  </div>
                )}

                {selectedLog.oldValue && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                      <Code2 className="w-3.5 h-3.5" /> Old Value
                    </Label>
                    <pre className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl overflow-x-auto">
                      {JSON.stringify(selectedLog.oldValue, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.newValue && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                      <Code2 className="w-3.5 h-3.5" /> New Value
                    </Label>
                    <pre className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl overflow-x-auto">
                      {JSON.stringify(selectedLog.newValue, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
