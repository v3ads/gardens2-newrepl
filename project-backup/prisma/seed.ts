import { PrismaClient, Role } from '@prisma/client'
import { FEATURES } from '../lib/features'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // Create features from registry
  for (const feature of FEATURES) {
    await prisma.feature.upsert({
      where: { key: feature.key },
      update: {
        name: feature.name,
        description: feature.description,
        enabled: feature.enabledByDefault,
      },
      create: {
        key: feature.key,
        name: feature.name,
        description: feature.description,
        enabled: feature.enabledByDefault,
      },
    })
  }

  // Create role-feature mappings
  const features = await prisma.feature.findMany()
  
  for (const feature of features) {
    // Overview: accessible to all roles
    if (feature.key === 'overview') {
      for (const role of ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']) {
        await prisma.roleFeature.upsert({
          where: {
            role_featureId: {
              role: role as Role,
              featureId: feature.id,
            },
          },
          update: { hasAccess: true },
          create: {
            role: role as Role,
            featureId: feature.id,
            hasAccess: true,
          },
        })
      }
    }

    // Tasks: accessible to LEVEL_2, LEVEL_3, and ADMIN
    if (feature.key === 'tasks') {
      for (const role of ['ADMIN', 'LEVEL_2', 'LEVEL_3']) {
        await prisma.roleFeature.upsert({
          where: {
            role_featureId: {
              role: role as Role,
              featureId: feature.id,
            },
          },
          update: { hasAccess: true },
          create: {
            role: role as Role,
            featureId: feature.id,
            hasAccess: true,
          },
        })
      }

      // LEVEL_1 doesn't have access to tasks
      await prisma.roleFeature.upsert({
        where: {
          role_featureId: {
            role: 'LEVEL_1',
            featureId: feature.id,
          },
        },
        update: { hasAccess: false },
        create: {
          role: 'LEVEL_1',
          featureId: feature.id,
          hasAccess: false,
        },
      })
    }

    // Jasmine: accessible to all roles
    if (feature.key === 'jasmine') {
      for (const role of ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']) {
        await prisma.roleFeature.upsert({
          where: {
            role_featureId: {
              role: role as Role,
              featureId: feature.id,
            },
          },
          update: { hasAccess: true },
          create: {
            role: role as Role,
            featureId: feature.id,
            hasAccess: true,
          },
        })
      }
    }

    // Analytics: accessible to all roles
    if (feature.key === 'analytics') {
      for (const role of ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']) {
        await prisma.roleFeature.upsert({
          where: {
            role_featureId: {
              role: role as Role,
              featureId: feature.id,
            },
          },
          update: { hasAccess: true },
          create: {
            role: role as Role,
            featureId: feature.id,
            hasAccess: true,
          },
        })
      }
    }

    // RentIQ: accessible to all roles
    if (feature.key === 'rentiq') {
      for (const role of ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']) {
        await prisma.roleFeature.upsert({
          where: {
            role_featureId: {
              role: role as Role,
              featureId: feature.id,
            },
          },
          update: { hasAccess: true },
          create: {
            role: role as Role,
            featureId: feature.id,
            hasAccess: true,
          },
        })
      }
    }

    // User Management: accessible to ADMIN only
    if (feature.key === 'user_management') {
      await prisma.roleFeature.upsert({
        where: {
          role_featureId: {
            role: 'ADMIN',
            featureId: feature.id,
          },
        },
        update: { hasAccess: true },
        create: {
          role: 'ADMIN',
          featureId: feature.id,
          hasAccess: true,
        },
      })

      // Explicitly deny access for non-admin roles
      for (const role of ['LEVEL_1', 'LEVEL_2', 'LEVEL_3']) {
        await prisma.roleFeature.upsert({
          where: {
            role_featureId: {
              role: role as Role,
              featureId: feature.id,
            },
          },
          update: { hasAccess: false },
          create: {
            role: role as Role,
            featureId: feature.id,
            hasAccess: false,
          },
        })
      }
    }
  }

  // Create seed users (these emails will get special role assignments)
  const seedUsers = [
    { email: 'vipaymanshalaby@gmail.com', name: 'V Payman Shalaby', role: 'ADMIN' as Role },
    { email: 'cynthia@cynthiagardens.com', name: 'Cynthia Gardens', role: 'ADMIN' as Role },
    { email: 'leasing@cynthiagardens.com', name: 'Cynthia Gardens Leasing', role: 'ADMIN' as Role },
    { email: 'level1@example.com', name: 'Level 1 User', role: 'LEVEL_3' as Role },
    { email: 'level2@example.com', name: 'Level 2 User', role: 'LEVEL_2' as Role },
  ]

  for (const userData of seedUsers) {
    await prisma.user.upsert({
      where: { email: userData.email },
      update: { role: userData.role },
      create: {
        email: userData.email,
        name: userData.name,
        role: userData.role,
      },
    })
  }

  console.log('✅ Seed completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })