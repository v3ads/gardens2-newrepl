import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // Fetch all users from the database using Prisma
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        image: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    
    return NextResponse.json({
      success: true,
      users: users,
      total: users.length
    })
    
  } catch (error) {
    console.error('[ADMIN_USERS] Error fetching users:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch users',
      users: []
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json({
    message: 'Admin users creation - not yet implemented'
  })
}