import { NextRequest, NextResponse } from 'next/server'
import { getAccessibleFeatures } from '@/lib/rbac'
import { Role } from '@prisma/client'
import { cache } from '@/lib/cache'
import { prisma } from '@/lib/prisma'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Add CORS headers for development
    const headers = new Headers({
      'Content-Type': 'application/json',
    })

    if (process.env.NODE_ENV === 'development') {
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }

    const role = request.nextUrl.searchParams.get('role') as Role

    if (!role || !Object.values(['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']).includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400, headers })
    }

    // In development mode, check database for enabled features
    if (process.env.NODE_ENV === 'development') {
      try {
        const enabledFeatures = await prisma.feature.findMany({
          where: { enabled: true },
          select: { key: true },
          orderBy: { sortOrder: 'asc' } as any
        })

        // Filter by role access and return in database order
        const devFeatures = enabledFeatures
          .map(f => f.key)
          .filter(key => {
            const hasRoleAccess = role === 'ADMIN' || key !== 'user_management'
            return hasRoleAccess
          })

        return NextResponse.json({ features: devFeatures }, { headers })
      } catch (dbError) {
        // Fallback if database is not accessible
        const orderedKeys = ['overview', 'tasks', 'jasmine', 'analytics']
        if (role === 'ADMIN') {
          orderedKeys.push('user_management')
        }
        return NextResponse.json({ features: orderedKeys }, { headers })
      }
    }

    // Check cache first (5 minute TTL for features)
    const cacheKey = `features:${role}`
    const cachedFeatures = cache.get(cacheKey)
    if (cachedFeatures) {
      return NextResponse.json({ features: cachedFeatures }, { headers })
    }

    const features = await getAccessibleFeatures(role)

    // Cache the result for 5 minutes
    cache.set(cacheKey, features, 300)

    return NextResponse.json(features, { headers })
  } catch (error) {
    console.error('[FEATURES] Error fetching accessible features:', error)
    // Return basic fallback features
    const orderedKeys = ['overview', 'tasks', 'jasmine', 'analytics']
    const headers = new Headers({
      'Content-Type': 'application/json',
    })
    
    if (process.env.NODE_ENV === 'development') {
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch features', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers }
    )
  }
}