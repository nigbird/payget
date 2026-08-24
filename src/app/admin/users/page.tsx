"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog"
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs"
import { 
  Users, 
  Plus, 
  Search, 
  Mail, 
  User, 
  Shield, 
  Building2, 
  Lock,
  Eye,
  EyeOff,
  MoreVertical,
  Edit,
  Trash2,
  Building,
  MapPin,
  GitBranch,
  Loader2,
  Briefcase
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
} from "lucide-react"
import { downloadCsv } from "@/lib/export-csv"

interface UserRecord {
  id: string
  name: string
  email: string
  role: string
  customRoleId: string | null
  customRole: { name: string } | null
  merchantId: string | null
  merchant: { name: string } | null
  isHeadOffice: boolean
  district: string | null
  branch: string | null
  status: 'ACTIVE' | 'DEACTIVATED'
  firstLogin: boolean
  createdAt: string
}

interface Role {
  id: string
  name: string
  permissions: { permission: { name: string } }[]
}

export default function UserManagementPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentTab, setCurrentTab] = useState("staff")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedUser, setSelectedForEdit] = useState<UserRecord | null>(null)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  
  // Form state
  const [newUserName, setNewUserName] = useState("")
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserPassword, setNewUserPassword] = useState("")
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState("")
  const [newUserPasswordVisible, setNewUserPasswordVisible] = useState(false)
  const [newUserConfirmPasswordVisible, setNewUserConfirmPasswordVisible] = useState(false)
  const [selectedRoleId, setSelectedRoleId] = useState("")
  const [isHeadOffice, setIsHeadOffice] = useState(false)
  const [district, setDistrict] = useState("")
  const [branch, setBranch] = useState("")
  const [availableDistricts, setAvailableDistricts] = useState<{ name: string; code?: string; active: boolean }[]>([])
  const [availableBranches, setAvailableBranches] = useState<{ name: string; code?: string; active: boolean }[]>([])

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editRoleId, setEditRoleId] = useState("")
  const [editIsHeadOffice, setEditIsHeadOffice] = useState(false)
  const [editDistrict, setEditDistrict] = useState("")
  const [editBranch, setEditBranch] = useState("")

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)
    try {
      const [usersRes, masterDataRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/master-data')
      ])

      if (usersRes.ok) {
        const data = await usersRes.json()
        setUsers(data.users)
        setRoles(data.roles)
      }
      if (masterDataRes.ok) {
        const masterData = await masterDataRes.json()
        setAvailableDistricts(masterData.districts || [])
        setAvailableBranches(masterData.branches || [])
      }
    } catch (error) {
      console.error("Failed to fetch data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditClick = (user: UserRecord) => {
    setSelectedForEdit(user)
    setEditName(user.name)
    setEditEmail(user.email)
    setEditRoleId(user.customRoleId || "")
    setEditIsHeadOffice(user.isHeadOffice)
    setEditDistrict(user.district || "")
    setEditBranch(user.branch || "")
    setIsEditDialogOpen(true)
  }

  const handleUpdateUser = async () => {
    if (!selectedUser || !editName || !editEmail || !editRoleId) {
      toast({ title: "Missing fields", variant: "destructive" })
      return
    }

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          customRoleId: editRoleId,
          isHeadOffice: editIsHeadOffice,
          district: editIsHeadOffice ? null : editDistrict,
          branch: editIsHeadOffice ? null : editBranch
        })
      })

      if (res.ok) {
        toast({ title: "User updated successfully" })
        setIsEditDialogOpen(false)
        fetchData()
      } else {
        const error = await res.json()
        toast({ title: "Failed to update user", description: error.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Network error", variant: "destructive" })
    }
  }

  const handleToggleStatus = async (user: UserRecord) => {
    const newStatus = user.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE'
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (res.ok) {
        toast({ title: `User ${newStatus.toLowerCase()} successfully` })
        fetchData()
      } else {
        const error = await res.json()
        toast({ title: "Failed to update status", description: error.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Network error", variant: "destructive" })
    }
  }

  const handleCreateUser = async () => {
    if (!newUserName || !newUserEmail || !selectedRoleId || !newUserPassword || !newUserConfirmPassword) {
      toast({ title: "Missing fields", variant: "destructive" })
      return
    }

    if (newUserPassword !== newUserConfirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" })
      return
    }

    if (!isHeadOffice && (!district || !branch)) {
      toast({ title: "District and Branch are required", variant: "destructive" })
      return
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          customRoleId: selectedRoleId,
          isHeadOffice,
          district: isHeadOffice ? null : district,
          branch: isHeadOffice ? null : branch
        })
      })

      if (res.ok) {
        toast({ title: "User created successfully" })
        setIsCreateDialogOpen(false)
        setNewUserName("")
        setNewUserEmail("")
        setNewUserPassword("")
        setNewUserConfirmPassword("")
        setSelectedRoleId("")
        setIsHeadOffice(false)
        setDistrict("")
        setBranch("")
        fetchData()
      } else {
        const error = await res.json()
        toast({ 
          title: "Failed to create user", 
          description: error.error || "Something went wrong",
          variant: "destructive" 
        })
      }
    } catch (error) {
      toast({ title: "Network error", variant: "destructive" })
    }
  }

  const filteredUsers = users.filter(u => {
    const isStaff = u.role !== 'MERCHANT'
    const matchesTab = currentTab === 'staff' ? isStaff : !isStaff
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          u.email.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesTab && matchesSearch
  })

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage)
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const userPermissions = user?.permissions || []
  const canCreateUser = userPermissions.includes('USER_CREATE')

  const handleExport = () => {
    downloadCsv(`users-${currentTab}`, [
      'Name', 'Email', 'Role', 'Organization', 'Status', 'Joined Date'
    ], filteredUsers.map(u => [
      u.name,
      u.email,
      u.customRole?.name || u.role,
      u.merchant?.name || (u.isHeadOffice ? 'Head Office' : u.district || u.branch || ''),
      u.status,
      new Date(u.createdAt).toLocaleDateString()
    ]))
    toast({ title: 'Export Complete', description: `${filteredUsers.length} users exported to CSV` })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-[#5b371f]">Staff management</h2>
          <p className="text-sm text-amber-800/60 font-medium">Manage administrative and merchant user access levels.</p>
        </div>
        <div>
          {canCreateUser && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all gap-2 px-6">
                  <Plus className="w-4 h-4" /> Add User
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[440px] max-h-[90vh] flex flex-col border border-slate-100 bg-white p-0 rounded-2xl shadow-sm">
                <DialogHeader className="p-6 border-b border-slate-50 shrink-0">
                  <DialogTitle className="text-xl font-medium text-slate-800">Add New User</DialogTitle>
                  <DialogDescription className="text-slate-500">
                    Create a new staff account and assign a role. Security checks will ensure no privilege escalation.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 px-6 py-4 overflow-y-auto flex-1">
                  <div className="grid gap-2">
                    <Label htmlFor="name" className="text-xs font-medium text-slate-500">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input 
                        id="name" 
                        className="pl-10 h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm" 
                        placeholder="Abebe Kebede" 
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email" className="text-xs font-medium text-slate-500">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input 
                        id="email" 
                        type="email" 
                        className="pl-10 h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm" 
                        placeholder="abebe@example.com" 
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password" className="text-xs font-medium text-slate-500">Initial Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input 
                        id="password" 
                        type={newUserPasswordVisible ? "text" : "password"} 
                        className="pr-11 pl-10 h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm" 
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setNewUserPasswordVisible((visible) => !visible)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-colors"
                        aria-label={newUserPasswordVisible ? "Hide password" : "Show password"}
                      >
                        {newUserPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="confirm-password" className="text-xs font-medium text-slate-500">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input 
                        id="confirm-password" 
                        type={newUserConfirmPasswordVisible ? "text" : "password"} 
                        className="pr-11 pl-10 h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm" 
                        value={newUserConfirmPassword}
                        onChange={(e) => setNewUserConfirmPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setNewUserConfirmPasswordVisible((visible) => !visible)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-colors"
                        aria-label={newUserConfirmPasswordVisible ? "Hide password" : "Show password"}
                      >
                        {newUserConfirmPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium text-slate-500">Role Assignment</Label>
                    <Select onValueChange={setSelectedRoleId} value={selectedRoleId}>
                      <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-slate-200 shadow-sm">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-200 bg-white">
                        {roles.filter(role => role.name.toLowerCase() !== 'merchant').map((role) => {
                          const rolePerms = role.permissions.map(p => p.permission.name)
                          const hasEscalation = rolePerms.some(p => !userPermissions.includes(p))
                          
                          return (
                            <SelectItem 
                              key={role.id} 
                              value={role.id} 
                              disabled={hasEscalation}
                              className="rounded-lg"
                            >
                              <div className="flex flex-col">
                                <span>{role.name}</span>
                                {hasEscalation && (
                                  <span className="text-[10px] text-amber-600 font-medium">Restricted (Contains higher perms)</span>
                                )}
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium text-slate-800">Head Office</Label>
                      <div className="text-[10px] text-slate-500">
                        Assign user to Head Office or specific branch.
                      </div>
                    </div>
                    <Switch
                      checked={isHeadOffice}
                      onCheckedChange={setIsHeadOffice}
                    />
                  </div>

                  {!isHeadOffice && (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                      <div className="grid gap-2">
                        <Label htmlFor="district" className="text-xs font-medium text-slate-500">District</Label>
                        <Select onValueChange={setDistrict} value={district}>
                          <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-slate-200 shadow-sm">
                            <SelectValue placeholder="Select District" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-slate-200 bg-white">
                            {availableDistricts.filter(d => d.active).map((d, i) => (
                              <SelectItem key={i} value={d.name} className="rounded-lg">{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="branch" className="text-xs font-medium text-slate-500">Branch Name</Label>
                        <Select onValueChange={setBranch} value={branch}>
                          <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-slate-200 shadow-sm">
                            <SelectValue placeholder="Select Branch" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-slate-200 bg-white">
                            {availableBranches.filter(b => b.active).map((b, i) => (
                              <SelectItem key={i} value={b.name} className="rounded-lg">{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="pt-4 px-6 pb-6 border-t border-slate-50 shrink-0">
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    className="rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50 h-11 shadow-sm transition-colors"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateUser}
                    className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-11"
                  >
                    Create User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card className="overflow-hidden rounded-2xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/10">
        <CardHeader className="bg-[#FFFDF7] border-b border-black/5 p-6 pb-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="space-y-1">
              <CardTitle className="text-base tracking-tight">Staff members</CardTitle>
              <CardDescription className="text-slate-600">
                Search, filter, and manage administrative and merchant user accounts.
              </CardDescription>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="Search users..."
                  className="h-10 rounded-2xl border-black/10 bg-white pl-9 focus-visible:ring-2 focus-visible:ring-[#f8b513]/30"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Show</span>
                <Select 
                  value={String(itemsPerPage)} 
                  onValueChange={(val) => {
                    setItemsPerPage(Number(val))
                    setCurrentPage(1)
                  }}
                >
                  <SelectTrigger className="h-10 w-20 rounded-2xl border-black/10 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                className="h-10 rounded-2xl border-black/10 bg-white hover:bg-amber-50/50 transition-colors"
                onClick={handleExport}
              >
                <Download className="h-4 w-4 mr-2 text-[#754319]" />
                Export
              </Button>
            </div>
          </div>

          <Tabs defaultValue="staff" value={currentTab} onValueChange={(v) => {
            setCurrentTab(v)
            setCurrentPage(1)
          }} className="w-full">
            <TabsList className="w-full justify-start bg-transparent h-12 p-0 gap-8 border-0">
              <TabsTrigger 
                value="staff" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-amber-700 data-[state=active]:border-b-2 data-[state=active]:border-amber-600 rounded-none px-1 h-full text-sm font-semibold text-slate-500 transition-all gap-2"
              >
                <Users className="w-4 h-4" /> Internal Staff
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 bg-slate-100 text-slate-600 font-bold border-0">
                  {users.filter(u => u.role !== 'MERCHANT').length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="merchants" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-amber-700 data-[state=active]:border-b-2 data-[state=active]:border-amber-600 rounded-none px-1 h-full text-sm font-semibold text-slate-500 transition-all gap-2"
              >
                <Briefcase className="w-4 h-4" /> Merchant Users
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 bg-slate-100 text-slate-600 font-bold border-0">
                  {users.filter(u => u.role === 'MERCHANT').length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] hover:bg-white/95">
                  <TableHead className="pl-6 py-4 text-xs font-semibold tracking-wide text-slate-700">User</TableHead>
                  <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Role</TableHead>
                  <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Organization</TableHead>
                  <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Status</TableHead>
                  <TableHead className="py-4 text-xs font-semibold tracking-wide text-slate-700">Joined Date</TableHead>
                  <TableHead className="text-right pr-6 py-4 text-xs font-semibold tracking-wide text-slate-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedUsers.map((user) => (
                  <TableRow key={user.id} className="bg-[#FFFDF7] group transition-all duration-200 hover:bg-amber-50/40 hover:shadow-sm">
                    <TableCell className="pl-6 py-5 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <span className={`font-semibold text-slate-950 ${user.status === 'DEACTIVATED' ? 'text-slate-400 line-through' : ''}`}>
                          {user.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{user.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-5 align-middle">
                      <Badge variant="secondary" className="font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-100/50 rounded-lg px-2 py-0.5 capitalize">
                        {user.customRole?.name || (user.role === 'MERCHANT' ? 'Merchant' : 'Staff')}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-5 align-middle">
                      <div className="flex flex-col gap-1">
                        {user.merchant ? (
                          <span className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" /> {user.merchant.name}
                          </span>
                        ) : user.isHeadOffice ? (
                          <div className="flex items-center gap-1.5 text-slate-800">
                            <Building className="w-3.5 h-3.5 text-amber-600" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Head Office</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" /> {user.district || 'N/A'}
                            </span>
                            <span className="text-[10px] text-slate-500 flex items-center gap-1.5 ml-0.5">
                              <GitBranch className="w-3 h-3" /> {user.branch || 'N/A'}
                            </span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-5 align-middle">
                      <Badge 
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border-0 ${
                          user.status === 'ACTIVE' 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {user.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-5 align-middle text-[11px] text-slate-500 font-medium">
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </TableCell>
                    <TableCell className="py-5 align-middle text-right pr-6">
                      <div className="flex justify-end gap-1">
                        {user.role !== 'MERCHANT' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 rounded-2xl text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                            onClick={() => handleEditClick(user)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className={`h-9 w-9 rounded-2xl transition-colors ${
                            user.status === 'ACTIVE' 
                              ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50' 
                              : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                          }`}
                          onClick={() => handleToggleStatus(user)}
                        >
                          {user.status === 'ACTIVE' ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedUsers.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
                          <Search className="w-6 h-6 text-slate-300" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">No users found</p>
                          <p className="text-xs text-slate-500 mt-1">Try adjusting your search filters.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-black/5 bg-amber-50/20">
              <div className="text-xs font-medium text-slate-500">
                Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> of <span className="text-slate-900 font-bold">{filteredUsers.length}</span> results
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                
                <div className="flex items-center gap-1 mx-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = currentPage
                    if (totalPages <= 5) pageNum = i + 1
                    else if (currentPage <= 3) pageNum = i + 1
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                    else pageNum = currentPage - 2 + i

                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        className={`h-8 min-w-[32px] rounded-2xl border-black/10 text-xs font-bold transition-all ${
                          currentPage === pageNum 
                            ? "bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white border-white/30 shadow-sm shadow-amber-950/15" 
                            : "bg-white text-slate-600 hover:bg-amber-50/50"
                        }`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px] border border-slate-100 bg-white p-0 rounded-2xl shadow-sm">
            <DialogHeader className="p-6 border-b border-slate-50">
              <DialogTitle className="text-xl font-medium text-slate-800">Edit User</DialogTitle>
              <DialogDescription className="text-slate-500">
                Update staff account details and organization assignment.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 px-6 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name" className="text-xs font-medium text-slate-500">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    id="edit-name" 
                    className="pl-10 h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-email" className="text-xs font-medium text-slate-500">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    id="edit-email" 
                    type="email" 
                    className="pl-10 h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm" 
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-medium text-slate-500">Role Assignment</Label>
                <Select onValueChange={setEditRoleId} value={editRoleId}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-slate-200 shadow-sm">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 bg-white">
                    {roles.filter(role => role.name.toLowerCase() !== 'merchant').map((role) => (
                      <SelectItem key={role.id} value={role.id} className="rounded-lg">
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium text-slate-800">Head Office</Label>
                  <div className="text-[10px] text-slate-500">
                    Assign user to Head Office or specific branch.
                  </div>
                </div>
                <Switch
                  checked={editIsHeadOffice}
                  onCheckedChange={setEditIsHeadOffice}
                />
              </div>

              {!editIsHeadOffice && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-district" className="text-xs font-medium text-slate-500">District</Label>
                    <Select onValueChange={setEditDistrict} value={editDistrict}>
                      <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-slate-200 shadow-sm">
                        <SelectValue placeholder="Select District" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-200 bg-white">
                        {availableDistricts.filter(d => d.active).map((d, i) => (
                          <SelectItem key={i} value={d.name} className="rounded-lg">{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-branch" className="text-xs font-medium text-slate-500">Branch Name</Label>
                    <Select onValueChange={setEditBranch} value={editBranch}>
                      <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-slate-200 shadow-sm">
                        <SelectValue placeholder="Select Branch" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-200 bg-white">
                        {availableBranches.filter(b => b.active).map((b, i) => (
                          <SelectItem key={i} value={b.name} className="rounded-lg">{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-4 px-6 pb-6">
              <Button 
                variant="outline" 
                onClick={() => setIsEditDialogOpen(false)}
                className="rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50 h-11 shadow-sm transition-colors"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateUser}
                className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-11"
              >
                Update User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
