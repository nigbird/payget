"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import {
  Settings2,
  Globe,
  Lock,
  ArrowLeft,
  Save,
  ShieldCheck,
  CreditCard,
  Building,
  Bell,
  Key,
  Copy,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { db, type Merchant } from "@/app/lib/db"
import { useToast } from "@/hooks/use-toast"

export default function ConfigurationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    websiteUrl: "",
    callbackUrl: "",
    businessDescription: "",
    accountNumber: "",
    dailyLimit: 0,
    transactionLimit: 0,
  })

  useEffect(() => {
    const m = db.getMerchantById(id)
    if (m) {
      setMerchant(m)
      setFormData({
        name: m.name,
        email: m.email,
        websiteUrl: m.websiteUrl,
        callbackUrl: m.callbackUrl,
        businessDescription: m.businessDescription,
        accountNumber: m.accountNumber,
        dailyLimit: m.dailyLimit,
        transactionLimit: m.transactionLimit,
      })
    }
  }, [id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800))
    
    db.updateMerchant(id, formData)
    setIsSaving(false)
    toast({
      title: "Settings Saved",
      description: "Your merchant configuration has been updated successfully.",
    })
  }

  const copyText = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1400)
    toast({ title: "Copied", description: "Value copied to clipboard." })
  }

  if (!merchant) return null

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/40 bg-white/65 p-5 md:p-7 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={`/merchant/${id}`} className="p-2 rounded-xl bg-white/80 border border-white/70 hover:bg-white transition-colors">
              <ArrowLeft className="h-5 w-5 text-[#754319]" />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Management</p>
              <h1 className="mt-1 text-2xl md:text-3xl font-bold text-[#5b371f]">Configuration</h1>
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="h-11 rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-700/30 hover:-translate-y-0.5 transition-all"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">Saving...</span>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </section>

      <div className="mt-8">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-white/40 border border-white/60 p-1 rounded-2xl backdrop-blur-sm">
            <TabsTrigger value="profile" className="rounded-xl px-6 data-[state=active]:bg-white data-[state=active]:text-[#5b371f] data-[state=active]:shadow-sm">
              <Building className="mr-2 h-4 w-4" />
              Business Profile
            </TabsTrigger>
            <TabsTrigger value="integration" className="rounded-xl px-6 data-[state=active]:bg-white data-[state=active]:text-[#5b371f] data-[state=active]:shadow-sm">
              <Globe className="mr-2 h-4 w-4" />
              Integration
            </TabsTrigger>
            <TabsTrigger value="security" className="rounded-xl px-6 data-[state=active]:bg-white data-[state=active]:text-[#5b371f] data-[state=active]:shadow-sm">
              <Lock className="mr-2 h-4 w-4" />
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2 rounded-3xl border-white/60 bg-white/65 shadow-md backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-[#5b371f]">General Information</CardTitle>
                  <CardDescription className="text-[#754319]/70">Manage your public-facing business details.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Merchant Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="h-11 rounded-xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Business Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="h-11 rounded-xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Business Description</Label>
                    <Textarea
                      id="description"
                      value={formData.businessDescription}
                      onChange={(e) => setFormData({ ...formData, businessDescription: e.target.value })}
                      className="min-h-[120px] rounded-2xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website URL</Label>
                    <Input
                      id="website"
                      type="url"
                      value={formData.websiteUrl}
                      onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                      className="h-11 rounded-xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-white/60 bg-white/65 shadow-md backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-[#5b371f]">Financial Info</CardTitle>
                  <CardDescription className="text-[#754319]/70">Settlement and limit settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="account">Account Number</Label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-3 h-5 w-5 text-[#754319]/50" />
                      <Input
                        id="account"
                        value={formData.accountNumber}
                        readOnly
                        className="h-11 pl-10 rounded-xl border-white/50 bg-white/50 text-[#754319]/70 cursor-not-allowed"
                      />
                    </div>
                    <p className="text-[10px] text-[#754319]/60 italic">* Contact support to change settlement account.</p>
                  </div>
                  <div className="space-y-2 pt-2">
                    <Label>Transaction Limits</Label>
                    <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-200/40 space-y-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#754319]/70 font-semibold">Daily Limit</p>
                        <p className="text-xl font-black text-[#5b371f]">${formData.dailyLimit.toLocaleString()}</p>
                      </div>
                      <div className="h-px bg-amber-200/30" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#754319]/70 font-semibold">Max Per Transaction</p>
                        <p className="text-xl font-black text-[#5b371f]">${formData.transactionLimit.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="integration" className="space-y-6">
            <Card className="rounded-3xl border-white/60 bg-white/65 shadow-md backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-[#5b371f]">Webhook & API</CardTitle>
                <CardDescription className="text-[#754319]/70">Configure how we talk to your systems.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="callback">Callback URL</Label>
                  <Input
                    id="callback"
                    type="url"
                    value={formData.callbackUrl}
                    onChange={(e) => setFormData({ ...formData, callbackUrl: e.target.value })}
                    className="h-12 rounded-xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500 font-mono text-sm"
                  />
                  <p className="text-xs text-[#754319]/70">We'll send POST requests to this URL for every transaction status update.</p>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/40">
                  <h4 className="text-sm font-bold text-[#5b371f]">API Credentials</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl border border-white/70 bg-white/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-wider text-[#754319]/70 font-semibold">Merchant ID</p>
                        <Button variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => copyText(merchant.id, "id")}>
                          {copied === "id" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                          Copy
                        </Button>
                      </div>
                      <p className="font-mono text-sm text-[#5b371f] truncate">{merchant.id}</p>
                    </div>
                    <div className="p-4 rounded-2xl border border-white/70 bg-white/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-wider text-[#754319]/70 font-semibold">JWE Secret</p>
                        <Button variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => copyText(merchant.jweSecret, "jwe")}>
                          {copied === "jwe" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                          Copy
                        </Button>
                      </div>
                      <p className="font-mono text-sm text-[#5b371f] truncate">••••••••••••••••</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card className="rounded-3xl border-white/60 bg-white/65 shadow-md backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-[#5b371f]">Security & Access</CardTitle>
                <CardDescription className="text-[#754319]/70">Protect your account and team data.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-start gap-4 p-4 rounded-2xl border border-emerald-200/50 bg-emerald-50/30">
                  <ShieldCheck className="h-6 w-6 text-emerald-600 mt-1" />
                  <div>
                    <p className="font-bold text-[#5b371f]">Role-Based Access Control</p>
                    <p className="text-xs text-[#754319]/80 mt-1">
                      You are currently managing team access via the <Link href={`/merchant/${id}/users`} className="text-amber-700 font-semibold underline decoration-amber-700/30">Users & Roles</Link> module.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-white/70 bg-white/80">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                        <Bell className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#5b371f] text-sm">Login Notifications</p>
                        <p className="text-xs text-[#754319]/70">Receive alerts for new sign-ins.</p>
                      </div>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-800 border-0">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-white/70 bg-white/80">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                        <Key className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#5b371f] text-sm">Two-Factor Authentication</p>
                        <p className="text-xs text-[#754319]/70">Add an extra layer of security.</p>
                      </div>
                    </div>
                    <Button variant="outline" className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50 h-9">Configure</Button>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/40">
                  <div className="flex items-center gap-2 text-amber-700 mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Danger Zone</span>
                  </div>
                  <Button variant="outline" className="w-full md:w-auto rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50 h-11">
                    Deactivate Merchant Account
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
