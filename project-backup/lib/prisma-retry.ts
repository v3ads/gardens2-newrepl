import { prisma } from './prisma'

/**
 * Retry wrapper for Prisma operations to handle connection failures
 */
export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  retryDelayMs: number = 1000
): Promise<T> {
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // On first retry, try to reconnect
      if (attempt > 1) {
        console.log(`[PRISMA_RETRY] Attempt ${attempt}/${maxRetries} - reconnecting...`)
        try {
          await prisma.$connect()
        } catch (reconnectError) {
          console.log('[PRISMA_RETRY] Reconnection failed, continuing with operation')
        }
      }

      const result = await operation()
      
      if (attempt > 1) {
        console.log(`[PRISMA_RETRY] ✅ Operation succeeded on attempt ${attempt}`)
      }
      
      return result
    } catch (error: any) {
      lastError = error
      
      // Check if it's a connection-related error
      const isConnectionError = 
        error?.code === 'P2028' || // Connection timeout
        error?.code === 'P1001' || // Can't reach database server
        error?.code === 'P1017' || // Server has closed the connection
        error?.message?.includes('Connection terminated') ||
        error?.message?.includes('terminating connection due to administrator command') ||
        error?.message?.includes('connection pool timeout') ||
        error?.cause?.code === 'E57P01' // PostgreSQL connection termination

      if (!isConnectionError || attempt === maxRetries) {
        // If it's not a connection error, or we've exhausted retries, throw immediately
        console.error(`[PRISMA_RETRY] Failed after ${attempt}/${maxRetries} attempts:`, {
          code: error?.code,
          message: error?.message,
          isConnectionError
        })
        throw error
      }

      console.log(`[PRISMA_RETRY] Connection error on attempt ${attempt}/${maxRetries}, retrying in ${retryDelayMs}ms...`, {
        code: error?.code,
        message: error?.message?.slice(0, 100)
      })
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      // Exponential backoff
      retryDelayMs *= 1.5
    }
  }

  throw lastError
}