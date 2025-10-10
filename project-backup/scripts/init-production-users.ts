import { PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()

async function initProductionUsers() {
  console.log('🔐 Initializing production users...')

  // Production admin users - same as development
  const adminUsers = [
    { email: 'vipaymanshalaby@gmail.com', name: 'V Payman Shalaby', role: 'ADMIN' as Role },
    { email: 'cynthia@cynthiagardens.com', name: 'Cynthia Gardens', role: 'ADMIN' as Role },
    { email: 'leasing@cynthiagardens.com', name: 'Cynthia Gardens Leasing', role: 'ADMIN' as Role },
  ]

  // Test users for different permission levels
  const testUsers = [
    { email: 'level1@example.com', name: 'Level 1 User', role: 'LEVEL_3' as Role },
    { email: 'level2@example.com', name: 'Level 2 User', role: 'LEVEL_2' as Role },
  ]

  // Users to remove (no longer admins)
  const usersToRemove = [
    'ahshalaby@gmail.com',
    'hassanayman55@gmail.com',
    'admin@example.com',  // Remove default admin
  ]

  try {
    // Remove users that should no longer be admins
    for (const email of usersToRemove) {
      const deleted = await prisma.user.deleteMany({
        where: { email }
      })
      if (deleted.count > 0) {
        console.log(`❌ Removed user: ${email}`)
      }
    }

    // Create or update admin users
    for (const userData of adminUsers) {
      await prisma.user.upsert({
        where: { email: userData.email },
        update: { 
          name: userData.name,
          role: userData.role 
        },
        create: {
          email: userData.email,
          name: userData.name,
          role: userData.role,
        },
      })
      console.log(`✅ Admin user configured: ${userData.email}`)
    }

    // Create or update test users
    for (const userData of testUsers) {
      await prisma.user.upsert({
        where: { email: userData.email },
        update: { 
          name: userData.name,
          role: userData.role 
        },
        create: {
          email: userData.email,
          name: userData.name,
          role: userData.role,
        },
      })
      console.log(`✅ Test user configured: ${userData.email} (${userData.role})`)
    }

    // List all current users
    console.log('\n📋 Current users in database:')
    const allUsers = await prisma.user.findMany({
      orderBy: [
        { role: 'asc' },
        { email: 'asc' }
      ]
    })

    for (const user of allUsers) {
      console.log(`   ${user.email} - ${user.role}`)
    }

    console.log('\n✅ Production users initialized successfully!')

  } catch (error) {
    console.error('❌ Failed to initialize production users:', error)
    throw error
  }
}

// Run if called directly
if (require.main === module) {
  initProductionUsers()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}

export { initProductionUsers }