import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FEATURES } from '@/lib/features'
import { getSessionWithDevOverride } from '@/lib/dev-session'

export async function GET() {
  try {
    const session = await getSessionWithDevOverride()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Enforce admin-only access
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Use raw query until Prisma client is properly regenerated
    const preferences = await prisma.$queryRaw`
      SELECT "navigationOrder" FROM "UserPreferences" WHERE "userId" = ${session.user.id}
    ` as { navigationOrder: string | null }[]

    let navigationOrder: string[] = []
    
    if (preferences[0]?.navigationOrder) {
      try {
        const parsed = JSON.parse(preferences[0].navigationOrder)
        navigationOrder = Array.isArray(parsed) ? parsed : []
      } catch (parseError) {
        console.warn('Failed to parse saved navigation order:', parseError)
        navigationOrder = []
      }
    }

    return NextResponse.json({ navigationOrder })
  } catch (error) {
    console.error('Failed to load user navigation preferences:', error)
    return NextResponse.json(
      { error: 'Failed to load preferences' }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithDevOverride()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Enforce admin-only access
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { navigationOrder } = await request.json()

    if (!Array.isArray(navigationOrder)) {
      return NextResponse.json(
        { error: 'navigationOrder must be an array' }, 
        { status: 400 }
      )
    }

    // Validate that all feature keys are known
    const validFeatureKeys = FEATURES.map(f => f.key)
    const invalidKeys = navigationOrder.filter(key => !validFeatureKeys.includes(key))
    
    if (invalidKeys.length > 0) {
      return NextResponse.json(
        { error: `Invalid feature keys: ${invalidKeys.join(', ')}` }, 
        { status: 400 }
      )
    }

    // Use raw query for upsert until Prisma client is properly regenerated
    await prisma.$executeRaw`
      INSERT INTO "UserPreferences" ("id", "userId", "navigationOrder", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${session.user.id}, ${JSON.stringify(navigationOrder)}, NOW(), NOW())
      ON CONFLICT ("userId") 
      DO UPDATE SET 
        "navigationOrder" = ${JSON.stringify(navigationOrder)},
        "updatedAt" = NOW()
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save user navigation preferences:', error)
    return NextResponse.json(
      { error: 'Failed to save preferences' }, 
      { status: 500 }
    )
  }
}