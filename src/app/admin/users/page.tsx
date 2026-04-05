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
  MoreVertical,
  Edit,
  Trash2
} from "lucide-react"
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
  
  // Form state
  const [newUserName, setNewUserName] = useState("")
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserPassword, setNewUserPassword] = useState("password123")
  const [selectedRoleId, setSelectedRoleId] = useState("")

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
        setRoles(data.roles)
      }
    } catch (error) {
      console.error("Failed to fetch users:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateUser = async () => {
    if (!newUserName || !newUserEmail || !selectedRoleId) {
      toast({ title: "Missing fields", variant: "destructive" })
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
          customRoleId: selectedRoleId
        })
      })

      if (res.ok) {
        toast({ title: "User created successfully" })
        setIsCreateDialogOpen(false)
        setNewUserName("")
        setNewUserEmail("")
        setNewUserPassword("password123")
        setSelectedRoleId("")
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
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-white/50 bg-white/70 backdrop-blur-md px-4 sticky top-0 z-50">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-2">
            <Users className="text-[#754319] w-5 h-5" />
            <h1 className="text-lg font-bold text-[#5b371f] font-headline tracking-tight">User Management</h1>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-slate-50/50">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">User Accounts</h2>
                <p className="text-muted-foreground">Manage administrative and merchant user access levels.</p>
              </div>
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
                            type="password" 
                            className="pl-9" 
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                          />
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
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="pl-6">User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Joined Date</TableHead>
                      <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id} className="group hover:bg-slate-50/50 transition-colors">
                        <TableCell className="pl-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium">{user.name}</span>
                            <span className="text-xs text-muted-foreground">{user.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1.5 font-normal border-primary/20 bg-primary/5 text-primary">
                            <Shield className="w-3 h-3" />
                            {user.customRole?.name || user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {user.merchant ? (
                              <>
                                <Building2 className="w-4 h-4" />
                                <span>{user.merchant.name}</span>
                              </>
                            ) : (
                              <>
                                <Shield className="w-4 h-4" />
                                <span>Super Admin</span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredUsers.length === 0 && !isLoading && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                          No users found matching your search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
