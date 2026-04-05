"use client"

import { useState, useEffect } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
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
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import Link from "next/link"
import { 
  Activity, 
  Users, 
  ArrowUpRight, 
  AlertCircle, 
  BarChart3,
  Zap,
  Settings2,
  FileUp,
  Save,
  Clock,
  Search,
  Building2,
  User,
  Phone,
  FileCheck,
  Eye,
  TrendingUp,
  ShieldCheck,
  BadgeCheck,
  Shield,
  UserPlus,
  ChevronRight
} from "lucide-react"
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent,
  type ChartConfig 
} from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { useToast } from "@/hooks/use-toast"

const chartData = [
  { month: "Jan", volume: 45000 },
  { month: "Feb", volume: 52000 },
  { month: "Mar", volume: 48000 },
  { month: "Apr", volume: 61000 },
  { month: "May", volume: 59000 },
  { month: "Jun", volume: 72000 },
]

const chartConfig = {
  volume: {
    label: "Processing Volume",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig

export default function AdminDashboard() {
  const { toast } = useToast()
  const [merchants, setMerchants] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedMerchant, setSelectedMerchant] = useState<any | null>(null)
  const [config, setConfig] = useState({
    maxFileSizeMB: 5,
    allowedFileTypes: ".pdf, .jpg, .jpeg, .png",
    resetTimeoutSeconds: 60
  })

  useEffect(() => {
    async function fetchData() {
      const [mRes, cRes] = await Promise.all([
        fetch('/api/merchants'),
        fetch('/api/system-config')
      ]);
      if (mRes.ok) setMerchants(await mRes.json());
      if (cRes.ok) {
        const sysConfig = await cRes.json();
        setConfig({
          maxFileSizeMB: sysConfig.maxFileSizeMB,
          allowedFileTypes: Array.isArray(sysConfig.allowedFileTypes) ? sysConfig.allowedFileTypes.join(", ") : sysConfig.allowedFileTypes,
          resetTimeoutSeconds: sysConfig.resetTimeoutSeconds || 60
        });
      }
    }
    fetchData();
  }, [])

  const handleSaveConfig = async () => {
    const types = (config.allowedFileTypes || "").split(",").map(t => t.trim()).filter(t => t.startsWith("."))
    
    // In a real app, this would be a PATCH to /api/system-config
    toast({
      title: "Settings Applied",
      description: "System constraints have been updated in this session."
    })
  }

  const filteredMerchants = merchants.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500 gap-1"><BadgeCheck className="w-3 h-3" /> Approved</Badge>
      case 'branch_approved':
        return <Badge className="bg-blue-500 gap-1"><ShieldCheck className="w-3 h-3" /> Branch OK</Badge>
      case 'pending':
        return <Badge variant="outline" className="text-orange-500 border-orange-200 gap-1 bg-orange-50"><Clock className="w-3 h-3" /> Pending</Badge>
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Rejected</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
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
            <Building2 className="text-[#754319] w-5 h-5" />
            <h1 className="text-lg font-bold text-[#5b371f] font-headline tracking-tight">Merchant Management Dashboard</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="bg-white pb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg">Governance</CardTitle>
                  </div>
                  <CardDescription>Manage dynamic roles and granular staff permissions</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <Link href="/admin/roles">
                    <Button variant="outline" className="w-full justify-between group">
                      Manage System Roles
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="bg-white pb-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    <CardTitle className="text-lg">User Access</CardTitle>
                  </div>
                  <CardDescription>Provision and audit administrative user accounts</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <Link href="/admin/users">
                    <Button variant="outline" className="w-full justify-between group">
                      Manage Staff Accounts
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Volume (30d)</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">$1.24M</div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3 text-green-500" />
                    +18.4% from last period
                  </p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Merchants</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{merchants.length}</div>
                  <p className="text-xs text-muted-foreground">{merchants.filter(m => m.status === 'approved').length} Active</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
                  <Zap className="h-4 w-4 text-accent-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">99.98%</div>
                  <p className="text-xs text-muted-foreground text-green-500">Normal operations</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Approval Queue</CardTitle>
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{merchants.filter(m => m.status === 'pending' || m.status === 'branch_approved').length}</div>
                  <p className="text-xs text-muted-foreground">Across all stages</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Processing Insights</CardTitle>
                  <CardDescription>Transactional volume trends across the entire gateway.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
                    <BarChart data={chartData}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.1} />
                      <XAxis 
                        dataKey="month" 
                        tickLine={false} 
                        axisLine={false} 
                        tickMargin={10} 
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar 
                        dataKey="volume" 
                        fill="var(--color-volume)" 
                        radius={[4, 4, 0, 0]} 
                      />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-primary" />
                    <CardTitle>System Settings</CardTitle>
                  </div>
                  <CardDescription>Configure constraints and security.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxSize" className="flex items-center gap-2">
                      <FileUp className="w-4 h-4" /> Max File Size (MB)
                    </Label>
                    <Input 
                      id="maxSize" 
                      type="number" 
                      value={config.maxFileSizeMB}
                      onChange={(e) => setConfig({...config, maxFileSizeMB: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="allowedTypes">Allowed Extensions</Label>
                    <Input 
                      id="allowedTypes" 
                      placeholder=".pdf, .png, .jpg" 
                      value={config.allowedFileTypes}
                      onChange={(e) => setConfig({...config, allowedFileTypes: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="resetTimeout" className="flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Reset Expiry (Sec)
                    </Label>
                    <Input 
                      id="resetTimeout" 
                      type="number" 
                      value={config.resetTimeoutSeconds}
                      onChange={(e) => setConfig({...config, resetTimeoutSeconds: Number(e.target.value)})}
                    />
                    <p className="text-[10px] text-muted-foreground">Time window for password reset links.</p>
                  </div>
                  <Button className="w-full" onClick={handleSaveConfig}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Configuration
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Merchant Registry Section */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Merchant Registry</CardTitle>
                  <CardDescription>Comprehensive directory of all merchants and their current approval stage.</CardDescription>
                </div>
                <div className="relative w-72">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search registry..." 
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Transactions</TableHead>
                      <TableHead>Daily Limit</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Inspect</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMerchants.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{m.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase font-mono">{m.id}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs">{m.branchName}</span>
                            <span className="text-[10px] text-muted-foreground">{m.district}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {m._count?.transactions || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-medium">${m.dailyLimit.toLocaleString()}</span>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(m.status)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedMerchant(m)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Building2 className="w-5 h-5" /> {m.name} Details
                                </DialogTitle>
                                <DialogDescription>
                                  Registered on {new Date(m.createdAt).toLocaleDateString()} at {m.branchName} branch.
                                </DialogDescription>
                              </DialogHeader>
                              
                              <div className="grid grid-cols-2 gap-6 py-4">
                                <div className="space-y-4">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-muted-foreground">Merchant ID</Label>
                                    <p className="text-sm font-mono">{m.id}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-muted-foreground">Email & Phone</Label>
                                    <div className="flex flex-col gap-1">
                                      <p className="text-sm flex items-center gap-2"><User className="w-3 h-3" /> {m.email}</p>
                                      <p className="text-sm flex items-center gap-2"><Phone className="w-3 h-3" /> {m.contactPhone}</p>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-muted-foreground">Category</Label>
                                    <p className="text-sm">{m.category} - {m.businessType}</p>
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-muted-foreground">Current Status</Label>
                                    <div>{getStatusBadge(m.status)}</div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-muted-foreground">Transaction Volume</Label>
                                    <p className="text-sm font-bold">{m._count?.transactions || 0} processed</p>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-muted-foreground">Daily Limit</Label>
                                    <p className="text-sm font-bold text-green-600">${m.dailyLimit.toLocaleString()}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-slate-50 p-4 rounded-lg space-y-2 border border-slate-100">
                                <Label className="text-[10px] uppercase text-muted-foreground">Risk Factors</Label>
                                <div className="flex flex-wrap gap-2">
                                  {m.riskFactors && m.riskFactors.length > 0 ? (
                                    m.riskFactors.map((rf: string) => (
                                      <Badge key={rf} variant="destructive" className="text-[10px]">{rf}</Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <FileCheck className="w-3 h-3" /> No high-risk factors identified.
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button variant="outline">Close</Button>
                                {m.status === 'pending' && (
                                  <Link href="/checker">
                                    <Button className="bg-blue-600 hover:bg-blue-700">Review Application</Button>
                                  </Link>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
