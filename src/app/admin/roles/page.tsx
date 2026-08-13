"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
  Shield, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Lock, 
  UserPlus, 
  Users, 
  Settings,
  ShieldCheck,
  AlertTriangle,
  Edit,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"

interface Permission {
  id: string
  name: string
  description: string
  category: string
}

interface Role {
  id: string
  name: string
  description: string
  permissions: { permission: Permission }[]
  users: { id: string }[]
  createdAt: string
}

export default function RoleManagementPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [roles, setRoles] = useState<Role[]>([])
  const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [expandedRoles, setExpandedRoles] = useState<string[]>([])
  
  // Pagination and filter state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(6)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Form state
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleDescription, setNewRoleDescription] = useState("")
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/roles')
      if (res.ok) {
        const data = await res.json()
        setRoles(data.roles.filter((role: Role) => role.name !== 'Merchant'))
        setAvailablePermissions(data.permissions)
      }
    } catch (error) {
      console.error("Failed to fetch roles:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleRoleExpansion = (roleId: string) => {
    setExpandedRoles(prev => 
      prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]
    )
  }

  const handleCreateRole = async () => {
    if (!newRoleName) {
      toast({ title: "Name required", variant: "destructive" })
      return
    }

    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoleName,
          description: newRoleDescription,
          permissionIds: selectedPermissions
        })
      })

      if (res.ok) {
        toast({ title: "Role created successfully" })
        setIsCreateDialogOpen(false)
        setNewRoleName("")
        setNewRoleDescription("")
        setSelectedPermissions([])
        fetchData()
      } else {
        const error = await res.json()
        toast({ 
          title: "Failed to create role", 
          description: error.error || "Something went wrong",
          variant: "destructive" 
        })
      }
    } catch (error) {
      toast({ title: "Network error", variant: "destructive" })
    }
  }

  const handleEditRole = async () => {
    if (!selectedRole || !newRoleName) return

    try {
      const res = await fetch(`/api/admin/roles/${selectedRole.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoleName,
          description: newRoleDescription,
          permissionIds: selectedPermissions
        })
      })

      if (res.ok) {
        toast({ title: "Role updated successfully" })
        setIsEditDialogOpen(false)
        setSelectedRole(null)
        setNewRoleName("")
        setNewRoleDescription("")
        setSelectedPermissions([])
        fetchData()
      } else {
        const error = await res.json()
        toast({ 
          title: "Failed to update role", 
          description: error.error || "Something went wrong",
          variant: "destructive" 
        })
      }
    } catch (error) {
      toast({ title: "Network error", variant: "destructive" })
    }
  }

  const handleDeleteRole = async () => {
    if (!selectedRole) return

    try {
      const res = await fetch(`/api/admin/roles/${selectedRole.id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        toast({ title: "Role deleted successfully" })
        setIsDeleteDialogOpen(false)
        setSelectedRole(null)
        fetchData()
      } else {
        const error = await res.json()
        toast({ 
          title: "Failed to delete role", 
          description: error.error || "Something went wrong",
          variant: "destructive" 
        })
      }
    } catch (error) {
      toast({ title: "Network error", variant: "destructive" })
    }
  }

  const userPermissions = user?.permissions || []
  const canCreateRole = userPermissions.includes('ROLE_CREATE')
  const canEditRole = userPermissions.includes('ROLE_EDIT')
  const canDeleteRole = userPermissions.includes('ROLE_DELETE')

  const filteredRoles = roles.filter(role => 
    role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (role.description && role.description.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const totalPages = Math.ceil(filteredRoles.length / itemsPerPage)
  const paginatedRoles = filteredRoles.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  // Group permissions by category
  const groupedPermissions = availablePermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = []
    acc[perm.category].push(perm)
    return acc
  }, {} as Record<string, Permission[]>)

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
          <h2 className="text-2xl font-bold tracking-tight text-[#5b371f]">Permission governance</h2>
          <p className="text-sm text-amber-800/60 font-medium">Manage dynamic roles and granular permissions for your team.</p>
        </div>
        <div>
          {canCreateRole && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all gap-2 px-6">
                  <Plus className="w-4 h-4" /> Create New Role
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-100 bg-white p-0 rounded-2xl shadow-sm">
                <DialogHeader className="p-6 border-b border-slate-50">
                  <DialogTitle className="text-xl font-medium text-slate-800">Create Custom Role</DialogTitle>
                  <DialogDescription className="text-slate-500">
                    Define a new role and assign specific permissions. System boundaries are strictly enforced.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 p-6">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name" className="text-xs font-medium text-slate-500">Role Name</Label>
                      <Input 
                        id="name" 
                        placeholder="e.g. Compliance Officer" 
                        className="h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                      />
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="description" className="text-xs font-medium text-slate-500">Description</Label>
                      <Input 
                        id="description" 
                        placeholder="Briefly describe the purpose of this role" 
                        className="h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm"
                        value={newRoleDescription}
                        onChange={(e) => setNewRoleDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-sm font-bold text-slate-800 uppercase tracking-tight">Permissions Matrix</Label>
                    <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden bg-slate-50/30">
                      {Object.entries(groupedPermissions).map(([category, perms]) => (
                        <div key={category} className="p-5 space-y-4">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-700/70">{category}</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            {perms.map((perm) => {
                              const hasThisPerm = userPermissions.includes(perm.name)
                              return (
                                <div key={perm.id} className="flex items-start space-x-3 group/perm">
                                  <Checkbox 
                                    id={perm.id} 
                                    disabled={!hasThisPerm}
                                    checked={selectedPermissions.includes(perm.id)}
                                    className="mt-1 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600 rounded-md"
                                    onCheckedChange={(checked) => {
                                      if (checked) setSelectedPermissions([...selectedPermissions, perm.id])
                                      else setSelectedPermissions(selectedPermissions.filter(id => id !== perm.id))
                                    }}
                                  />
                                  <div className="grid gap-1.5 leading-none">
                                    <label
                                      htmlFor={perm.id}
                                      className={`text-sm font-semibold tracking-tight transition-colors ${!hasThisPerm ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 cursor-pointer group-hover/perm:text-amber-700'}`}
                                    >
                                      {perm.name === 'DASHBOARD_VIEW' ? 'dashboard.view' : 
                                       perm.name === 'CONFIGURATION_MANAGE' ? 'configuration.manage' : 
                                       perm.name.replace(/_/g, ' ').toLowerCase()}
                                      {!hasThisPerm && (
                                        <span className="ml-2 text-[9px] text-orange-500 font-bold uppercase flex items-center gap-1">
                                          <Lock className="w-2.5 h-2.5" /> Restricted
                                        </span>
                                      )}
                                    </label>
                                    <p className="text-[11px] leading-relaxed text-slate-500 font-medium">
                                      {perm.description}
                                    </p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <DialogFooter className="p-6 border-t border-slate-50 bg-slate-50/50">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50 h-11 px-6">Cancel</Button>
                  <Button onClick={handleCreateRole} className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-11 px-8">Create Role</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Search roles..."
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
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="6">6</SelectItem>
              <SelectItem value="12">12</SelectItem>
              <SelectItem value="24">24</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedRoles.map((role) => {
          const isExpanded = expandedRoles.includes(role.id)
          const rolePerms = role.permissions.map(p => p.permission)
          
          return (
            <Card key={role.id} className="group overflow-hidden rounded-3xl border border-black/5 bg-[#FFFDF7] shadow-sm shadow-amber-950/5 transition-all duration-300 hover:shadow-md hover:-translate-y-1">
              <CardHeader className="bg-[#FFFDF7] pb-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-100/50 rounded-2xl border border-amber-200/50 group-hover:scale-110 transition-transform">
                      <ShieldCheck className="w-5 h-5 text-amber-700" />
                    </div>
                    <div className="flex flex-col">
                      <CardTitle className="text-lg font-bold text-slate-900 tracking-tight">{role.name}</CardTitle>
                      <Badge variant="secondary" className="w-fit mt-1 font-bold text-[10px] bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-100/50 rounded-full px-2 py-0">
                        {role.users.length} Active Users
                      </Badge>
                    </div>
                  </div>
                  {(canEditRole || canDeleteRole) && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                      {canEditRole && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-xl text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                          onClick={() => {
                            setSelectedRole(role)
                            setNewRoleName(role.name)
                            setNewRoleDescription(role.description || "")
                            setSelectedPermissions(role.permissions.map(p => p.permission.id))
                            setIsEditDialogOpen(true)
                          }}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canDeleteRole && !['Super Admin', 'Maker', 'Checker', 'HO Officer', 'Merchant'].includes(role.name) && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          onClick={() => {
                            setSelectedRole(role)
                            setIsDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <CardDescription className="text-slate-600 text-xs font-medium leading-relaxed italic">
                  {role.description || "No description provided for this security level."}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="flex-1 py-0 px-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {rolePerms.slice(0, 3).map(p => (
                      <Badge key={p.id} variant="outline" className="text-[9px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-lg border-black/5 bg-white text-slate-500 group-hover:border-amber-200 group-hover:text-amber-700 transition-colors">
                        {p.name === 'DASHBOARD_VIEW' ? 'dashboard.view' : 
                         p.name === 'CONFIGURATION_MANAGE' ? 'configuration.manage' : 
                         p.name.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    ))}
                    {rolePerms.length > 3 && (
                      <Badge variant="outline" className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-amber-50/50 border-amber-100/50 text-amber-600">
                        +{rolePerms.length - 3} More
                      </Badge>
                    )}
                  </div>
                  
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-amber-900/5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      {Object.entries(
                        rolePerms.reduce((acc, p) => {
                          if (!acc[p.category]) acc[p.category] = []
                          acc[p.category].push(p)
                          return acc
                        }, {} as Record<string, Permission[]>)
                      ).map(([cat, perms]) => (
                        <div key={cat} className="space-y-2">
                          <h5 className="text-[9px] font-bold text-amber-700/60 uppercase tracking-widest">{cat}</h5>
                          <div className="grid grid-cols-1 gap-1">
                            {perms.map(p => (
                              <div key={p.id} className="flex items-center gap-2 text-[11px]">
                                <div className="w-1 h-1 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                                <span className="font-semibold text-slate-700 tracking-tight">
                                  {p.name === 'DASHBOARD_VIEW' ? 'dashboard.view' : 
                                   p.name === 'CONFIGURATION_MANAGE' ? 'configuration.manage' : 
                                   p.name.replace(/_/g, ' ').toLowerCase()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
              
              <CardFooter className="pt-4 pb-5 px-6 border-t border-amber-900/5 mt-5 bg-amber-50/20">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-between text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-amber-700 hover:bg-transparent"
                  onClick={() => toggleRoleExpansion(role.id)}
                >
                  {isExpanded ? "Hide Details" : "View Full Matrix"}
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 mt-8 border border-black/5 rounded-[32px] bg-amber-50/20">
          <div className="text-xs font-medium text-slate-500">
            Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * itemsPerPage, filteredRoles.length)}</span> of <span className="text-slate-900 font-bold">{filteredRoles.length}</span> results
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center px-3 h-8 rounded-xl border border-black/5 bg-white text-xs font-bold text-amber-900 shadow-sm">
              {currentPage} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-xl border-black/10 bg-white text-slate-600 disabled:opacity-50 hover:bg-amber-50/50"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {roles.length === 0 && !isLoading && (
        <div className="text-center py-20 bg-[#FFFDF7] rounded-[32px] border border-black/5 shadow-sm">
          <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-amber-100">
            <Shield className="w-8 h-8 text-amber-600/50" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No custom roles found</h3>
          <p className="text-slate-500 text-sm max-w-xs mx-auto mt-1 font-medium leading-relaxed">
            Define specialized access levels by creating your first custom security role.
          </p>
          <Button onClick={() => setIsCreateDialogOpen(true)} className="mt-6 rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 px-6 font-bold h-11 transition-all">
            Get Started
          </Button>
        </div>
      )}

      {/* Edit Role Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-100 bg-white p-0 rounded-2xl shadow-sm">
          <DialogHeader className="p-6 border-b border-slate-50">
            <DialogTitle className="text-xl font-medium text-slate-800">Edit Role: {selectedRole?.name}</DialogTitle>
            <DialogDescription className="text-slate-500">
              Update role details and permissions. System boundaries are strictly enforced.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 p-6">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name" className="text-xs font-medium text-slate-500">Role Name</Label>
                <Input 
                  id="edit-name" 
                  className="h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="edit-description" className="text-xs font-medium text-slate-500">Description</Label>
                <Input 
                  id="edit-description" 
                  className="h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200 shadow-sm"
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-bold text-slate-800 uppercase tracking-tight">Permissions Matrix</Label>
              <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 overflow-hidden bg-slate-50/30">
                {Object.entries(groupedPermissions).map(([category, perms]) => (
                  <div key={category} className="p-5 space-y-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-700/70">{category}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                      {perms.map((perm) => {
                        const hasThisPerm = userPermissions.includes(perm.name)
                        return (
                          <div key={perm.id} className="flex items-start space-x-3 group/perm">
                            <Checkbox 
                              id={`edit-${perm.id}`} 
                              disabled={!hasThisPerm}
                              checked={selectedPermissions.includes(perm.id)}
                              className="mt-1 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600 rounded-md"
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedPermissions([...selectedPermissions, perm.id])
                                else setSelectedPermissions(selectedPermissions.filter(id => id !== perm.id))
                              }}
                            />
                            <div className="grid gap-1.5 leading-none">
                              <label
                                htmlFor={`edit-${perm.id}`}
                                className={`text-sm font-semibold tracking-tight transition-colors ${!hasThisPerm ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 cursor-pointer group-hover/perm:text-amber-700'}`}
                              >
                                {perm.name === 'DASHBOARD_VIEW' ? 'dashboard.view' : 
                                 perm.name === 'CONFIGURATION_MANAGE' ? 'configuration.manage' : 
                                 perm.name.replace(/_/g, ' ').toLowerCase()}
                                {!hasThisPerm && (
                                  <span className="ml-2 text-[9px] text-orange-500 font-bold uppercase flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" /> Restricted
                                  </span>
                                )}
                              </label>
                              <p className="text-[11px] leading-relaxed text-slate-500 font-medium">
                                {perm.description}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 border-t border-slate-50 bg-slate-50/50">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50 h-11 px-6">Cancel</Button>
            <Button onClick={handleEditRole} className="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,#f4db9f_0%,#f8b513_55%,#754319_140%)] text-white shadow-sm shadow-amber-950/15 hover:shadow-md hover:shadow-amber-950/20 transition-all h-11 px-8">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px] border border-slate-100 bg-white p-0 rounded-2xl shadow-sm">
          <DialogHeader className="p-6 border-b border-slate-50">
            <DialogTitle className="flex items-center gap-3 text-rose-800 text-xl font-bold tracking-tight">
              <div className="p-2 bg-rose-50 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              Delete Security Role
            </DialogTitle>
            <DialogDescription className="text-slate-500 mt-2">
              Are you sure you want to delete <span className="font-bold text-slate-900 italic">"{selectedRole?.name}"</span>? 
              This action is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-6">
            {selectedRole && selectedRole.users.length > 0 ? (
              <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-2xl text-sm text-rose-800 flex gap-3 shadow-inner">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold mb-1 uppercase tracking-wider text-[10px]">Action Blocked</p>
                  <p className="font-medium leading-relaxed">There are currently <span className="font-bold underline">{selectedRole.users.length}</span> active users assigned to this role. Please reassign them before attempting deletion.</p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl text-sm text-amber-800 flex gap-3 shadow-inner">
                <Shield className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold mb-1 uppercase tracking-wider text-[10px]">Ready for removal</p>
                  <p className="font-medium leading-relaxed">This role is currently unused. It can be safely removed from the system registry.</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-6 border-t border-slate-50 bg-slate-50/50">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="rounded-xl border-amber-200 text-amber-900 hover:bg-amber-50 h-11 px-6">Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteRole}
              className="rounded-xl h-11 px-6 font-bold shadow-lg shadow-rose-900/20 transition-all hover:-translate-y-0.5"
              disabled={!!(selectedRole && selectedRole.users.length > 0)}
            >
              Confirm Deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
