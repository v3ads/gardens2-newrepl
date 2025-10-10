// ARCHITECTURE FIX: Use Prisma for PostgreSQL operations instead of raw SQL
import { prisma } from './prisma'

export interface JobLockResult {
  acquired: boolean
  existingJobId?: string
  lockAcquiredAt?: Date
}

export class JobLockManager {
  private static instance: JobLockManager
  
  static getInstance(): JobLockManager {
    if (!JobLockManager.instance) {
      JobLockManager.instance = new JobLockManager()
    }
    return JobLockManager.instance
  }
  
  constructor() {
    this.initializeTables()
  }
  
  private initializeTables() {
    // ARCHITECTURE FIX: PostgreSQL table creation handled by Prisma migrations
    // JobLock and CircuitBreakerState models defined in prisma/schema.prisma
    console.log('[JOB_LOCK] Using Prisma-managed PostgreSQL schema')
  }
  
  /**
   * Acquire a distributed lock for a job with TTL
   */
  async acquireLock(jobName: string, ttlMinutes: number = 45): Promise<JobLockResult & { jobId?: string }> {
    // ARCHITECTURE FIX: PostgreSQL operations use Prisma - no connection check needed
    
    const jobId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000)
    
    try {
      // ARCHITECTURE FIX: Clean up expired locks using PostgreSQL-safe operations
      const now = new Date()
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000)
      
