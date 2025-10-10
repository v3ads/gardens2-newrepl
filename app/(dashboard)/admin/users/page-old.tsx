'use client'

import { useState, useEffect } from 'react'
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

  useEffect(() => {
    if (session?.user?.role === 'ADMIN') {
      fetchUsers()
    }
  }, [session])

  const fetchUsers = async () => {
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
  }

  // Check if user is admin
  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  if (!session?.user || session.user.role !== 'ADMIN') {
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

  const createUser = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      })

      if (response.ok) {
        toast.success('User created successfully')
        setIsAddDialogOpen(false)
        setNewUser({ email: '', name: '', role: 'LEVEL_1' })
        fetchUsers()
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
        fetchUsers()
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
        fetchUsers()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete user')
      }
    } catch (error) {
      toast.error('Error deleting user')
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading users...</div>
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage user access and permissions</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>
                Create a new user account with specified access level
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Full Name"
                />
              </div>
              <div>
                <Label htmlFor="role">Access Level</Label>
                <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value as User['role'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LEVEL_1">Level 1 - Basic Access</SelectItem>
                    <SelectItem value="LEVEL_2">Level 2 - Enhanced Access</SelectItem>
                    <SelectItem value="LEVEL_3">Level 3 - Advanced Access</SelectItem>
                    <SelectItem value="ADMIN">Admin - Full Access</SelectItem>
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

      <div className="grid gap-4">
        {users.map((user) => {
          const RoleIcon = roleIcons[user.role]
          return (
            <Card key={user.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      {user.image ? (
                        <img src={user.image} alt={user.name} className="w-10 h-10 rounded-full" />
                      ) : (
                        <User className="h-5 w-5 text-gray-500" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium">{user.name}</h3>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Badge className={roleColors[user.role]}>
                      <RoleIcon className="mr-1 h-3 w-3" />
                      {user.role.replace('_', ' ')}
                    </Badge>
                    
                    <div className="flex space-x-2">
                      <Dialog open={isEditDialogOpen && editingUser?.id === user.id} onOpenChange={(open) => {
                        setIsEditDialogOpen(open)
                        if (!open) setEditingUser(null)
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingUser(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit User Role</DialogTitle>
                            <DialogDescription>
                              Change access level for {user.name}
                            </DialogDescription>
                          </DialogHeader>
                          <div>
                            <Label htmlFor="edit-role">Access Level</Label>
                            <Select 
                              value={editingUser?.role || user.role} 
                              onValueChange={(value) => setEditingUser(prev => prev ? { ...prev, role: value as User['role'] } : null)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LEVEL_1">Level 1 - Basic Access</SelectItem>
                                <SelectItem value="LEVEL_2">Level 2 - Enhanced Access</SelectItem>
                                <SelectItem value="LEVEL_3">Level 3 - Advanced Access</SelectItem>
                                <SelectItem value="ADMIN">Admin - Full Access</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button onClick={() => updateUserRole(user.id, editingUser?.role || user.role)}>
                              Update Role
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      
                      {user.id !== session.user.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteUser(user.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}