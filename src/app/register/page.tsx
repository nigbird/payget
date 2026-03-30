"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  Loader2, 
  Sparkles, 
  Store, 
  Globe, 
  Building2, 
  User, 
  Phone, 
  MapPin, 
  Link as LinkIcon,
  FileText,
  Upload,
  X,
  FileCheck,
  CreditCard,
  ArrowLeft
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { aiMerchantOnboardingAssistant } from "@/ai/flows/ai-merchant-onboarding-assistant"
import { db, type MerchantDocument } from "@/app/lib/db"
import Link from "next/link"

export default function MerchantSelfRegistration() {
  const { toast } = useToast()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [systemConfig, setSystemConfig] = useState(db.getSystemConfig())
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    accountNumber: "",
    dailyLimit: "10000",
    transactionLimit: "1000",
    businessDescription: "",
    websiteUrl: "",
    callbackUrl: "",
    contactName: "",
    contactPhone: "",
    branchName: "",
    district: "",
    category: "",
    businessType: ""
  })
  
  const [documents, setDocuments] = useState<MerchantDocument[]>([])
  const [riskFactors, setRiskFactors] = useState<string[]>([])

  useEffect(() => {
    setSystemConfig(db.getSystemConfig())
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newDocs: MerchantDocument[] = []
    const maxSize = systemConfig.maxFileSizeMB * 1024 * 1024
    const allowedTypes = systemConfig.allowedFileTypes

    Array.from(files).forEach(file => {
      const extension = `.${file.name.split('.').pop()?.toLowerCase()}`
      
      if (!allowedTypes.includes(extension)) {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: `${file.name} is not a supported format.`
        })
        return
      }

      if (file.size > maxSize) {
        toast({
          variant: "destructive",
          title: "File Too Large",
          description: `${file.name} exceeds the ${systemConfig.maxFileSizeMB}MB limit.`
        })
        return
      }

      newDocs.push({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: file.type,
        size: file.size,
        uploadedAt: new Date().toISOString()
      })
    })

    setDocuments(prev => [...prev, ...newDocs])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeDoc = (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  const handleAiAssistant = async () => {
    if (!formData.websiteUrl && !formData.businessDescription) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please provide a website URL or business description for AI analysis."
      })
      return
    }

    setIsAiLoading(true)
    try {
      const result = await aiMerchantOnboardingAssistant({
        businessDescription: formData.businessDescription,
        websiteUrl: formData.websiteUrl
      })

      setFormData(prev => ({
        ...prev,
        name: result.prefilledFields.companyName || prev.name,
        businessType: result.prefilledFields.businessType || prev.businessType,
        category: result.suggestedCategories[0] || prev.category
      }))
      setRiskFactors(result.riskFactors)

      toast({
        title: "AI Analysis Complete",
        description: "Suggested details have been populated."
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "AI Analysis Failed",
        description: "Could not process information at this time."
      })
    } finally {
      setIsAiLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (documents.length === 0) {
      toast({
        variant: "destructive",
        title: "Documents Required",
        description: "Please upload at least one compliance document."
      })
      return
    }

    if (!formData.branchName || !formData.district) {
      toast({
        variant: "destructive",
        title: "Missing Selections",
        description: "Please select your preferred branch and district."
      })
      return
    }

    setIsSubmitting(true)
    
    const merchantId = `m_${Math.random().toString(36).substr(2, 9)}`
    
    db.addMerchant({
      id: merchantId,
      ...formData,
      dailyLimit: Number(formData.dailyLimit),
      transactionLimit: Number(formData.transactionLimit),
      status: 'pending',
      documents,
      riskFactors,
      createdAt: new Date().toISOString()
    })

    toast({
      title: "Application Submitted",
      description: "Your registration is now pending review by our compliance team."
    })
    
    setTimeout(() => {
      router.push("/")
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-12">
      <header className="bg-white border-b h-16 flex items-center px-4 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-muted rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <CreditCard className="text-primary w-6 h-6" />
              <h1 className="text-xl font-bold font-headline text-primary">Finflow Onboarding</h1>
            </div>
          </div>
          <Badge variant="outline" className="border-primary text-primary">Self-Service Portal</Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid gap-8 grid-cols-1 lg:grid-cols-3">
          {/* Main Registration Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-md border-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="w-6 h-6 text-primary" />
                  Merchant Registration
                </CardTitle>
                <CardDescription>
                  Start your journey with Finflow. Complete the form below to initiate the onboarding process.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-8">
                  {/* Company Info */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                      <Building2 className="w-4 h-4" /> Company Profile
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="name">Business Legal Name</Label>
                        <Input 
                          id="name" 
                          placeholder="e.g. Acme Retail Ltd" 
                          required 
                          value={formData.name}
                          onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Business Email</Label>
                        <Input 
                          id="email" 
                          type="email" 
                          placeholder="legal@business.com" 
                          required 
                          value={formData.email}
                          onChange={e => setFormData({...formData, email: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="websiteUrl">Business Website</Label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="websiteUrl" 
                          className="pl-9" 
                          placeholder="https://yourbusiness.com" 
                          value={formData.websiteUrl}
                          onChange={e => setFormData({...formData, websiteUrl: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Contact Info */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                      <User className="w-4 h-4" /> Authorized Contact
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="contactName">Primary Contact Name</Label>
                        <Input 
                          id="contactName" 
                          placeholder="Full Name" 
                          required 
                          value={formData.contactName}
                          onChange={e => setFormData({...formData, contactName: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contactPhone">Primary Contact Phone</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="contactPhone" 
                            className="pl-9"
                            placeholder="+1 (555) 000-0000" 
                            required 
                            value={formData.contactPhone}
                            onChange={e => setFormData({...formData, contactPhone: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Location Info */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Business Location
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="district">District</Label>
                        <Select 
                          value={formData.district} 
                          onValueChange={(val) => setFormData({...formData, district: val})}
                        >
                          <SelectTrigger id="district">
                            <SelectValue placeholder="Select District" />
                          </SelectTrigger>
                          <SelectContent>
                            {systemConfig.districts.map(district => (
                              <SelectItem key={district} value={district}>{district}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="branchName">Nearest Serving Branch</Label>
                        <Select 
                          value={formData.branchName} 
                          onValueChange={(val) => setFormData({...formData, branchName: val})}
                        >
                          <SelectTrigger id="branchName">
                            <SelectValue placeholder="Select Branch" />
                          </SelectTrigger>
                          <SelectContent>
                            {systemConfig.branches.map(branch => (
                              <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Documents */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                      <FileText className="w-4 h-4" /> Compliance Documents
                    </h3>
                    <div 
                      className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center bg-muted/5 hover:bg-muted/10 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-10 h-10 text-primary mb-3" />
                      <p className="text-base font-semibold">Upload KYC Documents</p>
                      <p className="text-xs text-muted-foreground mt-2 text-center max-w-sm">
                        Please upload your Trade License, Tax ID, and Identity documents. 
                        Max size: {systemConfig.maxFileSizeMB}MB. Allowed: {systemConfig.allowedFileTypes.join(', ')}
                      </p>
                      <input 
                        type="file" 
                        multiple 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept={systemConfig.allowedFileTypes.join(',')}
                      />
                    </div>

                    {documents.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {documents.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between p-3 bg-white rounded-lg border shadow-sm">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <FileCheck className="w-5 h-5 text-green-500 shrink-0" />
                              <div className="overflow-hidden">
                                <p className="text-xs font-medium truncate">{doc.name}</p>
                                <p className="text-[10px] text-muted-foreground">{(doc.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeDoc(doc.id)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Technical Info */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                      <LinkIcon className="w-4 h-4" /> Settlement & Webhooks
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="accountNumber">Bank Settlement Account</Label>
                        <Input 
                          id="accountNumber" 
                          placeholder="000123456789" 
                          required 
                          value={formData.accountNumber}
                          onChange={e => setFormData({...formData, accountNumber: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="callbackUrl">Webhook Callback URL</Label>
                        <Input 
                          id="callbackUrl" 
                          placeholder="https://api.yourdomain.com/v1/payments" 
                          required
                          value={formData.callbackUrl}
                          onChange={e => setFormData({...formData, callbackUrl: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessDescription">Business Activity Description</Label>
                    <Textarea 
                      id="businessDescription" 
                      placeholder="Describe your primary products or services..." 
                      rows={4}
                      value={formData.businessDescription}
                      onChange={e => setFormData({...formData, businessDescription: e.target.value})}
                    />
                  </div>

                  <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Submit Application"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* AI Assistance Side Panel */}
          <div className="space-y-6">
            <Card className="border-accent/20 bg-accent/5 shadow-sm overflow-hidden">
              <div className="bg-accent/10 p-4 border-b border-accent/20 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent-foreground" />
                <h3 className="font-bold text-sm text-accent-foreground">AI Onboarding Assistant</h3>
              </div>
              <CardContent className="p-4 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Provide your website or a brief description, and our AI will help categorize your business and flag any missing compliance requirements.
                </p>
                <Button 
                  variant="outline" 
                  className="w-full border-accent/40 text-accent-foreground hover:bg-accent/10"
                  onClick={handleAiAssistant}
                  disabled={isAiLoading}
                >
                  {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Auto-fill Profile
                </Button>

                {riskFactors.length > 0 && (
                  <div className="space-y-2 mt-4 animate-in fade-in slide-in-from-top-2">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Pre-Screening Insights</Label>
                    <div className="flex flex-wrap gap-1">
                      {riskFactors.map((risk, i) => (
                        <Badge key={i} variant="secondary" className="bg-white/80 text-[10px] text-orange-600 border-orange-100">
                          {risk}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-primary text-primary-foreground border-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Why Finflow?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center shrink-0">✓</div>
                  <p>Settlements within 24 hours.</p>
                </div>
                <div className="flex gap-2">
                  <div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center shrink-0">✓</div>
                  <p>Enterprise-grade security.</p>
                </div>
                <div className="flex gap-2">
                  <div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center shrink-0">✓</div>
                  <p>Global multi-currency support.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
