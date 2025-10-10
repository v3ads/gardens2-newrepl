import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create Prisma client with robust connection handling and retry logic
function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL
  
  // CRITICAL: Validate DATABASE_URL before use
  if (!databaseUrl) {
    console.error('[PRISMA] FATAL ERROR: DATABASE_URL environment variable is not set!')
    console.error('[PRISMA] This usually means Publishing secrets are not available to this process')
    console.error('[PRISMA] Check that DATABASE_URL is configured in Publishing → Secrets')
    throw new Error('DATABASE_URL is required but not set')
  }
  
  // Add connection pooling parameters optimized for Reserved VM deployment
  const pooledUrl = new URL(databaseUrl)
  pooledUrl.searchParams.set('connection_limit', '3')        // Reduced for VM deployment (always-on)
  pooledUrl.searchParams.set('pool_timeout', '60')           // Increased for VM stability  
  pooledUrl.searchParams.set('connect_timeout', '10')        // Faster connection attempt
  pooledUrl.searchParams.set('statement_timeout', '120000')  // 2 minute statement timeout for VM
  pooledUrl.searchParams.set('idle_timeout', '60')           // Shorter idle timeout for VM
  pooledUrl.searchParams.set('socket_timeout', '45')         // Extended socket timeout for VM
  pooledUrl.searchParams.set('idle_in_transaction_session_timeout', '300000') // 5 min transaction timeout
  pooledUrl.searchParams.set('tcp_keepalives_enabled', '1')  // Enable TCP keepalive
  pooledUrl.searchParams.set('tcp_keepalives_idle', '600')   // 10 min keepalive interval
  pooledUrl.searchParams.set('tcp_keepalives_interval', '30') // 30 sec keepalive probe
  pooledUrl.searchParams.set('tcp_keepalives_count', '3')    // 3 failed probes before disconnect
  
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['error', 'warn'] as const // Only log errors and warnings in development
      : ['error'] as const, // Only log errors in production
    errorFormat: 'minimal', // Reduce error output size
    datasources: {
      db: {
        url: pooledUrl.toString()
      }
    }
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Enhanced retry wrapper for Replit PostgreSQL lifecycle issues
export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // For first attempt or after connection issues, ensure fresh connection
      if (attempt > 1) {
        try {
          await prisma.$disconnect()
          await new Promise(resolve => setTimeout(resolve, 500)) // Brief pause
          await prisma.$connect()
        } catch (e) {
          console.log(`[PRISMA_RETRY] Reconnection attempt failed: ${e}`)
        }
      }
      
      return await operation()
    } catch (error: any) {
      lastError = error
      
      // Enhanced error detection for Replit PostgreSQL issues
      const isConnectionError = 
        error.message?.includes('Engine is not yet connected') ||
        error.message?.includes('Connection failed') ||
        error.message?.includes('terminating connection due to administrator command') ||
        error.message?.includes('connection pool timeout') ||
        error.message?.includes('Connection terminated') ||
        error.message?.includes('ECONNREFUSED') ||
        error.code === 'P1001' || // Can't reach database server
        error.code === 'P1008' || // Operations timed out
        error.code === 'P1017' || // Server has closed the connection
        error.code === 'P2028' || // Transaction API error
        error.cause?.code === 'E57P01' // PostgreSQL connection termination
      
      if (isConnectionError && attempt < maxRetries) {
        console.log(`[PRISMA_RETRY] Database connection issue (attempt ${attempt}/${maxRetries}): ${error.message}`)
        console.log(`[PRISMA_RETRY] Retrying in ${delay}ms...`)
        
        // Force disconnect for clean retry
        try {
          await prisma.$disconnect()
        } catch (e) {
          // Ignore disconnect errors
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay))
        delay *= 1.5
        continue
      }
      
      // For non-connection errors (like P2002 unique constraint), throw immediately
      // without logging - let the caller's catch block handle it properly
      throw error
    }
  }
  
  throw lastError!
}

// Enhanced cleanup handlers for Reserved VM deployment
let isShuttingDown = false

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  
  console.log(`[PRISMA] Received ${signal}, shutting down gracefully...`)
  
  try {
    await prisma.$disconnect()
    console.log('[PRISMA] Database connections closed successfully')
  } catch (error) {
    console.error('[PRISMA] Error during shutdown:', error)
  }
  
  process.exit(0)
}

// Handle all termination signals for Reserved VM
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')) // For Replit restarts
process.on('beforeExit', async () => {
  if (!isShuttingDown) {
    await prisma.$disconnect()
  }
})