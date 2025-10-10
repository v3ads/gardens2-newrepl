import { prisma } from '@/lib/prisma'
import { FeatureManagement } from './feature-management'
import { FEATURES } from '@/lib/features'
import { Feature, RoleFeature } from '@prisma/client'

interface FeatureWithRoles extends Feature {
  roleFeatures: RoleFeature[]
}

export default async function AdminFeaturesPage() {
  let features: FeatureWithRoles[] = []
  
  try {
    features = await prisma.feature.findMany({
      include: {
        roleFeatures: true,
      },
      orderBy: { sortOrder: 'asc' },
    }) as FeatureWithRoles[]
  } catch (error) {
    // Fallback for development mode when database is not accessible
    features = []
  }

  // Features are now properly ordered by database sortOrder

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feature Management</h1>
        <p className="text-muted-foreground">
          Configure which roles can access each feature
        </p>
      </div>

      <FeatureManagement features={features} />
    </div>
  )
}