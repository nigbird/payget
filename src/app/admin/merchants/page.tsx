"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  ArrowRight, 
  Clock, 
  Loader2, 
  Store,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Settings2,
  QrCode,
  AlertCircle
} from "lucide-react"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import type { Merchant } from "@/app/lib/db"

export default function MerchantManagementPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const userRole = (session?.user as any)?.role
  const userPermissions = (session?.user as any)?.permissions || []
  const canManage = userRole === 'ADMIN' || userPermissions.includes('qr.generation.manage')

  useEffect(() => {
    fetchMerchants()
  }, [])

  const fetchMerchants = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/merchants')
      if (response.ok) {
        const data = await response.json()
        setMerchants(data)
      }
    } catch (error) {
      console.error('Failed to fetch merchants:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredMerchants = merchants.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const totalPages = Math.ceil(filteredMerchants.length / itemsPerPage)
  const paginatedMerchants = filteredMerchants.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
      case 'APPROVED': 
        return <Badge className="bg-emerald-500 gap-1">Active</Badge>
      case 'PENDING': 
        return <Badge variant="outline" className="text-orange-500 border-orange-200 bg-orange-50 gap-1">Pending</Badge>
      case 'REJECTED': 
        return <Badge variant="destructive" className="gap-1">Rejected</Badge>
      default: 
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (!canManage) {
    return (
      <div className='flex h-[50vh] items-center justify-center'>
        <div className='text-center'>
          <AlertCircle className='mx-auto h-12 w-12 text-amber-500' />
          <h3 className='mt-4 text-lg font-semibold text-slate-900'>Permission Required</h3>
          <p className='mt-2 text-sm text-slate-600'>You don&apos;t have access to QR generation and merchant configuration.</p>
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

      <Card className="overflow-hidden rounded-2xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/10">
        <CardHeader className="bg-[#FFFDF7] border-b border-black/5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base tracking-tight">Merchant List</CardTitle>
              <CardDescription className="text-slate-600">
                Manage all registered merchants' QR codes.
              </CardDescription>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Search merchants..."
                  className="h-10 rounded-2xl border-black/10 bg-white pl-9 focus-visible:ring-2 focus-visible:ring-[#f8b513]/30"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Show</span>
                <Select 
                  value={String(itemsPerPage)} 
                  onValueChange={(val) => {
                    setItemsPerPage(Number(val))
                    setCurrentPage(1)
                  }}
                >
                  <SelectTrigger className="h-10 w-20 rounded-2xl border-black/10 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] hover:bg-white/95">
                <TableHead className="pl-6 py-4 text-xs font-semibold tracking-wide text-slate-700">Merchant</TableHead>
                <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Status</TableHead>
                <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">QR Config</TableHead>
                <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Joined Date</TableHead>
                <TableHead className="py-4 text-right pr-6 text-xs font-semibold tracking-wide text-slate-700">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedMerchants.map((m) => (
                <TableRow
                  key={m.id}
                  className="bg-[#FFFDF7] group transition-all duration-200 hover:bg-amber-50/40 hover:shadow-sm"
                >
                  <TableCell className="pl-6 py-5 align-middle">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center overflow-hidden">
                        {m.logoUrl ? (
                          <img src={m.logoUrl} alt={m.name} className="w-full h-full object-contain" />
                        ) : (
                          <Store className="w-5 h-5 text-amber-600" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-950">{m.name}</span>
                        <span className="text-[10px] font-mono text-slate-500 uppercase">{m.id}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-5 align-middle">{getStatusBadge(m.status)}</TableCell>
                  <TableCell className="py-5 align-middle">
                    {(m as any).qrEnabled ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 gap-1">
                        <QrCode className="w-3 h-3" /> Enabled
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400 border-slate-200 bg-slate-50 gap-1">
                        Disabled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-5 align-middle text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {new Date(m.createdAt).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell className="py-5 align-middle text-right pr-6">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-2xl border-black/10 bg-white hover:bg-amber-50/50 transition-colors gap-2"
                      onClick={() => router.push(`/admin/merchants/${m.id}/configuration`)}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      Configure <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {paginatedMerchants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                    No merchants found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-black/5 bg-amber-50/20">
            <div className="text-xs font-medium text-slate-500">
              Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * itemsPerPage, filteredMerchants.length)}</span> of <span className="text-slate-900 font-bold">{filteredMerchants.length}</span> results
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center px-3 h-8 rounded-xl border border-black/5 bg-white text-xs font-bold text-amber-900 shadow-sm">
                {currentPage} / {totalPages}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
