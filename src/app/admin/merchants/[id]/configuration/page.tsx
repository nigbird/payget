"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { 
  Building2, 
  Settings2, 
  QrCode, 
  Save, 
  RotateCw, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Store,
  ArrowLeft,
  ImageIcon
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { QRCodeSVG } from "qrcode.react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function MerchantConfigurationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  
  const [merchant, setMerchant] = useState<any>(null)
  const [qrConfig, setQrConfig] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [id])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [mRes, qrRes] = await Promise.all([
        fetch(`/api/merchants/${id}`),
        fetch(`/api/merchants/${id}/qr`)
      ])

      if (mRes.ok) setMerchant(await mRes.json())
      if (qrRes.ok) setQrConfig(await qrRes.json())
    } catch (error) {
      console.error("Failed to fetch configuration data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveQrConfig = async () => {
    setIsSaving(true)
    try {
      const response = await fetch(`/api/merchants/${id}/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrEnabled: qrConfig.qrEnabled,
          qrLogoUrl: qrConfig.qrLogoUrl
        })
      })

      if (response.ok) {
        toast({
          title: "Configuration Saved",
          description: "QR code settings have been updated successfully."
        })
        fetchData()
      } else {
        throw new Error("Failed to save")
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not save QR configuration."
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleRegenerateQr = async () => {
    if (!confirm("Are you sure? This will invalidate the existing QR code and all printed copies will stop working.")) {
      return
    }

    setIsRegenerating(true)
    try {
      const response = await fetch(`/api/merchants/${id}/qr/regenerate`, {
        method: 'POST'
      })

      if (response.ok) {
        toast({
          title: "QR Code Regenerated",
          description: "A new secure payment token has been issued."
        })
        fetchData()
      } else {
        throw new Error("Failed to regenerate")
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not regenerate QR code."
      })
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const response = await fetch("/api/uploads/merchant-logo", {
        method: "POST",
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setQrConfig({ ...qrConfig, qrLogoUrl: data.url })
        toast({
          title: "Logo Uploaded",
          description: "Branded QR logo updated."
        })
      } else {
        throw new Error("Upload failed")
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "Could not upload the branded logo."
      })
    } finally {
      setIsUploading(false)
    }
  }

  const downloadQr = () => {
    const svg = document.getElementById("merchant-qr")
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()
    img.onload = () => {
      canvas.width = 1000
      canvas.height = 1000
      ctx?.drawImage(img, 0, 0, 1000, 1000)
      const pngFile = canvas.toDataURL("image/png")
      const downloadLink = document.createElement("a")
      downloadLink.download = `QR-${merchant.name}.png`
      downloadLink.href = pngFile
      downloadLink.click()
    }
    img.src = "data:image/svg+xml;base64," + btoa(svgData)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    )
  }

  const qrUrl = `${window.location.origin}/pay/merchant/${qrConfig?.activeQr?.token}`

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/merchants')} className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-[#5b371f]">Configuration: {merchant?.name}</h2>
          <p className="text-sm text-amber-800/60 font-medium">Manage payment settings and branded assets.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* QR Code Configuration Section */}
          <Card className="rounded-2xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/10 overflow-hidden">
            <CardHeader className="bg-amber-50/30 border-b border-black/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <QrCode className="w-5 h-5 text-amber-600" />
                  </div>
                  <CardTitle className="text-base">QR Code Configuration</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Enable Payment QR</span>
                  <Switch 
                    checked={qrConfig?.qrEnabled} 
                    onCheckedChange={(val) => setQrConfig({ ...qrConfig, qrEnabled: val })}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">QR Branding Assets</Label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-amber-200 flex items-center justify-center overflow-hidden">
                        {qrConfig?.qrLogoUrl ? (
                          <img src={qrConfig.qrLogoUrl} alt="QR Logo" className="w-full h-full object-contain" />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-amber-200" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-xs text-slate-500">Upload a branded logo to display in the center of the QR code. Recommended: Square PNG, max 2MB.</p>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-[10px] font-bold uppercase tracking-wider rounded-lg border-slate-200"
                            asChild
                            disabled={isUploading}
                          >
                            <label className="cursor-pointer">
                              {isUploading ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Upload className="w-3 h-3 mr-1.5" />}
                              Upload Logo
                              <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                            </label>
                          </Button>
                          {qrConfig?.qrLogoUrl && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 text-[10px] font-bold uppercase tracking-wider rounded-lg text-rose-600"
                              onClick={() => setQrConfig({ ...qrConfig, qrLogoUrl: null })}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Security & Lifecycle</Label>
                    <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-100/50 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-amber-900">Secure Payment Token</p>
                          <p className="text-[10px] text-amber-800/70 leading-relaxed">The QR code uses a unique secure token. If you suspect fraud or want to refresh the code, use the regeneration tool.</p>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full h-8 text-[10px] font-bold uppercase tracking-wider rounded-lg border-amber-200 text-amber-900 hover:bg-amber-100"
                        onClick={handleRegenerateQr}
                        disabled={isRegenerating || !qrConfig?.activeQr}
                      >
                        {isRegenerating ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RotateCw className="w-3 h-3 mr-1.5" />}
                        Regenerate QR Token
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-black/5 shadow-inner min-h-[300px]">
                  {qrConfig?.qrEnabled && qrConfig?.activeQr ? (
                    <>
                      <div className="bg-white p-4 rounded-3xl shadow-xl border border-slate-100">
                        <QRCodeSVG 
                          id="merchant-qr"
                          value={qrUrl}
                          size={200}
                          level="H"
                          imageSettings={qrConfig.qrLogoUrl ? {
                            src: qrConfig.qrLogoUrl,
                            height: 40,
                            width: 40,
                            excavate: true,
                          } : undefined}
                        />
                      </div>
                      <p className="mt-6 text-[10px] font-mono text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                        {qrConfig.activeQr.token.substring(0, 16)}...
                      </p>
                      <div className="mt-6 flex gap-3">
                        <Button 
                          className="rounded-xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-9 px-6"
                          onClick={downloadQr}
                        >
                          <Download className="w-4 h-4 mr-2" /> Download QR
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto border border-dashed border-slate-200">
                        <QrCode className="w-8 h-8 text-slate-200" />
                      </div>
                      <p className="text-sm text-slate-400">Enable QR payments to generate a code.</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-slate-50/50 border-t border-black/5 p-4 flex justify-end">
              <Button 
                onClick={handleSaveQrConfig}
                disabled={isSaving}
                className="rounded-xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-10 px-8"
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Configuration
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-2xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Merchant Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                  {merchant?.logoUrl ? (
                    <img src={merchant.logoUrl} alt={merchant.name} className="w-full h-full object-contain" />
                  ) : (
                    <Store className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{merchant?.name}</p>
                  <p className="text-[10px] font-mono text-slate-500 uppercase">{merchant?.id}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Account Status:</span>
                  <Badge className="bg-emerald-500">{merchant?.status}</Badge>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Settlement Account:</span>
                  <span className="font-mono font-bold text-slate-900">{merchant?.accountNumber}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-medium text-slate-900">{merchant?.category}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-black/5 bg-amber-50/30 shadow-sm shadow-amber-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start text-xs h-9 rounded-xl border-slate-200 bg-white" onClick={() => router.push(`/admin/review?merchantId=${id}`)}>
                <Building2 className="w-3.5 h-3.5 mr-2" /> View Full Profile
              </Button>
              <Button variant="outline" className="w-full justify-start text-xs h-9 rounded-xl border-slate-200 bg-white" onClick={() => window.open(qrUrl, '_blank')}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Test Payment Page
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
