'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from '@/hooks/use-session-override'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Trash2, UserPlus, Edit, Shield, User, Users } from 'lucide-react'
import { toast } from 'sonner'

interface User {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3'
  image?: string
  createdAt: string
}

const roleColors = {
  ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  LEVEL_1: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  LEVEL_2: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  LEVEL_3: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
}

const roleIcons = {
  ADMIN: Shield,
  LEVEL_1: User,
  LEVEL_2: Users,
  LEVEL_3: User
}

export default function UserManagementPage() {
  // ALL HOOKS FIRST - NO EXCEPTIONS
  const { data: session, status } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [newUser, setNewUser] = useState({
    email: '',
    name: '',
    role: 'LEVEL_1' as User['role']
  })

  // ALL FUNCTION DEFINITIONS AFTER HOOKS
  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users)
      } else {
        toast.error('Failed to fetch users')
      }
    } catch (error) {
      toast.error('Error fetching users')
    } finally {
      setLoading(false)
    }
  }, [])

  const createUser = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      })

      if (response.ok) {
        const createdUser = await response.json()
        toast.success('User created successfully')
        setIsAddDialogOpen(false)
        setNewUser({ email: '', name: '', role: 'LEVEL_1' })
        // Optimistic UI update - add new user to the list immediately
        setUsers(prevUsers => [createdUser.user, ...prevUsers])
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create user')
      }
    } catch (error) {
      toast.error('Error creating user')
    }
  }

  const updateUserRole = async (userId: string, role: User['role']) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      })

      if (response.ok) {
        toast.success('User role updated successfully')
        setIsEditDialogOpen(false)
        setEditingUser(null)
        // Optimistic UI update - update user role immediately
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.id === userId ? { ...user, role } : user
          )
        )
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to update user')
      }
    } catch (error) {
      toast.error('Error updating user')
    }
  }

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        toast.success('User deleted successfully')
        // Only update UI optimistically - no need to refetch
        setUsers(prevUsers => prevUsers.filter(user => user.id !== userId))
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete user')
      }
    } catch (error) {
      toast.error('Error deleting user')
    }
  }

  // ALL useEffect HOOKS AFTER FUNCTION DEFINITIONS
  useEffect(() => {
    // In development mode, bypass auth check and always fetch
    if (process.env.NODE_ENV === 'development' || session?.user?.role === 'ADMIN') {
      fetchUsers()
    }
  }, [session?.user?.role]) // Only depend on the role, not the session object itself

  // ALL CONDITIONAL RENDERS AFTER ALL HOOKS
  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  if (!session?.user || session.user.role !== 'ADMIN') {
    // In development mode, bypass auth check
    if (process.env.NODE_ENV !== 'development') {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-[400px]">
            <CardHeader>
              <CardTitle className="text-center">Access Denied</CardTitle>
              <CardDescription className="text-center">
                You need admin access to view this page.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      )
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading users...</div>
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">User Management</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Manage user accounts and access levels
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>
                Create a new user account with specified access level.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="user@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Full Name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value as User['role'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="LEVEL_1">Level 1</SelectItem>
                    <SelectItem value="LEVEL_2">Level 2</SelectItem>
                    <SelectItem value="LEVEL_3">Level 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createUser}>Create User</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users ({users.length})</CardTitle>
          <CardDescription>
            All registered users and their access levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users.map((user) => {
              const RoleIcon = roleIcons[user.role]
              return (
                <div key={user.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 flex items-center justify-center flex-shrink-0">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt={user.name}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <User className="h-5 w-5 text-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm md:text-base truncate">{user.name}</div>
                      <div className="text-xs md:text-sm text-muted-foreground truncate">{user.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end space-x-2">
                    <Badge className={`text-xs ${roleColors[user.role]} flex items-center`}>
                      <RoleIcon className="mr-1 h-3 w-3" />
                      {user.role}
                    </Badge>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingUser(user)
                          setIsEditDialogOpen(true)
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteUser(user.id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>
              Change the access level for {editingUser?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select 
                value={editingUser?.role} 
                onValueChange={(value) => 
                  editingUser && updateUserRole(editingUser.id, value as User['role'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="LEVEL_1">Level 1</SelectItem>
                  <SelectItem value="LEVEL_2">Level 2</SelectItem>
                  <SelectItem value="LEVEL_3">Level 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}