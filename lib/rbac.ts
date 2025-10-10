import { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { FeatureKey } from '@/lib/features'

export async function hasFeatureAccess(role: Role, featureKey: FeatureKey): Promise<boolean> {
  // Admins automatically have access to all enabled features
  if (role === 'ADMIN') {
    const feature = await prisma.feature.findUnique({
      where: { key: featureKey },
    })
    return feature?.enabled ?? false
  }

  // For non-admin roles, check role-based permissions
  const feature = await prisma.feature.findUnique({
    where: { key: featureKey },
    include: {
      roleFeatures: {
        where: { role },
      },
    },
  })

  if (!feature || !feature.enabled) {
    return false
  }

  return feature.roleFeatures.length > 0 && feature.roleFeatures[0].hasAccess
}

export async function getAccessibleFeatures(role: Role): Promise<string[]> {
  // Admins get access to all enabled features automatically
  if (role === 'ADMIN') {
    const features = await prisma.feature.findMany({
      where: {
        enabled: true,
      },
      select: { key: true },
    })

    return features.map(f => f.key)
  }

  // For non-admin roles, check role-based permissions
  const features = await prisma.feature.findMany({
    where: {
      enabled: true,
      roleFeatures: {
        some: {
          role,
          hasAccess: true,
        },
      },
    },
    select: { key: true },
  })

  return features.map(f => f.key)
}