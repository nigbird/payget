"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isValidName, isValidEmail, isValidPhoneNumber } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Users,
  UserPlus,
  MoreVertical,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Phone,
  Calendar,
  UserCog,
  UserMinus,
  UserCheck,
  ChevronRight,
  ArrowLeft,
} from "lucide-react"
import type { Merchant, MerchantTeamMember, MerchantTeamRole } from "@/lib/db"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"

const ROLE_BADGE: Record<MerchantTeamRole, { label: string; className: string }> = {
  account_admin: { label: "Account Admin", className: "bg-amber-100 text-amber-800" },
  sales_admin: { label: "Sales Admin", className: "bg-purple-100 text-purple-800" },
  payment_initiator: { label: "Sales", className: "bg-blue-100 text-blue-800" },
}

export default function UserManagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [teamMembers, setTeamMembers] = useState<MerchantTeamMember[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<MerchantTeamMember | null>(null)

  // Safety fix for Radix UI modal pointer-events lock issue
  useEffect(() => {
    if (!isAddModalOpen && !isEditModalOpen) {
      const timer = setTimeout(() => {
        document.body.style.pointerEvents = "auto"
      }, 300) // Small delay to allow animations to finish
      return () => clearTimeout(timer)
    }
  }, [isAddModalOpen, isEditModalOpen])

  const [memberForm, setMemberForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "payment_initiator" as MerchantTeamRole,
  })

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const validateField = (field: string, value: string, isRequired = false): string | null => {
    if (field === 'name') {
      if (value.trim() && !isValidName(value)) {
        if (value.trim().length < 2) {
          return 'Name must be at least 2 characters'
        }
        if (value.trim().length > 50) {
          return 'Name must not exceed 50 characters'
        }
      }
    }
    if (field === 'email') {
      if (value.trim() && !isValidEmail(value)) {
        if (value.trim().length > 50) {
          return 'Email must not exceed 50 characters'
        }
        return 'Please enter a valid email address'
      }
    }
    if (field === 'phone' && value.trim()) {
      if (!isValidPhoneNumber(value)) {
        return 'Valid formats: +2519XXXXXXXXX, 2519XXXXXXXXX, 09XXXXXXXX, 9XXXXXXXX'
      }
    }
    return null
  }

  const handleFieldChange = (field: string, value: string) => {
    setMemberForm(prev => ({ ...prev, [field]: value }))
  }

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}
    
    if (!memberForm.name.trim()) {
      errors.name = 'Name is required'
    } else {
      const nameError = validateField('name', memberForm.name)
      if (nameError) errors.name = nameError
    }
    
    if (!memberForm.email.trim()) {
      errors.email = 'Email is required'
    } else {
      const emailError = validateField('email', memberForm.email)
      if (emailError) errors.email = emailError
    }
    
    const phoneError = memberForm.phone.trim() ? validateField('phone', memberForm.phone) : null
    if (phoneError) errors.phone = phoneError

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  useEffect(() => {
    const fetchMerchant = async () => {
      try {
        const response = await fetch(`/api/merchants/${id}`)
        if (response.ok) {
          const m = await response.json()
          setMerchant(m)
          refreshTeam()
        }
      } catch (error) {
        console.error('Failed to fetch merchant:', error)
      }
    }
    fetchMerchant()
  }, [id])

  const refreshTeam = async () => {
    try {
      const response = await fetch(`/api/merchants/${id}/team`)
      if (response.ok) {
        const members = await response.json()
        setTeamMembers(members)
      }
    } catch (error) {
      console.error('Failed to fetch team members:', error)
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) {
      return
    }
    try {
      const newMemberData = {
        name: memberForm.name,
        email: memberForm.email,
        phone: memberForm.phone || undefined,
        role: memberForm.role,
        status: "active",
      }
      
      const response = await fetch(`/api/merchants/${id}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMemberData)
      })

      if (response.ok) {
        const member = await response.json()
        refreshTeam()
        setIsAddModalOpen(false)
        setFormErrors({})
        toast({
          title: "Member Added",
          description: `${member.name} has been added to your team.`,
        })
      } else {
        throw new Error('Failed to add member')
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Add Failed",
        description: "Could not add team member at this time."
      })
    }
  }

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMember) return
    if (!validateForm()) {
      return
    }
    try {
      const response = await fetch(`/api/merchants/${id}/team`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMember.id,
          name: memberForm.name,
          email: memberForm.email,
          phone: memberForm.phone || undefined,
          role: memberForm.role,
        })
      })

      if (response.ok) {
        refreshTeam()
        setIsEditModalOpen(false)
        setFormErrors({})
        toast({
          title: "Member Updated",
          description: `Team member details have been updated.`,
        })
      } else {
        throw new Error('Failed to update member')
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not update team member at this time."
      })
    }
  }

  const toggleMemberStatus = async (member: MerchantTeamMember) => {
    const newStatus = member.status === "active" ? "deactivated" : "active"
    try {
      const response = await fetch(`/api/merchants/${id}/team`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.id,
          active: newStatus === "active"
        })
      })

      if (response.ok) {
        refreshTeam()
        toast({
          title: newStatus === "active" ? "Member Activated" : "Member Deactivated",
          description: `${member.name} is now ${newStatus}.`,
        })
      } else {
        throw new Error('Failed to toggle status')
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: "Could not update member status at this time."
      })
    }
  }

  const openEditModal = (member: MerchantTeamMember) => {
    setSelectedMember(member)
    setMemberForm({
      name: member.name,
      email: member.email,
      phone: member.phone || "",
      role: member.role,
    })
    setIsEditModalOpen(true)
  }

  if (!merchant) return null

  return (
    <div className="space-y-6 pb-6">
      <section className="rounded-3xl border border-white/40 bg-white/65 p-4 md:p-7 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={`/merchant/${id}`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/70 bg-white/80 hover:bg-white transition-colors">
              <ArrowLeft className="h-5 w-5 text-[#754319]" />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Management</p>
              <h1 className="mt-1 text-2xl md:text-3xl font-bold text-[#5b371f]">Users & Roles</h1>
            </div>
          </div>
          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add Team Member
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-3 md:hidden">
          {teamMembers.map((member) => (
            <Card key={`mobile-${member.id}`} className="rounded-2xl border-white/60 bg-white/85 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-gradient-to-br from-[#f8b513]/20 to-[#754319]/20 shadow-sm">
                    <span className="text-sm font-bold text-[#754319]">{member.name.split(" ").map(n => n[0]).join("").toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#5b371f]">{member.name}</p>
                    <p className="truncate text-xs text-[#754319]/70">{member.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`rounded-full px-3 py-0.5 text-[11px] font-medium border-0 ${ROLE_BADGE[member.role].className}`}
                  >
                    {ROLE_BADGE[member.role].label}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`rounded-full px-3 py-0.5 text-[11px] font-medium border-0 ${
                      member.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {member.status === "active" ? "Active" : "Deactivated"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => openEditModal(member)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl"
                    onClick={() => toggleMemberStatus(member)}
                  >
                    {member.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-3xl border-white/60 bg-white/65 shadow-md backdrop-blur-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader className="bg-white/40">
                  <TableRow className="border-white/40 hover:bg-transparent">
                    <TableHead className="py-4 text-[#754319] font-semibold">User</TableHead>
                    <TableHead className="py-4 text-[#754319] font-semibold">Role</TableHead>
                    <TableHead className="py-4 text-[#754319] font-semibold">Status</TableHead>
                    <TableHead className="py-4 text-[#754319] font-semibold">Joined</TableHead>
                    <TableHead className="py-4 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member) => (
                    <TableRow key={member.id} className="border-white/40 hover:bg-white/30 transition-colors">
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#f8b513]/20 to-[#754319]/20 flex items-center justify-center border border-white/50 shadow-sm">
                            <span className="text-sm font-bold text-[#754319]">{member.name.split(" ").map(n => n[0]).join("").toUpperCase()}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-[#5b371f]">{member.name}</p>
                            <p className="text-xs text-[#754319]/70">{member.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge
                          variant="outline"
                          className={`rounded-full px-3 py-0.5 text-[11px] font-medium border-0 ${ROLE_BADGE[member.role].className}`}
                        >
                          {member.role === "payment_initiator" ? (
                            <ShieldAlert className="mr-1 h-3 w-3" />
                          ) : (
                            <ShieldCheck className="mr-1 h-3 w-3" />
                          )}
                          {ROLE_BADGE[member.role].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge
                          variant="outline"
                          className={`rounded-full px-3 py-0.5 text-[11px] font-medium border-0 ${
                            member.status === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {member.status === "active" ? "Active" : "Deactivated"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-[#754319]/70">
                        {new Date(member.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 rounded-lg hover:bg-white/50">
                              <MoreVertical className="h-4 w-4 text-[#754319]" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-2xl border-white/60 bg-white/95 backdrop-blur-md p-1 shadow-xl">
                            <DropdownMenuLabel className="text-xs font-semibold text-[#754319]/50 px-2 py-1.5 uppercase tracking-wider">Actions</DropdownMenuLabel>
                            <DropdownMenuItem 
                              onSelect={(e) => {
                                e.preventDefault()
                                openEditModal(member)
                              }} 
                              className="rounded-xl focus:bg-amber-50 focus:text-[#754319] cursor-pointer"
                            >
                              <UserCog className="mr-2 h-4 w-4" />
                              Edit Member
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => toggleMemberStatus(member)}
                              className={`rounded-xl cursor-pointer ${
                                member.status === "active"
                                  ? "text-rose-600 focus:bg-rose-50 focus:text-rose-700"
                                  : "text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700"
                              }`}
                            >
                              {member.status === "active" ? (
                                <>
                                  <UserMinus className="mr-2 h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-12">
        <Card className="rounded-3xl border-white/60 bg-white/65 shadow-md backdrop-blur-sm p-6">
          <h3 className="text-lg font-bold text-[#5b371f] mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            Role Permissions
          </h3>
          <div className="space-y-4">
            <div className="p-4 rounded-2xl border border-amber-200/50 bg-amber-50/30">
              <p className="font-bold text-[#5b371f] text-sm">Account Admin</p>
              <p className="text-xs text-[#754319]/80 mt-1">Full control over merchant settings, including configuration, profile settings, and team management.</p>
            </div>
            <div className="p-4 rounded-2xl border border-purple-200/50 bg-purple-50/30">
              <p className="font-bold text-[#5b371f] text-sm">Sales Admin</p>
              <p className="text-xs text-[#754319]/80 mt-1">Can generate payment links or trigger push payments, and view every transaction made by the sales team, including QR customer payments. No access to settings or team management.</p>
            </div>
            <div className="p-4 rounded-2xl border border-blue-200/50 bg-blue-50/30">
              <p className="font-bold text-[#5b371f] text-sm">Sales</p>
              <p className="text-xs text-[#754319]/80 mt-1">Can generate payment links or trigger push payments. Can only view their own transactions and QR customer payments. No access to settings or team management.</p>
            </div>
          </div>
        </Card>

        <Card className="rounded-3xl border-white/60 bg-white/65 shadow-md backdrop-blur-sm p-6">
          <h3 className="text-lg font-bold text-[#5b371f] mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-600" />
            Team Overview
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-white/70 bg-white/80">
              <p className="text-[10px] uppercase tracking-wider text-[#754319]/70 font-semibold">Total Members</p>
              <p className="text-3xl font-black text-[#5b371f] mt-1">{teamMembers.length}</p>
            </div>
            <div className="p-4 rounded-2xl border border-white/70 bg-white/80">
              <p className="text-[10px] uppercase tracking-wider text-[#754319]/70 font-semibold">Active</p>
              <p className="text-3xl font-black text-emerald-600 mt-1">{teamMembers.filter(m => m.status === "active").length}</p>
            </div>
          </div>
        </Card>
      </section>

      {/* Add Member Modal */}
      <Dialog 
        open={isAddModalOpen} 
        onOpenChange={(open) => {
          setIsAddModalOpen(open)
          if (!open) {
            setMemberForm({ name: "", email: "", phone: "", role: "payment_initiator" })
            setFormErrors({})
          } else {
            setFormErrors({})
          }
        }}
      >
        <DialogContent className="max-w-md border border-slate-100 bg-white p-0 rounded-2xl shadow-sm max-h-[90vh] overflow-hidden">
          <DialogHeader className="p-6 border-b border-slate-50">
            <DialogTitle className="text-xl font-medium text-slate-800">Add Team Member</DialogTitle>
            <DialogDescription className="text-slate-500">
              Invite a new member to your merchant team.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddMember} className="space-y-4 px-4 sm:px-6 py-4 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium text-slate-500">Full Name</Label>
              <Input
                id="name"
                placeholder="Abebe Kebede"
                className={`h-11 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300 ${formErrors.name ? 'border-red-500' : ''}`}
                required
                maxLength={50}
                value={memberForm.name}
                onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
              />
              {formErrors.name && (
                <p className="text-[10px] text-red-500 font-medium">{formErrors.name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-slate-500">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="abebe@example.com"
                className={`h-11 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300 ${formErrors.email ? 'border-red-500' : ''}`}
                required
                maxLength={50}
                value={memberForm.email}
                onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
              />
              {formErrors.email && (
                <p className="text-[10px] text-red-500 font-medium">{formErrors.email}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs font-medium text-slate-500">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="0912345678"
                className={`h-11 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300 ${formErrors.phone ? 'border-red-500' : ''}`}
                maxLength={15}
                value={memberForm.phone}
                onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
              />
              {formErrors.phone && (
                <p className="text-[10px] text-red-500 font-medium">{formErrors.phone}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role" className="text-xs font-medium text-slate-500">Role</Label>
              <Select
                value={memberForm.role}
                onValueChange={(val: MerchantTeamRole) => setMemberForm({ ...memberForm, role: val })}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 bg-white">
                  <SelectItem value="payment_initiator" className="rounded-lg">Sales</SelectItem>
                  <SelectItem value="sales_admin" className="rounded-lg">Sales Admin</SelectItem>
                  <SelectItem value="account_admin" className="rounded-lg">Account Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-4 pb-2 flex-col sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50 h-11 shadow-sm transition-colors"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-11"
              >
                Add Member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Member Modal */}
      <Dialog 
        open={isEditModalOpen} 
        onOpenChange={(open) => {
          setIsEditModalOpen(open)
          if (!open) {
            setSelectedMember(null)
            setMemberForm({ name: "", email: "", phone: "", role: "payment_initiator" })
            setFormErrors({})
          } else {
            setFormErrors({})
          }
        }}
      >
        <DialogContent className="max-w-md border border-slate-100 bg-white p-0 rounded-2xl shadow-sm max-h-[90vh] overflow-hidden">
          <DialogHeader className="p-6 border-b border-slate-50">
            <DialogTitle className="text-xl font-medium text-slate-800">Edit Team Member</DialogTitle>
            <DialogDescription className="text-slate-500">
              Update details for {selectedMember?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditMember} className="space-y-4 px-4 sm:px-6 py-4 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs font-medium text-slate-500">Full Name</Label>
              <Input
                id="edit-name"
                placeholder="Abebe Kebede"
                className={`h-11 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300 ${formErrors.name ? 'border-red-500' : ''}`}
                required
                maxLength={50}
                value={memberForm.name}
                onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
              />
              {formErrors.name && (
                <p className="text-[10px] text-red-500 font-medium">{formErrors.name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email" className="text-xs font-medium text-slate-500">Email Address</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="abebe@example.com"
                className={`h-11 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300 ${formErrors.email ? 'border-red-500' : ''}`}
                required
                maxLength={50}
                value={memberForm.email}
                onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
              />
              {formErrors.email && (
                <p className="text-[10px] text-red-500 font-medium">{formErrors.email}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone" className="text-xs font-medium text-slate-500">Phone Number</Label>
              <Input
                id="edit-phone"
                type="tel"
                placeholder="+251934567890"
                className={`h-11 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300 ${formErrors.phone ? 'border-red-500' : ''}`}
                maxLength={15}
                value={memberForm.phone}
                onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
              />
              {formErrors.phone && (
                <p className="text-[10px] text-red-500 font-medium">{formErrors.phone}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role" className="text-xs font-medium text-slate-500">Role</Label>
              <Select
                value={memberForm.role}
                onValueChange={(val: MerchantTeamRole) => setMemberForm({ ...memberForm, role: val })}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:ring-slate-200 focus-visible:border-slate-300">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 bg-white">
                  <SelectItem value="payment_initiator" className="rounded-lg">Sales</SelectItem>
                  <SelectItem value="sales_admin" className="rounded-lg">Sales Admin</SelectItem>
                  <SelectItem value="account_admin" className="rounded-lg">Account Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-4 pb-2 flex-col sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
                className="rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50 h-11 shadow-sm transition-colors"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-11"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
