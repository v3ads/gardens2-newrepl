import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { Role } from '@prisma/client'

export async function requireAuth(
  request: NextRequest,
  allowedRoles: Role[] = ['ADMIN']
): Promise<{ authorized: boolean; response?: NextResponse; session?: any }> {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || !session.user) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      }
    }
    
    const userRole = session.user.role as Role
    if (!allowedRoles.includes(userRole)) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        )
      }
    }
    
    return { authorized: true, session }
  } catch (error) {
    console.error('[AUTH_MIDDLEWARE] Error:', error)
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Authentication error' },
        { status: 500 }
      )
    }
  }
}

export async function requireAdminAuth(request: NextRequest) {
  return requireAuth(request, ['ADMIN'])
}