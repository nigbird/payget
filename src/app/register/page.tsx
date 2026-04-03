"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
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
  ArrowLeft,
  Copy,
  CheckCircle2,
  Clock,
  Mail
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { aiMerchantOnboardingAssistant } from "@/ai/flows/ai-merchant-onboarding-assistant"
import type { MerchantDocument } from "@/app/lib/db"
import Link from "next/link"

export default function MerchantSelfRegistration() {
  const { toast } = useToast()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [credentials, setCredentials] = useState<{ id: string; email: string; pass: string } | null>(null)
  const [systemConfig, setSystemConfig] = useState<any>({
    districts: [],
    branches: [],
    allowedFileTypes: [],
    maxFileSizeMB: 5
  })
  
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
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/system-config')
        if (response.ok) {
          const config = await response.json()
          setSystemConfig(config)
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
      }
    }
    fetchConfig()
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newDocs: MerchantDocument[] = []
    const maxSize = (systemConfig.maxFileSizeMB || 5) * 1024 * 1024
    const allowedTypes = systemConfig.allowedFileTypes || []

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

  const generatePassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    let retVal = ""
    for (let i = 0, n = charset.length; i < 12; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n))
    }
    return retVal
  }

  const handleSubmit = async (e: React.FormEvent) => {
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
    const generatedPass = generatePassword()
    
    try {
      const response = await fetch('/api/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: merchantId,
          ...formData,
          password: generatedPass,
          dailyLimit: Number(formData.dailyLimit),
          transactionLimit: Number(formData.transactionLimit),
          dailyCountLimit: 100,
          jweSecret: `demo_jwe_secret_${merchantId}`,
          status: 'pending',
          documents,
          riskFactors,
          createdAt: new Date().toISOString()
        })
      })

      if (response.ok) {
        setCredentials({ id: merchantId, email: formData.email, pass: generatedPass })
        setIsSuccess(true)
        toast({
          title: "Application Submitted",
          description: "Please save your credentials to check status later."
        })
      } else {
        throw new Error('Failed to register')
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: "Could not submit your application at this time."
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      description: "Copied to clipboard"
    })
  }

  if (isSuccess && credentials) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg border-none animate-in zoom-in-95">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-headline">Application Received!</CardTitle>
            <CardDescription>
              Your registration is now <span className="text-orange-600 font-bold uppercase">Pending Approval</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 py-6">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
              <p className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-3 h-3" /> User Credential Details
              </p>
              <p className="text-sm text-blue-700 leading-relaxed">
                You can log in using your <span className="font-bold">Email</span>, <span className="font-bold">Phone</span>, or <span className="font-bold">Merchant ID</span>.
              </p>
              
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-blue-600">Email (Primary Identifier)</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white p-2 rounded border border-blue-200 text-sm font-mono font-bold">{credentials.email}</code>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-600" onClick={() => copyToClipboard(credentials.email)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-blue-600">Merchant ID</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white p-2 rounded border border-blue-200 text-sm font-mono font-bold">{credentials.id}</code>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-600" onClick={() => copyToClipboard(credentials.id)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-blue-600">Unique Password</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white p-2 rounded border border-blue-200 text-sm font-mono font-bold">{credentials.pass}</code>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-600" onClick={() => copyToClipboard(credentials.pass)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full" asChild>
              <Link href="/">Return to Home</Link>
            </Button>
            <Button variant="ghost" className="w-full text-xs" asChild>
              <Link href={`/merchant/${credentials.id}`}>Preview Dashboard (ReadOnly)</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
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
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="email" 
                            type="email" 
                            className="pl-9"
                            placeholder="legal@business.com" 
                            required 
                            value={formData.email}
                            onChange={e => setFormData({...formData, email: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

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
                            placeholder="+1234567890" 
                            required 
                            value={formData.contactPhone}
                            onChange={e => setFormData({...formData, contactPhone: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

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
                            {(systemConfig.districts || []).map(district => (
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
                            {(systemConfig.branches || []).map(branch => (
                              <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

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
                      <input 
                        type="file" 
                        multiple 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept={(systemConfig.allowedFileTypes || []).join(',')}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Submit Application"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-accent/20 bg-accent/5 shadow-sm overflow-hidden">
              <div className="bg-accent/10 p-4 border-b border-accent/20 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent-foreground" />
                <h3 className="font-bold text-sm text-accent-foreground">AI Onboarding Assistant</h3>
              </div>
              <CardContent className="p-4 space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full border-accent/40 text-accent-foreground hover:bg-accent/10"
                  onClick={handleAiAssistant}
                  disabled={isAiLoading}
                >
                  {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Auto-fill Profile
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}