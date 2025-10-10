import { NextRequest, NextResponse } from 'next/server'
import { assertRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { z } from 'zod'

const reorderFeatureSchema = z.object({
  featureId: z.string(),
  direction: z.enum(['up', 'down']),
})

export async function PATCH(request: NextRequest) {
  try {
    await assertRole('ADMIN')

    const body = await request.json()
    const { featureId, direction } = reorderFeatureSchema.parse(body)

    // Get all features ordered by current sortOrder
    const allFeatures = await prisma.feature.findMany({
      orderBy: { sortOrder: 'asc' } as any
    })

    // Find the feature to move
    const featureIndex = allFeatures.findIndex(f => f.id === featureId)
    if (featureIndex === -1) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 404 })
    }

    // Calculate new position
    const targetIndex = direction === 'up' ? featureIndex - 1 : featureIndex + 1
    if (targetIndex < 0 || targetIndex >= allFeatures.length) {
      return NextResponse.json({ success: true }) // No change needed
    }

    // Swap sortOrder values between the two features
    const feature1 = allFeatures[featureIndex] as any
    const feature2 = allFeatures[targetIndex] as any

    await prisma.$transaction([
      prisma.feature.update({
        where: { id: feature1.id },
        data: { sortOrder: feature2.sortOrder } as any
      }),
      prisma.feature.update({
        where: { id: feature2.id },
        data: { sortOrder: feature1.sortOrder } as any
      })
    ])

    // Clear cache for all roles since feature order changed
    const roles = ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']
    roles.forEach(role => {
      cache.delete(`features:${role}`)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reorder feature error:', error)
    return NextResponse.json(
      { error: 'Failed to reorder feature' },
      { status: 500 }
    )
  }
}