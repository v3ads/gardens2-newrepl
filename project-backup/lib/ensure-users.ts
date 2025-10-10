import { PrismaClient, Role } from '@prisma/client'

let initialized = false

export async function ensureProductionUsers() {
  if (initialized) return
  
  // Only run in production
  if (process.env.NODE_ENV !== 'production') {
    return
  }

  initialized = true
  
  const prisma = new PrismaClient()
  
  try {
    console.log('[INIT] Ensuring production users exist...')
    
    // Production admin users
    const adminUsers = [
      { email: 'vipaymanshalaby@gmail.com', name: 'V Payman Shalaby', role: 'ADMIN' as Role },
      { email: 'cynthia@cynthiagardens.com', name: 'Cynthia Gardens', role: 'ADMIN' as Role },
      { email: 'leasing@cynthiagardens.com', name: 'Cynthia Gardens Leasing', role: 'ADMIN' as Role },
    ]

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
      }).catch((err) => {
        console.error(`[INIT] Failed to upsert user ${userData.email}:`, err.message)
      })
    }
    
    console.log('[INIT] Production users ensured')
  } catch (error) {
    console.error('[INIT] Failed to ensure production users:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Auto-run on module load
ensureProductionUsers().catch(console.error)