import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding Jasmine feature...')
  
  // Create Jasmine feature
  const jasmineFeature = await prisma.feature.upsert({
    where: { key: 'jasmine' },
    update: {},
    create: {
      key: 'jasmine',
      name: 'Jasmine',
      description: 'AI Assistant Chatbot',
      enabled: true,
    },
  })

  console.log('Created/updated Jasmine feature:', jasmineFeature)

  // Give access to all roles
  const roles = ['ADMIN', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3']
  
  for (const role of roles) {
    await prisma.roleFeature.upsert({
      where: {
        role_featureId: {
          role: role as any,
          featureId: jasmineFeature.id,
        },
      },
      update: {},
      create: {
        role: role as any,
        featureId: jasmineFeature.id,
        hasAccess: true,
      },
    })
    console.log(`Granted ${role} access to Jasmine feature`)
  }

  console.log('Jasmine feature seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })