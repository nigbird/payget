"use client"

import { useState } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Loader2, Sparkles, UserPlus, Globe, Building2, Wallet } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { aiMerchantOnboardingAssistant } from "@/ai/flows/ai-merchant-onboarding-assistant"

export default function MakerPortal() {
  const { toast } = useToast()
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    accountNumber: "",
    dailyLimit: "10000",
    transactionLimit: "1000",
    businessDescription: "",
    websiteUrl: "",
    category: "",
    businessType: ""
  })
  const [riskFactors, setRiskFactors] = useState<string[]>([])

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
    // Simulated backend submission
    toast({
      title: "Merchant Registered",
      description: "Successfully submitted to the Checker Portal for review."
    })
    setFormData({
      name: "",
      email: "",
      accountNumber: "",
      dailyLimit: "10000",
      transactionLimit: "1000",
      businessDescription: "",
      websiteUrl: "",
      category: "",
      businessType: ""
    })
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
          <div className="max-w-4xl mx-auto grid gap-6 grid-cols-1 lg:grid-cols-3">
            
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="shadow-sm border-none">
                <CardHeader>
                  <CardTitle>Company Information</CardTitle>
                  <CardDescription>Capture basic merchant profile and limits.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
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

                    <Separator />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="dailyLimit">Daily Transaction Limit ($)</Label>
                        <Input 
                          id="dailyLimit" 
                          type="number" 
                          value={formData.dailyLimit}
                          onChange={e => setFormData({...formData, dailyLimit: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="transactionLimit">Per Transaction Limit ($)</Label>
                        <Input 
                          id="transactionLimit" 
                          type="number" 
                          value={formData.transactionLimit}
                          onChange={e => setFormData({...formData, transactionLimit: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="websiteUrl">Website URL (Optional)</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
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
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="businessDescription">Business Description</Label>
                      <Textarea 
                        id="businessDescription" 
                        placeholder="Briefly describe the business operations..." 
                        rows={4}
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

                  {formData.category && (
                    <div className="space-y-1">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Suggested Category</Label>
                      <p className="text-sm font-medium">{formData.category}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Maker Principle</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 text-xs font-bold">1</div>
                    <p>Makers input merchant data and verify initial documents.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 text-xs font-bold">2</div>
                    <p>Submission enters 'Pending' state until reviewed by a Checker.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 text-xs font-bold">3</div>
                    <p>Checkers cannot edit data, only approve or reject.</p>
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