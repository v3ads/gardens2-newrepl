import { NextRequest, NextResponse } from 'next/server'
import { assertRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { z } from 'zod'

const updateFeatureSchema = z.object({
  featureId: z.string(),
  enabled: z.boolean(),
})

export async function PATCH(request: NextRequest) {
  try {
    await assertRole('ADMIN')

    const body = await request.json()
    const { featureId, enabled } = updateFeatureSchema.parse(body)

    // Handle development mode mock features
    if (featureId.startsWith('dev-')) {
      const featureKey = featureId.replace('dev-', '')
      
      // Try to find existing feature or create new one
      const existingFeature = await prisma.feature.findUnique({
        where: { key: featureKey }
      })

      if (existingFeature) {
        await prisma.feature.update({
          where: { id: existingFeature.id },
          data: { enabled },
        })
      } else {
        // Create the feature if it doesn't exist
        await prisma.feature.create({
          data: {
            key: featureKey,
            name: featureKey.charAt(0).toUpperCase() + featureKey.slice(1),
            description: `${featureKey} feature`,
            enabled: enabled,
          }
        })
      }
    } else {
      // Handle real database features
      await prisma.feature.update({
        where: { id: featureId },
        data: { enabled },
      })
    }

    // Clear cache for all roles since feature availability changed
    const roles = ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']
    roles.forEach(role => {
      cache.delete(`features:${role}`)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update feature error:', error)
    return NextResponse.json(
      { error: 'Failed to update feature' },
      { status: 500 }
    )
  }
}