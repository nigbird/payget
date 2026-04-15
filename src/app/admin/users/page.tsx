"use client"

import { useState, useEffect } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
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
  GitBranch
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { useSession } from "next-auth/react"

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
  createdAt: string
}

interface Role {
  id: string
  name: string
  permissions: { permission: { name: string } }[]
}

export default function UserManagementPage() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedUser, setSelectedForEdit] = useState<UserRecord | null>(null)
  
  // Form state
  const [newUserName, setNewUserName] = useState("")
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserPassword, setNewUserPassword] = useState("")
  const [newUserPasswordVisible, setNewUserPasswordVisible] = useState(false)
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
    if (!newUserName || !newUserEmail || !selectedRoleId || !newUserPassword) {
      toast({ title: "Missing fields", variant: "destructive" })
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

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const userPermissions = (session?.user as any)?.permissions || []
  const isSuperAdmin = userPermissions.includes('DASHBOARD_GLOBAL_VIEW')
  const canCreateUser = isSuperAdmin || userPermissions.includes('USER_CREATE')

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">Staff management</h2>
        <p className="text-sm text-slate-600">Manage administrative and merchant user access levels.</p>
      </div>
      <div className="flex justify-end">
        {canCreateUser && (
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="w-4 h-4" /> Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Add New User</DialogTitle>
                      <DialogDescription>
                        Create a new staff account and assign a role. Security checks will ensure no privilege escalation.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Full Name</Label>
                        <div className="relative">
                          <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="name" 
                            className="pl-9" 
                            placeholder="John Doe" 
                            value={newUserName}
                            onChange={(e) => setNewUserName(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email Address</Label>
                        <div className="relative">
                          <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="email" 
                            type="email" 
                            className="pl-9" 
                            placeholder="john@example.com" 
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="password">Initial Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="password" 
                            type={newUserPasswordVisible ? "text" : "password"} 
                            className="pr-11 pl-9" 
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => setNewUserPasswordVisible((visible) => !visible)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-500 hover:bg-primary/10 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                            aria-label={newUserPasswordVisible ? "Hide password" : "Show password"}
                          >
                            {newUserPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>Role Assignment</Label>
                        <Select onValueChange={setSelectedRoleId} value={selectedRoleId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((role) => {
                              const rolePerms = role.permissions.map(p => p.permission.name)
                              const hasEscalation = !isSuperAdmin && rolePerms.some(p => !userPermissions.includes(p))
                              
                              return (
                                <SelectItem 
                                  key={role.id} 
                                  value={role.id} 
                                  disabled={hasEscalation}
                                >
                                  <div className="flex flex-col">
                                    <span>{role.name}</span>
                                    {hasEscalation && (
                                      <span className="text-[10px] text-orange-500 font-normal">Restricted (Contains higher perms)</span>
                                    )}
                                  </div>
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <Label className="text-base">Head Office</Label>
                          <div className="text-[10px] text-muted-foreground">
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
                            <Label htmlFor="district">District</Label>
                            <Select onValueChange={setDistrict} value={district}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select District" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableDistricts.filter(d => d.active).map((d, i) => (
                                  <SelectItem key={i} value={d.name}>{d.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="branch">Branch Name</Label>
                            <Select onValueChange={setBranch} value={branch}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Branch" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableBranches.filter(b => b.active).map((b, i) => (
                                  <SelectItem key={i} value={b.name}>{b.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreateUser}>Create User</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
      </div>

            <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="bg-white border-b space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search users by name or email..." 
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary/5">
                      <TableHead className="pl-6">User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined Date</TableHead>
                      <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id} className="group hover:bg-primary/5 transition-colors">
                        <TableCell className="pl-6 py-4">
                          <div className="flex flex-col">
                            <span className={`font-medium ${user.status === 'DEACTIVATED' ? 'text-muted-foreground line-through' : ''}`}>
                              {user.name}
                            </span>
                            <span className="text-xs text-muted-foreground">{user.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-100/50">
                            {user.customRole?.name || 'Staff'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            {user.merchant ? (
                              <span className="text-sm font-medium">{user.merchant.name}</span>
                            ) : user.isHeadOffice ? (
                              <Badge variant="outline" className="w-fit bg-primary/10 text-primary-foreground border-primary/20">Head Office</Badge>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-semibold flex items-center gap-1">
                                  <MapPin className="w-3 h-3" /> {user.district || 'N/A'}
                                </span>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <GitBranch className="w-3 h-3" /> {user.branch || 'N/A'}
                                </span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.status === 'ACTIVE' ? 'success' : 'destructive'} className="rounded-full">
                            {user.status === 'ACTIVE' ? 'Active' : 'Deactivated'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => handleEditClick(user)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className={`h-8 w-8 ${user.status === 'ACTIVE' ? 'text-red-600 hover:text-red-700 hover:bg-red-50' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                              onClick={() => handleToggleStatus(user)}
                            >
                              {user.status === 'ACTIVE' ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredUsers.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                          No users found matching your search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update staff account details and organization assignment.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="edit-name" 
                    className="pl-9" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="edit-email" 
                    type="email" 
                    className="pl-9" 
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Role Assignment</Label>
                <Select onValueChange={setEditRoleId} value={editRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Head Office</Label>
                  <div className="text-[10px] text-muted-foreground">
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
                    <Label htmlFor="edit-district">District</Label>
                    <div className="relative">
                      <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="edit-district" 
                        className="pl-9" 
                        value={editDistrict}
                        onChange={(e) => setEditDistrict(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-branch">Branch Name</Label>
                    <div className="relative">
                      <GitBranch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="edit-branch" 
                        className="pl-9" 
                        value={editBranch}
                        onChange={(e) => setEditBranch(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdateUser}>Update User</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
