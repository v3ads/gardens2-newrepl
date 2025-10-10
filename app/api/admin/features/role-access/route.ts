import { NextRequest, NextResponse } from 'next/server'
import { assertRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { z } from 'zod'
import { Role } from '@prisma/client'

const updateRoleAccessSchema = z.object({
  featureId: z.string(),
  role: z.enum(['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']),
  hasAccess: z.boolean(),
})

export async function PATCH(request: NextRequest) {
  try {
    await assertRole('ADMIN')

    const body = await request.json()
    const { featureId, role, hasAccess } = updateRoleAccessSchema.parse(body)

    await prisma.roleFeature.upsert({
      where: {
        role_featureId: {
          role: role as Role,
          featureId,
        },
      },
      update: { hasAccess },
      create: {
        role: role as Role,
        featureId,
        hasAccess,
      },
    })

    // Clear cache for all roles since role permissions changed
    const roles = ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']
    roles.forEach(role => {
      cache.delete(`features:${role}`)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update role access error:', error)
    return NextResponse.json(
      { error: 'Failed to update role access' },
      { status: 500 }
    )
  }
}