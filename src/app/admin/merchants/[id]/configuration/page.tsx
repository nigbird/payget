"use client"

import { useState, useEffect, use, useMemo, useCallback } from "react"
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
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { QRCodeCanvas } from "qrcode.react"
import {
  downloadQrFromCanvasElement,
  downloadQrFromSvgElement,
  triggerBlobDownload,
} from "@/lib/qr-download"
import { resolveAbsoluteImageUrl, useQrLogoImageSettings } from "@/lib/qr-logo"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const QR_DISPLAY_SIZE = 200
const QR_DOWNLOAD_SIZE = 1024

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
  const [isDownloadingQr, setIsDownloadingQr] = useState(false)

  const qrUrl = useMemo(() => {
    if (!qrConfig?.activeQr?.token) return ""
    const origin = (
      process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "")
    )
    return `${origin}/pay/merchant/${qrConfig.activeQr.token}`
  }, [qrConfig?.activeQr?.token])

  const qrDisplayLogoSettings = useQrLogoImageSettings(
    qrConfig?.qrLogoUrl ? resolveAbsoluteImageUrl(qrConfig.qrLogoUrl) : null
  )

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
          qrEnabled: true,
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
      // First save current configuration changes
      await fetch(`/api/merchants/${id}/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrEnabled: true,
          qrLogoUrl: qrConfig.qrLogoUrl
        })
      })

      const response = await fetch(`/api/merchants/${id}/qr/regenerate`, {
        method: 'POST'
      })

      if (response.ok) {
        toast({
          title: "QR Code Regenerated",
          description: "New token issued and settings updated."
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

      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid server response. Please try again later.")
      }

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

  const downloadQr = useCallback(async () => {
    if (!merchant) return

    const fileName = `QR-${merchant.name.replace(/[^\w.-]+/g, "_")}.png`
    setIsDownloadingQr(true)

    try {
      const qrElement = document.getElementById("merchant-qr")

      if (qrElement instanceof HTMLCanvasElement) {
        await downloadQrFromCanvasElement(qrElement, {
          fileName,
          outputSize: QR_DOWNLOAD_SIZE,
          waitMs: qrDisplayLogoSettings ? 600 : 100,
        })
        return
      }

      if (qrElement instanceof SVGSVGElement) {
        await downloadQrFromSvgElement(qrElement, {
          fileName,
          outputSize: QR_DOWNLOAD_SIZE,
        })
        return
      }

      const response = await fetch(`/api/merchants/${id}/qr/download`)
      if (!response.ok) {
        throw new Error("Server export failed")
      }
      triggerBlobDownload(await response.blob(), fileName)
    } catch (error) {
      console.error("QR download failed:", error)
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "Could not export a scannable QR image. Please try again.",
      })
    } finally {
      setIsDownloadingQr(false)
    }
  }, [merchant, qrDisplayLogoSettings, id, toast])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    )
  }

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
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-amber-600" />
                </div>
                <CardTitle className="text-base">QR Code Configuration</CardTitle>
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
                          <img src={resolveAbsoluteImageUrl(qrConfig.qrLogoUrl)} alt="QR Logo" className="w-full h-full object-contain" />
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

                  <div className="pt-4">
                    <Button 
                      onClick={qrConfig?.activeQr ? handleRegenerateQr : handleSaveQrConfig}
                      disabled={qrConfig?.activeQr ? isRegenerating : isSaving}
                      className="w-full rounded-xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-10 px-8"
                    >
                      {qrConfig?.activeQr ? (
                        isRegenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCw className="w-4 h-4 mr-2" />
                      ) : (
                        isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />
                      )}
                      {qrConfig?.activeQr ? "Regenerate" : "Generate"}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-black/5 shadow-inner min-h-[300px]">
                  {qrConfig?.activeQr ? (
                    <div className="relative group/qr">
                      <div className="bg-white p-4 rounded-3xl shadow-xl border border-slate-100">
                        <QRCodeCanvas
                          key={`${qrConfig.activeQr?.token ?? "qr"}-${qrDisplayLogoSettings?.src ?? "plain"}`}
                          id="merchant-qr"
                          value={qrUrl}
                          size={QR_DISPLAY_SIZE}
                          level="H"
                          includeMargin
                          marginSize={4}
                          bgColor="#FFFFFF"
                          fgColor="#000000"
                          imageSettings={qrDisplayLogoSettings}
                        />
                      </div>
                      <Button 
                        variant="ghost"
                        size="icon"
                        className="absolute -top-3 -right-3 h-14 w-14 rounded-full bg-white shadow-lg border-2 border-amber-600 text-amber-600 hover:text-white hover:bg-amber-600 transition-all z-10"
                        onClick={downloadQr}
                        disabled={isDownloadingQr}
                        title="Download QR"
                      >
                        {isDownloadingQr ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                          <Download className="w-6 h-6" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto border border-dashed border-slate-200">
                        <QrCode className="w-8 h-8 text-slate-200" />
                      </div>
                      <p className="text-sm text-slate-400">Click Generate to create a payment QR code.</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
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
                    <img src={resolveAbsoluteImageUrl(merchant.logoUrl)} alt={merchant.name} className="w-full h-full object-contain" />
                  ) : (
                    <Store className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{merchant?.name}</p>
                  <p className="text-[10px] font-mono text-slate-500 uppercase truncate">{merchant?.id}</p>
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
        </div>
      </div>
    </div>
  )
}