      await prisma.jobLock.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { heartbeatAt: { lt: twoMinutesAgo } }
          ]
        }
      })
      
      // ARCHITECTURE FIX: Check existing lock using Prisma for PostgreSQL safety
      const existing = await prisma.jobLock.findUnique({
        where: { jobName },
        select: { jobId: true, acquiredAt: true }
      })
      
      if (existing) {
        return {
          acquired: false,
          existingJobId: existing.jobId,
          lockAcquiredAt: existing.acquiredAt
        }
      }
      
      // ARCHITECTURE FIX: Insert new lock using Prisma for PostgreSQL safety
      await prisma.jobLock.create({
        data: {
          jobName,
          jobId,
          acquiredAt: now,
          expiresAt,
          processInfo: JSON.stringify({ pid: process.pid, nodeVersion: process.version }),
          heartbeatAt: now
        }
      })
      
      return {
        acquired: true,
        lockAcquiredAt: now,
        jobId // Return the job ID for later release
      }
      
    } catch (error) {
      console.error(`[JOB_LOCK] Failed to acquire lock for ${jobName}:`, error)
      return { acquired: false }
    }
  }
  
  /**
   * Release a job lock (only by the owner)
   */
  async releaseLock(jobName: string, jobId?: string): Promise<boolean> {
    try {
      // If we have a job ID, only release if it matches (ownership check)
      if (jobId) {
        // ARCHITECTURE FIX: Use Prisma for PostgreSQL-safe ownership-based deletion
        const result = await prisma.jobLock.deleteMany({
          where: { 
            jobName,
            jobId 
          }
        })
        
        if (result.count === 0) {
          console.warn(`[JOB_LOCK] Lock not released - job ${jobName} owned by different process`)
        }
        return result.count > 0
      } else {
        // Fallback for compatibility (should be avoided)
        console.warn(`[JOB_LOCK] Releasing lock without ownership check - this is deprecated`)
        // ARCHITECTURE FIX: Use Prisma for PostgreSQL-safe deletion (fallback case)
        const result = await prisma.jobLock.deleteMany({
          where: { jobName }
        })
        
        return result.count > 0
      }
    } catch (error) {
      console.error(`[JOB_LOCK] Failed to release lock for ${jobName}:`, error)
      return false
    }
  }
  
  /**
   * Update heartbeat to keep lock alive (only by owner)
   */
  async updateHeartbeat(jobName: string, jobId?: string): Promise<boolean> {
    // ARCHITECTURE FIX: PostgreSQL operations use Prisma - no connection check needed
    
    try {
      // If we have a job ID, only update if it matches (ownership check)
      if (jobId) {
        // ARCHITECTURE FIX: Use Prisma with proper PostgreSQL datetime handling
        const now = new Date()
        const newExpiresAt = new Date(now.getTime() + 45 * 60 * 1000) // +45 minutes
        
        const result = await prisma.jobLock.updateMany({
          where: { 
            jobName,
            jobId 
          },
          data: {
            heartbeatAt: now,
            expiresAt: newExpiresAt
          }
        })
        
        return result.count > 0
      } else {
        // Fallback for compatibility
        // ARCHITECTURE FIX: Use Prisma with proper PostgreSQL datetime handling (fallback)
        const now = new Date()
        
        const result = await prisma.jobLock.updateMany({
          where: { jobName },
          data: {
            heartbeatAt: now
          }
        })
        
        return result.count > 0
      }
    } catch (error) {
      console.error(`[JOB_LOCK] Failed to update heartbeat for ${jobName}:`, error)
      return false
    }
  }
  
  /**
   * Check if circuit breaker should prevent execution
   */
  async isCircuitBreakerOpen(jobName: string): Promise<{ open: boolean; reason?: string }> {
    // ARCHITECTURE FIX: PostgreSQL operations use Prisma - no connection check needed
    
    try {
      // ARCHITECTURE FIX: Use Prisma for PostgreSQL-safe circuit breaker state lookup
      const state = await prisma.circuitBreakerState.findUnique({
        where: { jobName }
      })
      
      if (!state) {
        return { open: false }
      }
      
      const now = new Date()
      
      // ARCHITECTURE FIX: Check if breaker is explicitly open using Prisma camelCase fields
      if (state.breakerOpenUntil && state.breakerOpenUntil > now) {
        return { 
          open: true, 
          reason: `Circuit breaker open until ${state.breakerOpenUntil.toISOString()}` 
        }
      }
      
      // ARCHITECTURE FIX: Check consecutive failures using Prisma camelCase fields
      if (state.consecutiveFailures >= 3) {
        const lastFailure = state.lastFailureAt
        const timeSinceFailure = now.getTime() - (lastFailure ? lastFailure.getTime() : 0)
        
        // Open breaker for 15 minutes after 3+ consecutive failures
        if (timeSinceFailure < 15 * 60 * 1000) {
          return { 
            open: true, 
            reason: `${state.consecutiveFailures} consecutive failures, cooling down` 
          }
        }
      }
      
      return { open: false }
      
    } catch (error) {
      console.error(`[CIRCUIT_BREAKER] Failed to check state for ${jobName}:`, error)
      return { open: false }
    }
  }
  
  /**
   * Record job execution result for circuit breaker
   */
  async recordJobResult(jobName: string, success: boolean, duration?: number): Promise<void> {
    // ARCHITECTURE FIX: PostgreSQL operations use Prisma - no connection check needed
    
    try {
      // ARCHITECTURE FIX: Use proper Date objects for PostgreSQL compatibility
      const now = new Date()
      
      // ARCHITECTURE FIX: Get current state using Prisma for PostgreSQL safety
      const currentState = await prisma.circuitBreakerState.findUnique({
        where: { jobName }
      })
      
      if (success) {
        // ARCHITECTURE FIX: Reset failure counters on success using Prisma upsert for atomicity
        await prisma.circuitBreakerState.upsert({
          where: { jobName },
          update: {
            consecutiveFailures: 0,
            totalExecutions: { increment: 1 },
            breakerOpenUntil: null,
            updatedAt: now
          },
          create: {
            jobName,
            consecutiveFailures: 0,
            totalExecutions: 1,
            breakerOpenUntil: null,
            updatedAt: now
          }
        })
      } else {
        // Record failure
        // ARCHITECTURE FIX: Use Prisma camelCase field names and proper Date objects for PostgreSQL
        const newConsecutiveFailures = (currentState?.consecutiveFailures || 0) + 1
        let breakerOpenUntil: Date | null = null
        if (newConsecutiveFailures >= 5) {
          breakerOpenUntil = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        } else if (newConsecutiveFailures >= 3) {
          breakerOpenUntil = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
        }
        
        // ARCHITECTURE FIX: Use Prisma upsert for atomic failure recording with proper field names
        await prisma.circuitBreakerState.upsert({
          where: { jobName },
          update: {
            failureCount: { increment: 1 },
            consecutiveFailures: newConsecutiveFailures,
            lastFailureAt: now,
            totalExecutions: { increment: 1 },
            totalFailures: { increment: 1 },
            breakerOpenUntil,
            updatedAt: now
          },
          create: {
            jobName,
            failureCount: 1,
            consecutiveFailures: 1,
            lastFailureAt: now,
            totalExecutions: 1,
            totalFailures: 1,
            breakerOpenUntil,
            updatedAt: now
          }
        })
      }
    } catch (error) {
      console.error(`[CIRCUIT_BREAKER] Failed to record result for ${jobName}:`, error)
    }
  }
  
  /**
   * Get circuit breaker statistics
   */
  async getCircuitBreakerStats(jobName: string): Promise<any> {
    // ARCHITECTURE FIX: PostgreSQL operations use Prisma - no connection check needed
    
    try {
      // ARCHITECTURE FIX: Use Prisma for PostgreSQL-safe circuit breaker stats lookup
      return await prisma.circuitBreakerState.findUnique({
        where: { jobName }
      })
    } catch (error) {
      console.error(`[CIRCUIT_BREAKER] Failed to get stats for ${jobName}:`, error)
      return null
    }
  }
}

