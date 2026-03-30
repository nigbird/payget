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
  Activity, 
  Users, 
  ArrowUpRight, 
  AlertCircle, 
  BarChart3,
  Server,
  Zap,
  Settings2,
  FileUp,
  Save
} from "lucide-react"
import { 
  ChartContainer, 
  ChartTooltip, 
  ChartTooltipContent,
  type ChartConfig 
} from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { db } from "@/app/lib/db"
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
  const [config, setConfig] = useState({
    maxFileSizeMB: 5,
    allowedFileTypes: ".pdf, .jpg, .jpeg, .png"
  })

  useEffect(() => {
    const sysConfig = db.getSystemConfig()
    setConfig({
      maxFileSizeMB: sysConfig.maxFileSizeMB,
      allowedFileTypes: sysConfig.allowedFileTypes.join(", ")
    })
  }, [])

  const handleSaveConfig = () => {
    const types = config.allowedFileTypes.split(",").map(t => t.trim()).filter(t => t.startsWith("."))
    db.updateSystemConfig({
      maxFileSizeMB: Number(config.maxFileSizeMB),
      allowedFileTypes: types
    })
    toast({
      title: "Settings Updated",
      description: "Document upload constraints have been saved successfully."
    })
  }

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <Activity className="text-primary w-5 h-5" />
            <h1 className="text-lg font-semibold font-headline">Admin Oversight</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-muted/20">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* High-level System Stats */}
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
                  <div className="text-2xl font-bold">1,482</div>
                  <p className="text-xs text-muted-foreground">34 new this month</p>
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
                  <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">12</div>
                  <p className="text-xs text-muted-foreground">Require attention</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Volume Chart */}
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

              {/* System Config - Document Uploads */}
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-primary" />
                    <CardTitle>System Settings</CardTitle>
                  </div>
                  <CardDescription>Configure document upload rules.</CardDescription>
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
                    <p className="text-[10px] text-muted-foreground">Comma-separated starting with dot.</p>
                  </div>
                  <Button className="w-full" onClick={handleSaveConfig}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Configuration
                  </Button>
                  
                  <Separator className="my-4" />
                  
                  <div className="space-y-4">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Service Health</Label>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-muted-foreground" />
                          Storage Node
                        </span>
                        <Badge className="bg-green-500">Live</Badge>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 w-[92%]" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
