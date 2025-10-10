import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { cache } from '@/lib/cache'

// PUT - Update user role (admin only)
const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3'])
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // In development mode, bypass auth check
    if (process.env.NODE_ENV !== 'development') {
      const session = await getServerSession(authOptions)
      
      if (!session?.user || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json()
    const { role } = updateUserSchema.parse(body)
    const resolvedParams = await params
    const userId = resolvedParams.userId

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        createdAt: true,

      }
    })

    // Clear users cache when user role is updated
    cache.delete('admin:users:list')

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Remove user (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // In development mode, bypass auth check
    if (process.env.NODE_ENV !== 'development') {
      const session = await getServerSession(authOptions)
      
      if (!session?.user || session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const resolvedParams = await params
    const userId = resolvedParams.userId

    // In development mode, we need to get session for the self-deletion check
    let session = null
    if (process.env.NODE_ENV === 'development') {
      session = await getServerSession(authOptions)
    }

    // Prevent deleting yourself (only check in production or if session exists in dev)
    if (session?.user?.id === userId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    await prisma.user.delete({
      where: { id: userId }
    })

    // Clear users cache when user is deleted
    cache.delete('admin:users:list')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}