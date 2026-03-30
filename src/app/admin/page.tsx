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
import { 
  Activity, 
  Users, 
  ArrowUpRight, 
  AlertCircle, 
  BarChart3,
  Server,
  Zap,
  Settings2,
  FileUp,
  Save,
  Clock,
  Search,
  Building2,
  User,
  Phone,
  MapPin,
  Link as LinkIcon,
  FileCheck,
  Eye,
  CreditCard,
  ShieldAlert,
  Hash,
  TrendingUp,
  ShieldCheck,
  BadgeCheck
} from "lucide-react"
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent,
  type ChartConfig 
} from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { db, type Merchant } from "@/app/lib/db"
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
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [config, setConfig] = useState({
    maxFileSizeMB: 5,
    allowedFileTypes: ".pdf, .jpg, .jpeg, .png",
    resetTimeoutSeconds: 60
  })

  useEffect(() => {
    const sysConfig = db.getSystemConfig()
    setMerchants(db.getMerchants())
    setConfig({
      maxFileSizeMB: sysConfig.maxFileSizeMB,
      allowedFileTypes: sysConfig.allowedFileTypes.join(", "),
      resetTimeoutSeconds: sysConfig.resetTimeoutSeconds || 60
    })
  }, [])

  const handleSaveConfig = () => {
    const types = config.allowedFileTypes.split(",").map(t => t.trim()).filter(t => t.startsWith("."))
    db.updateSystemConfig({
      maxFileSizeMB: Number(config.maxFileSizeMB),
      allowedFileTypes: types,
      resetTimeoutSeconds: Number(config.resetTimeoutSeconds)
    })
    toast({
      title: "Settings Updated",
      description: "System constraints and security settings have been saved successfully."
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
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 sticky top-0 bg-background/95 backdrop-blur z-50">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <Activity className="text-primary w-5 h-5" />
            <h1 className="text-lg font-semibold font-headline">Admin Oversight</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-muted/20">
          <div className="max-w-7xl mx-auto space-y-6">
            
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
                      <TableHead>Daily Limit</TableHead>
                      <TableHead>Tx Count Limit</TableHead>
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
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{m.id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col">
                            <span>{m.district}</span>
                            <span className="text-muted-foreground">{m.branchName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-semibold">
                          ${m.dailyLimit.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.dailyCountLimit || 'N/A'}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(m.status)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => setSelectedMerchant(m)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Building2 className="w-5 h-5 text-primary" />
                                  Merchant Profile: {selectedMerchant?.name}
                                </DialogTitle>
                                <DialogDescription>
                                  Detailed business and compliance information.
                                </DialogDescription>
                              </DialogHeader>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
                                <div className="space-y-6">
                                  <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                                      <Building2 className="w-3 h-3" /> Business Details
                                    </h4>
                                    <div className="grid gap-2 text-sm">
                                      <div className="flex justify-between border-b pb-1">
                                        <span className="text-muted-foreground">Legal Name:</span>
                                        <span className="font-medium">{selectedMerchant?.name}</span>
                                      </div>
                                      <div className="flex justify-between border-b pb-1">
                                        <span className="text-muted-foreground">Type:</span>
                                        <span>{selectedMerchant?.businessType}</span>
                                      </div>
                                      <div className="flex justify-between border-b pb-1">
                                        <span className="text-muted-foreground">Category:</span>
                                        <span>{selectedMerchant?.category}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-3 p-4 bg-muted/20 rounded-lg border border-primary/10">
                                    <h4 className="text-xs font-bold uppercase text-primary flex items-center gap-2">
                                      <TrendingUp className="w-3 h-3" /> Configured Constraints
                                    </h4>
                                    <div className="grid gap-2 text-sm">
                                      <div className="flex justify-between border-b pb-1 border-primary/10">
                                        <span className="text-muted-foreground">Daily Max ($):</span>
                                        <span className="font-bold">${selectedMerchant?.dailyLimit.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between border-b pb-1 border-primary/10">
                                        <span className="text-muted-foreground">Per Tx Max ($):</span>
                                        <span className="font-bold">${selectedMerchant?.transactionLimit.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between border-b pb-1 border-primary/10">
                                        <span className="text-muted-foreground">Daily Max (Count):</span>
                                        <span className="font-bold">{selectedMerchant?.dailyCountLimit}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-6">
                                  <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                                      <User className="w-3 h-3" /> Contact Person
                                    </h4>
                                    <div className="grid gap-2 text-sm">
                                      <div className="flex justify-between border-b pb-1">
                                        <span className="text-muted-foreground">Name:</span>
                                        <span className="font-medium">{selectedMerchant?.contactName}</span>
                                      </div>
                                      <div className="flex justify-between border-b pb-1">
                                        <span className="text-muted-foreground">Email:</span>
                                        <span>{selectedMerchant?.email}</span>
                                      </div>
                                      <div className="flex justify-between border-b pb-1">
                                        <span className="text-muted-foreground">Phone:</span>
                                        <span>{selectedMerchant?.contactPhone}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                                      <FileCheck className="w-3 h-3" /> Compliance Vault
                                    </h4>
                                    <div className="space-y-2">
                                      {selectedMerchant?.documents.map((doc) => (
                                        <div key={doc.id} className="flex items-center justify-between p-2 rounded bg-muted/30 border">
                                          <div className="flex items-center gap-2">
                                            <FileCheck className="w-3 h-3 text-primary shrink-0" />
                                            <span className="text-[10px] truncate">{doc.name}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
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