/**
 * Execute a job with timeout, locking, and circuit breaker protection
 */
export async function withJobProtection<T>(
  jobName: string,
  jobFunction: (signal: AbortSignal) => Promise<T>,
  options: {
    timeoutMs?: number
    lockTtlMinutes?: number
    maxIterations?: number
    heartbeatIntervalMs?: number
  } = {}
): Promise<{ success: boolean; result?: T; error?: string; duration: number }> {
  const {
    timeoutMs = 2700000, // 45 minutes default - matches lock TTL for large data processing
    lockTtlMinutes = 45,
    maxIterations = 1000,
    heartbeatIntervalMs = 30000 // Send heartbeat every 30 seconds
  } = options
  
  const startTime = Date.now()
  const lockManager = JobLockManager.getInstance()
  
  try {
    // Check circuit breaker
    const breakerCheck = await lockManager.isCircuitBreakerOpen(jobName)
    if (breakerCheck.open) {
      return {
        success: false,
        error: `Circuit breaker open: ${breakerCheck.reason}`,
        duration: Date.now() - startTime
      }
    }
    
    // Acquire lock
    const lockResult = await lockManager.acquireLock(jobName, lockTtlMinutes)
    if (!lockResult.acquired) {
      return {
        success: false,
        error: `Job already running (started at ${lockResult.lockAcquiredAt})`,
        duration: Date.now() - startTime
      }
    }
    
    const jobId = lockResult.jobId // Store job ID for releasing later
    
    // Create timeout controller
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, timeoutMs)
    
    // Setup heartbeat to keep lock alive during long operations
    const heartbeatInterval = setInterval(async () => {
      try {
        const updated = await lockManager.updateHeartbeat(jobName, jobId)
        if (!updated) {
          console.warn(`[JOB_PROTECTION] Failed to update heartbeat for ${jobName} - lock may have been lost`)
        } else {
          console.log(`[JOB_PROTECTION] Heartbeat sent for ${jobName}`)
        }
      } catch (error) {
        console.error(`[JOB_PROTECTION] Heartbeat error for ${jobName}:`, error)
      }
    }, heartbeatIntervalMs)
    
    try {
      console.log(`[JOB_PROTECTION] Starting ${jobName} with ${timeoutMs}ms timeout and ${heartbeatIntervalMs}ms heartbeat`)
      
      // Run job with protection
      const result = await jobFunction(controller.signal)
      
      // Success
      clearTimeout(timeoutId)
      clearInterval(heartbeatInterval) // Stop heartbeat
      await lockManager.releaseLock(jobName, jobId) // Release with ownership check
      await lockManager.recordJobResult(jobName, true, Date.now() - startTime)
      
      console.log(`[JOB_PROTECTION] ✅ ${jobName} completed successfully in ${Date.now() - startTime}ms`)
      
      return {
        success: true,
        result,
        duration: Date.now() - startTime
      }
      
    } catch (error) {
      clearTimeout(timeoutId)
      clearInterval(heartbeatInterval) // Stop heartbeat
      await lockManager.releaseLock(jobName, jobId) // Release with ownership check
      
      let errorMessage = 'Unknown error'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      // Check if it was a timeout
      if (controller.signal.aborted) {
        errorMessage = `Job timed out after ${timeoutMs}ms`
        await lockManager.recordJobResult(jobName, false)
        console.error(`[JOB_PROTECTION] ❌ ${jobName} TIMEOUT after ${timeoutMs}ms`)
      } else {
        await lockManager.recordJobResult(jobName, false)
        console.error(`[JOB_PROTECTION] ❌ ${jobName} failed:`, errorMessage)
      }
      
      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime
      }
    }
    
  } catch (error) {
    // Lock acquisition or setup failed
    await lockManager.recordJobResult(jobName, false)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Job protection setup failed',
      duration: Date.now() - startTime
    }
  }
}