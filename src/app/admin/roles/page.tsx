"use client"

import { useState, useEffect } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/layout/sidebar-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
  Trash2
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useSession } from "next-auth/react"

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
  const { data: session } = useSession()
  const { toast } = useToast()
  const [roles, setRoles] = useState<Role[]>([])
  const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [expandedRoles, setExpandedRoles] = useState<string[]>([])
  
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
        setRoles(data.roles)
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

  const userPermissions = (session?.user as any)?.permissions || []
  const isSuperAdmin = userPermissions.includes('DASHBOARD_GLOBAL_VIEW')
  const canCreateRole = isSuperAdmin || userPermissions.includes('ROLE_CREATE')
  const canEditRole = isSuperAdmin || userPermissions.includes('ROLE_EDIT')
  const canDeleteRole = isSuperAdmin || userPermissions.includes('ROLE_DELETE')

  // Group permissions by category
  const groupedPermissions = availablePermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = []
    acc[perm.category].push(perm)
    return acc
  }, {} as Record<string, Permission[]>)

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-white/50 bg-white/70 backdrop-blur-md px-4 sticky top-0 z-50">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <Shield className="text-[#754319] w-5 h-5" />
            <h1 className="text-lg font-bold text-[#5b371f] font-headline tracking-tight text-white">Role Management</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-slate-50/50">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">System Roles</h2>
                <p className="text-muted-foreground">Manage dynamic roles and granular permissions for your team.</p>
              </div>
              {canCreateRole && (
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="w-4 h-4" /> Create New Role
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create Custom Role</DialogTitle>
                      <DialogDescription>
                        Define a new role and assign specific permissions. You can only assign permissions you currently possess.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-6 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Role Name</Label>
                        <Input 
                          id="name" 
                          placeholder="e.g. Compliance Officer" 
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Input 
                          id="description" 
                          placeholder="Briefly describe the purpose of this role" 
                          value={newRoleDescription}
                          onChange={(e) => setNewRoleDescription(e.target.value)}
                        />
                      </div>

                      <div className="space-y-4">
                        <Label>Permissions Matrix</Label>
                        <div className="border rounded-md divide-y">
                          {Object.entries(groupedPermissions).map(([category, perms]) => (
                            <div key={category} className="p-4 space-y-3">
                              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{category}</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {perms.map((perm) => {
                                  const hasThisPerm = isSuperAdmin || userPermissions.includes(perm.name)
                                  return (
                                    <div key={perm.id} className="flex items-start space-x-3">
                                      <Checkbox 
                                        id={perm.id} 
                                        disabled={!hasThisPerm}
                                        checked={selectedPermissions.includes(perm.id)}
                                        onCheckedChange={(checked) => {
                                          if (checked) setSelectedPermissions([...selectedPermissions, perm.id])
                                          else setSelectedPermissions(selectedPermissions.filter(id => id !== perm.id))
                                        }}
                                      />
                                      <div className="grid gap-1.5 leading-none">
                                        <label
                                          htmlFor={perm.id}
                                          className={`text-sm font-medium leading-none ${!hasThisPerm ? 'text-muted-foreground' : ''}`}
                                        >
                                          {perm.name.replace(/_/g, ' ')}
                                          {!hasThisPerm && (
                                            <span className="ml-2 text-[10px] text-orange-500 font-normal flex items-center gap-0.5">
                                              <Lock className="w-2 h-2" /> Restricted
                                            </span>
                                          )}
                                        </label>
                                        <p className="text-xs text-muted-foreground">
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

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreateRole}>Create Role</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roles.map((role) => {
                const isExpanded = expandedRoles.includes(role.id)
                const rolePerms = role.permissions.map(p => p.permission)
                
                return (
                  <Card key={role.id} className="group border-none shadow-sm flex flex-col overflow-hidden">
                    <CardHeader className="bg-white pb-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-slate-100 rounded-lg">
                            <ShieldCheck className="w-5 h-5 text-primary" />
                          </div>
                          {(canEditRole || canDeleteRole) && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {canEditRole && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => {
                                    setSelectedRole(role)
                                    setNewRoleName(role.name)
                                    setNewRoleDescription(role.description || "")
                                    setSelectedPermissions(role.permissions.map(p => p.permission.id))
                                    setIsEditDialogOpen(true)
                                  }}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              )}
                              {canDeleteRole && !['Super Admin', 'Maker', 'Checker', 'HO Officer', 'Merchant'].includes(role.name) && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => {
                                    setSelectedRole(role)
                                    setIsDeleteDialogOpen(true)
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className="font-normal">
                          {role.users.length} Users
                        </Badge>
                      </div>
                      <CardTitle className="text-xl">{role.name}</CardTitle>
                      <CardDescription>{role.description || "No description provided."}</CardDescription>
                    </CardHeader>
                    
                    <CardContent className="flex-1 py-0 px-6">
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-1.5">
                          {rolePerms.slice(0, 3).map(p => (
                            <Badge key={p.id} variant="outline" className="text-[10px] px-1.5 py-0">
                              {p.name}
                            </Badge>
                          ))}
                          {rolePerms.length > 3 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50">
                              +{rolePerms.length - 3} more
                            </Badge>
                          )}
                        </div>
                        
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            {Object.entries(
                              rolePerms.reduce((acc, p) => {
                                if (!acc[p.category]) acc[p.category] = []
                                acc[p.category].push(p)
                                return acc
                              }, {} as Record<string, Permission[]>)
                            ).map(([cat, perms]) => (
                              <div key={cat} className="space-y-2">
                                <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{cat}</h5>
                                <div className="space-y-1">
                                  {perms.map(p => (
                                    <div key={p.id} className="flex items-center gap-2 text-xs">
                                      <div className="w-1 h-1 rounded-full bg-primary" />
                                      <span className="font-medium">{p.name.replace(/_/g, ' ')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                    
                    <CardFooter className="pt-4 pb-4 px-6 border-t mt-auto">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-between text-muted-foreground"
                        onClick={() => toggleRoleExpansion(role.id)}
                      >
                        {isExpanded ? "Show Less" : "View Full Matrix"}
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>

            {roles.length === 0 && !isLoading && (
              <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed">
                <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium">No custom roles found</h3>
                <p className="text-muted-foreground max-w-sm mx-auto">
                  Start by creating a new role with specific permissions for your staff members.
                </p>
              </div>
            )}

            {/* Edit Role Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Role: {selectedRole?.name}</DialogTitle>
                  <DialogDescription>
                    Update role details and permissions. System boundaries are strictly enforced.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Role Name</Label>
                    <Input 
                      id="edit-name" 
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Input 
                      id="edit-description" 
                      value={newRoleDescription}
                      onChange={(e) => setNewRoleDescription(e.target.value)}
                    />
                  </div>

                  <div className="space-y-4">
                    <Label>Permissions Matrix</Label>
                    <div className="border rounded-md divide-y">
                      {Object.entries(groupedPermissions).map(([category, perms]) => (
                        <div key={category} className="p-4 space-y-3">
                          <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{category}</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {perms.map((perm) => {
                              const hasThisPerm = isSuperAdmin || userPermissions.includes(perm.name)
                              return (
                                <div key={perm.id} className="flex items-start space-x-3">
                                  <Checkbox 
                                    id={`edit-${perm.id}`} 
                                    disabled={!hasThisPerm}
                                    checked={selectedPermissions.includes(perm.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) setSelectedPermissions([...selectedPermissions, perm.id])
                                      else setSelectedPermissions(selectedPermissions.filter(id => id !== perm.id))
                                    }}
                                  />
                                  <div className="grid gap-1.5 leading-none">
                                    <label
                                      htmlFor={`edit-${perm.id}`}
                                      className={`text-sm font-medium leading-none ${!hasThisPerm ? 'text-muted-foreground' : ''}`}
                                    >
                                      {perm.name.replace(/_/g, ' ')}
                                      {!hasThisPerm && (
                                        <span className="ml-2 text-[10px] text-orange-500 font-normal flex items-center gap-0.5">
                                          <Lock className="w-2 h-2" /> Restricted
                                        </span>
                                      )}
                                    </label>
                                    <p className="text-xs text-muted-foreground">
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

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleEditRole}>Save Changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete Role Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" /> Delete Role
                  </DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete the role <span className="font-bold text-foreground">"{selectedRole?.name}"</span>? 
                    This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="py-4">
                  {selectedRole && selectedRole.users.length > 0 ? (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-800 flex gap-3">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      <div>
                        <p className="font-bold mb-1">Cannot Delete Role</p>
                        <p>There are currently <span className="font-bold">{selectedRole.users.length}</span> users assigned to this role. Please reassign them before deleting.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This role is not assigned to any users and can be safely removed.
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleDeleteRole}
                    disabled={!!(selectedRole && selectedRole.users.length > 0)}
                  >
                    Delete Role
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
