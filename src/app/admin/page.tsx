"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Clock,
  FileUp,
  Settings2,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

type SystemConfigState = {
  maxFileSizeMB: number
  allowedFileTypes: string
  resetTimeoutSeconds: number
  requireTwoFactor: boolean
  maintenanceMode: boolean
}

const insightData = [
  { month: "Jan", volume: 45000 },
  { month: "Feb", volume: 52000 },
  { month: "Mar", volume: 48000 },
  { month: "Apr", volume: 61000 },
  { month: "May", volume: 59000 },
  { month: "Jun", volume: 72000 },
  { month: "Jul", volume: 68000 },
]

function MetricCard({
  title,
  value,
  hint,
  trend,
  icon,
}: {
  title: string
  value: string
  hint: string
  trend?: { direction: "up" | "down"; label: string }
  icon: React.ReactNode
}) {
  const TrendIcon = trend?.direction === "down" ? ArrowDownRight : ArrowUpRight
  const trendColor =
    trend?.direction === "down" ? "text-rose-600" : "text-emerald-600"

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-white/30 bg-white/45 backdrop-blur-xl",
        "rounded-2xl shadow-sm shadow-amber-950/10",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md hover:shadow-amber-950/15"
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(350px_120px_at_20%_0%,rgba(248,181,19,0.22),transparent_60%)]" />
      <CardHeader className="relative flex flex-row items-start justify-between gap-3 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-xs font-semibold tracking-wide text-slate-700">
            {title}
          </CardTitle>
          <div className="text-2xl font-semibold tracking-tight text-slate-950">
            {value}
          </div>
        </div>
        <div className="rounded-2xl border border-white/30 bg-white/40 p-2 text-slate-700 shadow-sm shadow-amber-950/5">
          {icon}
        </div>
      </CardHeader>
      <CardContent className="relative pt-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">{hint}</div>
          {trend ? (
            <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
              <TrendIcon className="h-3.5 w-3.5" />
              {trend.label}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminDashboard() {
  const { toast } = useToast()
  const { data: session } = useSession()

  const [merchants, setMerchants] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [config, setConfig] = useState<SystemConfigState>({
    maxFileSizeMB: 5,
    allowedFileTypes: ".pdf, .jpg, .jpeg, .png",
    resetTimeoutSeconds: 60,
    requireTwoFactor: true,
    maintenanceMode: false,
  })

  useEffect(() => {
    async function fetchData() {
      const [mRes, cRes] = await Promise.all([fetch("/api/merchants"), fetch("/api/system-config")])
      if (mRes.ok) setMerchants(await mRes.json())
      if (cRes.ok) {
        const sysConfig = await cRes.json()
        setConfig((prev) => ({
          ...prev,
          maxFileSizeMB: Number(sysConfig.maxFileSizeMB ?? prev.maxFileSizeMB),
          allowedFileTypes: Array.isArray(sysConfig.allowedFileTypes)
            ? sysConfig.allowedFileTypes.join(", ")
            : String(sysConfig.allowedFileTypes ?? prev.allowedFileTypes),
          resetTimeoutSeconds: Number(sysConfig.resetTimeoutSeconds ?? prev.resetTimeoutSeconds),
        }))
      }
    }
    fetchData()
  }, [])

  const userPermissions = (session?.user as any)?.permissions || []
  const canApprove = userPermissions.includes("MERCHANT_APPROVE")

  const allowedTypesValidation = useMemo(() => {
    const types = (config.allowedFileTypes || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    const invalid = types.filter((t) => !t.startsWith(".") || t.length < 2)
    return { invalid, normalized: types.filter((t) => t.startsWith(".")) }
  }, [config.allowedFileTypes])

  const filteredMerchants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return merchants
    return merchants.filter((m) => {
      const name = String(m?.name ?? "").toLowerCase()
      const id = String(m?.id ?? "").toLowerCase()
      const email = String(m?.email ?? "").toLowerCase()
      return name.includes(q) || id.includes(q) || email.includes(q)
    })
  }, [merchants, searchQuery])

  const totals = useMemo(() => {
    const active = merchants.filter((m) => m.status === "approved" || m.status === "active").length
    const queue = merchants.filter((m) => m.status === "pending" || m.status === "branch_approved").length
    return { active, queue }
  }, [merchants])

  const handleSaveConfig = () => {
    toast({
      title: "Settings updated",
      description: "Changes were applied for this session (wire up persistence when ready).",
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="group rounded-2xl border-white/30 bg-white/45 backdrop-blur-xl shadow-sm shadow-amber-950/10 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-amber-950/15">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-slate-900">
              <UserPlus className="h-5 w-5 text-[#754319]" />
              <CardTitle className="text-base tracking-tight">Merchant onboarding</CardTitle>
            </div>
            <CardDescription>Register new merchants and manage submissions.</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/onboarding">
              <Button
                variant="outline"
                className="w-full justify-between rounded-2xl border-white/40 bg-white/40 hover:bg-white/60"
              >
                Open onboarding portal
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="group rounded-2xl border-white/30 bg-white/45 backdrop-blur-xl shadow-sm shadow-amber-950/10 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-amber-950/15">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck className="h-5 w-5 text-[#754319]" />
              <CardTitle className="text-base tracking-tight">Review & approvals</CardTitle>
            </div>
            <CardDescription>Compliance queue for audits and activation.</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Link href="/admin/review">
              <Button
                variant="outline"
                className="w-full justify-between rounded-2xl border-white/40 bg-white/40 hover:bg-white/60"
              >
                Open review queue
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          title="Total volume (30d)"
          value="1.24M ETB"
          hint="Warm seasonality holding steady"
          trend={{ direction: "up", label: "+18.4%" }}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricCard
          title="Merchants"
          value={`${merchants.length}`}
          hint={`${totals.active} active`}
          trend={{ direction: "up", label: "+2.1%" }}
          icon={<Users className="h-4 w-4" />}
        />
        <MetricCard
          title="System uptime"
          value="99.98%"
          hint="Normal operations"
          trend={{ direction: "up", label: "+0.02%" }}
          icon={<Zap className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 rounded-2xl border-white/30 bg-white/45 backdrop-blur-xl shadow-sm shadow-amber-950/10">
          <CardHeader>
            <CardTitle className="text-base tracking-tight">Processing insights</CardTitle>
            <CardDescription>Transactional volume with smooth curves and warm fills.</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insightData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="honeyFill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f8b513" stopOpacity={0.34} />
                    <stop offset="60%" stopColor="#f4db9f" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#754319" stopOpacity={0.16} />
                  </linearGradient>
                  <linearGradient id="honeyStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f8b513" />
                    <stop offset="100%" stopColor="#754319" />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.18} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} />
                <YAxis tickLine={false} axisLine={false} tickMargin={10} width={40} />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const v = Number(payload[0]?.value ?? 0)
                    return (
                      <div className="rounded-2xl border border-white/30 bg-white/65 px-3 py-2 text-xs shadow-md shadow-amber-950/10 backdrop-blur-xl">
                        <div className="font-semibold text-slate-900">{label}</div>
                        <div className="mt-0.5 text-slate-600">
                          Volume: <span className="font-mono font-semibold text-slate-900">{v.toLocaleString()}</span>
                        </div>
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="url(#honeyStroke)"
                  strokeWidth={2}
                  fill="url(#honeyFill)"
                  dot={false}
                  activeDot={{ r: 4, stroke: "#754319", strokeWidth: 2, fill: "#f8b513" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-white/30 bg-white/45 backdrop-blur-xl shadow-sm shadow-amber-950/10">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base tracking-tight">System settings</CardTitle>
                <CardDescription>Modular controls with inline validation.</CardDescription>
              </div>
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-2xl border-white/40 bg-white/40 hover:bg-white/60"
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    Manage
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>System settings</SheetTitle>
                    <SheetDescription>Constraints and security controls for NibTera merchants.</SheetDescription>
                  </SheetHeader>

                  <div className="mt-6 space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <FileUp className="h-4 w-4 text-[#754319]" />
                          Max file size
                        </Label>
                        <Badge variant="secondary" className="rounded-full bg-amber-50 text-amber-800">
                          {config.maxFileSizeMB} MB
                        </Badge>
                      </div>
                      <Slider
                        value={[config.maxFileSizeMB]}
                        min={1}
                        max={25}
                        step={1}
                        onValueChange={(v) => setConfig((p) => ({ ...p, maxFileSizeMB: v[0] ?? p.maxFileSizeMB }))}
                      />
                      <div className="text-[11px] text-slate-600">
                        Larger values may increase review time and storage costs.
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Allowed extensions</Label>
                      <Input
                        value={config.allowedFileTypes}
                        onChange={(e) => setConfig((p) => ({ ...p, allowedFileTypes: e.target.value }))}
                        className={cn(
                          "rounded-2xl",
                          allowedTypesValidation.invalid.length ? "border-rose-300 focus-visible:ring-rose-300/40" : ""
                        )}
                        placeholder=".pdf, .png, .jpg"
                      />
                      {allowedTypesValidation.invalid.length ? (
                        <div className="text-[11px] text-rose-700">
                          Invalid entries:{" "}
                          <span className="font-mono">{allowedTypesValidation.invalid.join(", ")}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-600">
                          Tip: include leading dots. Example: <span className="font-mono">.pdf</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-[#754319]" />
                        Reset expiry
                      </Label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          value={config.resetTimeoutSeconds}
                          onChange={(e) =>
                            setConfig((p) => ({ ...p, resetTimeoutSeconds: Number(e.target.value || 0) }))
                          }
                          className="w-32 rounded-2xl"
                        />
                        <div className="text-xs text-slate-600">seconds</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/30 bg-white/35 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">Require 2FA</div>
                          <div className="text-[11px] text-slate-600">Extra protection for staff accounts.</div>
                        </div>
                        <Switch
                          checked={config.requireTwoFactor}
                          onCheckedChange={(checked) => setConfig((p) => ({ ...p, requireTwoFactor: checked }))}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/30 bg-white/35 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">Maintenance mode</div>
                          <div className="text-[11px] text-slate-600">Temporarily pause onboarding flows.</div>
                        </div>
                        <Switch
                          checked={config.maintenanceMode}
                          onCheckedChange={(checked) => setConfig((p) => ({ ...p, maintenanceMode: checked }))}
                        />
                      </div>
                    </div>

                    <Button className="w-full rounded-2xl" onClick={handleSaveConfig}>
                      Save changes
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-white/30 bg-white/35 p-4">
              <div className="text-xs font-semibold text-slate-700">Approval queue</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                {totals.queue}
              </div>
              <div className="mt-1 text-xs text-slate-600">Across all stages</div>
            </div>

            <div className="rounded-2xl border border-white/30 bg-white/35 p-4">
              <div className="text-xs font-semibold text-slate-700">Active merchants</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                {totals.active}
              </div>
              <div className="mt-1 text-xs text-slate-600">Approved or active</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-white/30 bg-white/45 backdrop-blur-xl shadow-sm shadow-amber-950/10">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base tracking-tight">Merchant registry</CardTitle>
            <CardDescription>Search and inspect merchants across the gateway.</CardDescription>
          </div>
          <div className="w-full md:w-80">
            <Input
              placeholder="Search by name, id, email…"
              className="h-10 rounded-2xl border-white/30 bg-white/40"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredMerchants.slice(0, 9).map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-2xl border border-white/30 bg-white/40 p-4",
                  "shadow-sm shadow-amber-950/5 transition-all duration-200",
                  "hover:-translate-y-0.5 hover:bg-white/55"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">{m.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] uppercase text-slate-500">{m.id}</div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "rounded-full",
                      m.status === "approved" || m.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : m.status === "pending" || m.status === "branch_approved"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                    )}
                  >
                    {m.status}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    <span className="truncate">{m.branchName}</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-700">
                    {(m.dailyLimit ?? 0).toLocaleString()} ETB
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    Txns: <span className="font-mono text-slate-700">{m._count?.transactions ?? 0}</span>
                  </div>
                  {m.status === "approved" && canApprove ? (
                    <Button variant="outline" size="sm" className="h-8 rounded-2xl border-white/40 bg-white/45 hover:bg-white/65">
                      Resend setup
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {filteredMerchants.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-white/40 bg-white/30 p-10 text-center text-sm text-slate-600">
                No merchants match your search.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
