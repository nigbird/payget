"use client"

import { useState, useRef, useEffect } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { 
  Loader2, 
  Sparkles, 
  UserPlus, 
  Globe, 
  Building2, 
  User, 
  Phone, 
  MapPin, 
  Link as LinkIcon,
  FileText,
  Upload,
  X,
  FileCheck
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { aiMerchantOnboardingAssistant } from "@/ai/flows/ai-merchant-onboarding-assistant"
import { db, type MerchantDocument } from "@/app/lib/db"

export default function MakerPortal() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isAiLoading, setIsAiLoading] = useState(false)
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
        description: "Please provide a website URL or business description for the AI assistant to analyze."
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
        title: "Analysis Complete",
        description: "AI assistant has suggested details based on your input."
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
        description: "Please upload at least one document (e.g. Trade License)."
      })
      return
    }

    // Simulated backend submission
    db.addMerchant({
      id: `m_${Math.random().toString(36).substr(2, 9)}`,
      ...formData,
      dailyLimit: Number(formData.dailyLimit),
      transactionLimit: Number(formData.transactionLimit),
      status: 'pending',
      documents,
      riskFactors,
      createdAt: new Date().toISOString()
    })

    toast({
      title: "Merchant Registered",
      description: "Successfully submitted to the Checker Portal for review."
    })
    
    // Reset state
    setFormData({
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
    setDocuments([])
    setRiskFactors([])
  }

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <UserPlus className="text-primary w-5 h-5" />
            <h1 className="text-lg font-semibold font-headline">Merchant Registration (Maker)</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-muted/20">
          <div className="max-w-5xl mx-auto grid gap-6 grid-cols-1 lg:grid-cols-3">
            
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="shadow-sm border-none">
                <CardHeader>
                  <CardTitle>Merchant Profile</CardTitle>
                  <CardDescription>Capture company details, contact person, and compliance documents.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Info */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                        <Building2 className="w-4 h-4" /> Company Details
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="name">Company Name</Label>
                          <Input 
                            id="name" 
                            placeholder="Acme Inc." 
                            required 
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">Email Address</Label>
                          <Input 
                            id="email" 
                            type="email" 
                            placeholder="contact@acme.com" 
                            required 
                            value={formData.email}
                            onChange={e => setFormData({...formData, email: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Contact Person */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                        <User className="w-4 h-4" /> Contact Person
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="contactName">Full Name</Label>
                          <Input 
                            id="contactName" 
                            placeholder="Authorized Representative" 
                            required 
                            value={formData.contactName}
                            onChange={e => setFormData({...formData, contactName: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contactPhone">Phone Number</Label>
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

                    {/* Registration Branch */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Registration Branch
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="branchName">Branch Name</Label>
                          <Input 
                            id="branchName" 
                            placeholder="Main City Branch" 
                            required 
                            value={formData.branchName}
                            onChange={e => setFormData({...formData, branchName: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="district">District</Label>
                          <Input 
                            id="district" 
                            placeholder="North District" 
                            required 
                            value={formData.district}
                            onChange={e => setFormData({...formData, district: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Document Uploads */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Compliance Documents
                      </h3>
                      
                      <div 
                        className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-muted/5 hover:bg-muted/10 transition-colors cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">Click to upload documents</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Trade License, ID, or Tax Certificates (Max {systemConfig.maxFileSizeMB}MB)
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
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-muted-foreground">Uploaded ({documents.length})</Label>
                          <div className="grid gap-2">
                            {documents.map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between p-3 bg-white rounded-md border shadow-sm">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                                    <FileCheck className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium truncate max-w-[200px]">{doc.name}</p>
                                    <p className="text-[10px] text-muted-foreground">{(doc.size / 1024).toFixed(1)} KB</p>
                                  </div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removeDoc(doc.id)
                                  }}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Integration & Limits */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                        <LinkIcon className="w-4 h-4" /> Integration & Limits
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="accountNumber">Bank Account Number</Label>
                          <Input 
                            id="accountNumber" 
                            placeholder="000123456789" 
                            required 
                            value={formData.accountNumber}
                            onChange={e => setFormData({...formData, accountNumber: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="businessType">Business Type</Label>
                          <Input 
                            id="businessType" 
                            placeholder="e.g. Retail, SaaS" 
                            value={formData.businessType}
                            onChange={e => setFormData({...formData, businessType: e.target.value})}
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="websiteUrl">Website URL</Label>
                          <div className="relative">
                            <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                              id="websiteUrl" 
                              className="pl-9" 
                              placeholder="https://example.com" 
                              value={formData.websiteUrl}
                              onChange={e => setFormData({...formData, websiteUrl: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="callbackUrl">Callback (Webhook) URL</Label>
                          <div className="relative">
                            <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                              id="callbackUrl" 
                              className="pl-9" 
                              placeholder="https://api.example.com/webhook" 
                              required
                              value={formData.callbackUrl}
                              onChange={e => setFormData({...formData, callbackUrl: e.target.value})}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="businessDescription">Business Description</Label>
                      <Textarea 
                        id="businessDescription" 
                        placeholder="Briefly describe the business operations..." 
                        rows={3}
                        value={formData.businessDescription}
                        onChange={e => setFormData({...formData, businessDescription: e.target.value})}
                      />
                    </div>

                    <Button type="submit" className="w-full h-11 bg-primary text-lg">
                      Submit for Approval
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* AI Assistant Sidebar */}
            <div className="space-y-6">
              <Card className="border-accent/20 shadow-sm bg-accent/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-accent-foreground">
                    <Sparkles className="h-5 w-5" />
                    AI Assistant
                  </CardTitle>
                  <CardDescription>
                    Analyze provided details to pre-fill fields and identify risks.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button 
                    variant="outline" 
                    className="w-full border-accent/30 text-accent-foreground hover:bg-accent/10"
                    disabled={isAiLoading}
                    onClick={handleAiAssistant}
                  >
                    {isAiLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Run Intelligence
                      </>
                    )}
                  </Button>

                  {riskFactors.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-accent/20">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Identified Risk Factors</Label>
                      <div className="flex flex-wrap gap-2">
                        {riskFactors.map((risk, i) => (
                          <Badge key={i} variant="secondary" className="bg-red-100 text-red-700 border-red-200">
                            {risk}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Compliance Help</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 text-xs font-bold">1</div>
                    <p>Ensure Trade License is current and valid.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 text-xs font-bold">2</div>
                    <p>Allowed: {systemConfig.allowedFileTypes.join(', ')}</p>
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
