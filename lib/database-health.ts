
import { prisma } from './prisma'

interface DatabaseHealth {
  isConnected: boolean
  responseTime: number
  error?: string
  isSleeping?: boolean
}

export class DatabaseHealthChecker {
  private static lastSuccessfulCheck = 0
  private static consecutiveFailures = 0

  static async checkHealth(): Promise<DatabaseHealth> {
    const startTime = Date.now()
    
    try {
      // Simple query to test connectivity
      await prisma.$queryRaw`SELECT 1 as health_check`
      
      const responseTime = Date.now() - startTime
      this.lastSuccessfulCheck = Date.now()
      this.consecutiveFailures = 0
      
      return {
        isConnected: true,
        responseTime,
        isSleeping: false
      }
    } catch (error: any) {
      this.consecutiveFailures++
      const responseTime = Date.now() - startTime
      
      // Check if database is likely sleeping (based on Replit lifecycle)
      const timeSinceLastSuccess = Date.now() - this.lastSuccessfulCheck
      const isSleeping = timeSinceLastSuccess > 5 * 60 * 1000 || // 5+ minutes since last success
                        error.message?.includes('terminating connection due to administrator command')
      
      return {
        isConnected: false,
        responseTime,
        error: error.message,
        isSleeping
      }
    }
  }

  static async ensureAwake(): Promise<boolean> {
    console.log('[DB_HEALTH] Checking database status...')
    
    const health = await this.checkHealth()
    
    if (health.isConnected) {
      console.log(`[DB_HEALTH] ✅ Database is awake (${health.responseTime}ms)`)
      return true
    }
    
    if (health.isSleeping) {
      console.log('[DB_HEALTH] 😴 Database appears to be sleeping, attempting to wake...')
      
      // Attempt to wake database with multiple connection attempts
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await prisma.$disconnect()
          await new Promise(resolve => setTimeout(resolve, 1000))
          await prisma.$connect()
          
          const wakeCheck = await this.checkHealth()
          if (wakeCheck.isConnected) {
            console.log(`[DB_HEALTH] ✅ Database awakened on attempt ${attempt}`)
            return true
          }
        } catch (e) {
          console.log(`[DB_HEALTH] Wake attempt ${attempt} failed:`, e)
        }
      }
    }
    
    console.log('[DB_HEALTH] ❌ Database health check failed:', health.error)
    return false
  }
}
