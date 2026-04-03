"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import type { Merchant, MerchantTeamMember, MerchantTeamRole } from "@/app/lib/db"
import { useToast } from "@/hooks/use-toast"
import { useIsMobile } from "@/hooks/use-mobile"

export default function UserManagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const [merchant, setMerchant] = useState<Merchant | null>(null)
  const [teamMembers, setTeamMembers] = useState<MerchantTeamMember[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<MerchantTeamMember | null>(null)

  const [memberForm, setMemberForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "payment_initiator" as MerchantTeamRole,
  })

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
        setMemberForm({ name: "", email: "", phone: "", role: "payment_initiator" })
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
        setSelectedMember(null)
        setMemberForm({ name: "", email: "", phone: "", role: "payment_initiator" })
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
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/40 bg-white/65 p-5 md:p-7 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={`/merchant/${id}`} className="p-2 rounded-xl bg-white/80 border border-white/70 hover:bg-white transition-colors">
              <ArrowLeft className="h-5 w-5 text-[#754319]" />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#754319]/70">Management</p>
              <h1 className="mt-1 text-2xl md:text-3xl font-bold text-[#5b371f]">Users & Roles</h1>
            </div>
          </div>
          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="h-11 rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-700/30 hover:-translate-y-0.5 transition-all"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add Team Member
          </Button>
        </div>
      </section>

      <section>
        <Card className="rounded-3xl border-white/60 bg-white/65 shadow-md backdrop-blur-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
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
                          className={`rounded-full px-3 py-0.5 text-[11px] font-medium border-0 ${
                            member.role === "account_admin"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {member.role === "account_admin" ? (
                            <ShieldCheck className="mr-1 h-3 w-3" />
                          ) : (
                            <ShieldAlert className="mr-1 h-3 w-3" />
                          )}
                          {member.role === "account_admin" ? "Account Admin" : "Payment Initiator"}
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 rounded-lg hover:bg-white/50">
                              <MoreVertical className="h-4 w-4 text-[#754319]" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-2xl border-white/60 bg-white/95 backdrop-blur-md p-1 shadow-xl">
                            <DropdownMenuLabel className="text-xs font-semibold text-[#754319]/50 px-2 py-1.5 uppercase tracking-wider">Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => openEditModal(member)} className="rounded-xl focus:bg-amber-50 focus:text-[#754319] cursor-pointer">
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

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
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
            <div className="p-4 rounded-2xl border border-blue-200/50 bg-blue-50/30">
              <p className="font-bold text-[#5b371f] text-sm">Payment Initiator</p>
              <p className="text-xs text-[#754319]/80 mt-1">Can generate payment links or trigger push payments. No access to settings or team management.</p>
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
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-md border-0 bg-[linear-gradient(180deg,#fffaf0_0%,#fff5de_100%)] p-6 rounded-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-[#5b371f]">Add Team Member</DialogTitle>
            <DialogDescription className="text-[#754319]/70">
              Invite a new member to your merchant team.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddMember} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                className="h-12 rounded-2xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500"
                required
                value={memberForm.name}
                onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                className="h-12 rounded-2xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500"
                required
                value={memberForm.email}
                onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={memberForm.role}
                onValueChange={(val: MerchantTeamRole) => setMemberForm({ ...memberForm, role: val })}
              >
                <SelectTrigger className="h-12 rounded-2xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-white/60 bg-white/95 backdrop-blur-md">
                  <SelectItem value="payment_initiator" className="rounded-xl">Payment Initiator</SelectItem>
                  <SelectItem value="account_admin" className="rounded-xl">Account Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-xl text-[#754319]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-600/30"
              >
                Add Member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Member Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md border-0 bg-[linear-gradient(180deg,#fffaf0_0%,#fff5de_100%)] p-6 rounded-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-[#5b371f]">Edit Team Member</DialogTitle>
            <DialogDescription className="text-[#754319]/70">
              Update details for {selectedMember?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditMember} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                placeholder="John Doe"
                className="h-12 rounded-2xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500"
                required
                value={memberForm.name}
                onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email Address</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="john@example.com"
                className="h-12 rounded-2xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500"
                required
                value={memberForm.email}
                onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={memberForm.role}
                onValueChange={(val: MerchantTeamRole) => setMemberForm({ ...memberForm, role: val })}
              >
                <SelectTrigger className="h-12 rounded-2xl border-white/50 bg-white/85 shadow-sm focus-visible:ring-amber-500">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-white/60 bg-white/95 backdrop-blur-md">
                  <SelectItem value="payment_initiator" className="rounded-xl">Payment Initiator</SelectItem>
                  <SelectItem value="account_admin" className="rounded-xl">Account Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIsEditModalOpen(false)
                  setSelectedMember(null)
                }}
                className="rounded-xl text-[#754319]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-xl bg-gradient-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-600/30"
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
