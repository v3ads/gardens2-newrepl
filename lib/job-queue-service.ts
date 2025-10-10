import { prisma, withPrismaRetry } from './prisma'
import { JobStatus, JobType } from '@prisma/client'

export interface JobPayload {
  syncType: string
  triggeredBy: string
  timestamp: string
  metadata?: Record<string, any>
}

export interface JobQueueConfig {
  maxAttempts: number
  priority: number
  runAt?: Date
  dedupeKey?: string
}

export interface WorkerConfig {
  workerId: string
  batchSize: number
  heartbeatIntervalMs: number
  maxExecutionTimeMs: number
}

export class JobQueueService {
  private static instance: JobQueueService
  private heartbeatInterval: NodeJS.Timeout | null = null
  private workerConfig: WorkerConfig | null = null

  static getInstance(): JobQueueService {
    if (!JobQueueService.instance) {
      JobQueueService.instance = new JobQueueService()
    }
    return JobQueueService.instance
  }

  /**
   * Enqueue a new job with deduplication support
   */
  async enqueueJob(
    type: JobType,
    payload: JobPayload,
    config: Partial<JobQueueConfig> = {}
  ): Promise<string> {
    const defaultConfig: JobQueueConfig = {
      maxAttempts: 3,
      priority: 0,
      runAt: new Date(),
      ...config
    }

    try {
      const job = await withPrismaRetry(async () => {
        return await prisma.jobQueue.create({
          data: {
            type,
            payload: JSON.stringify(payload),
            status: JobStatus.QUEUED,
            priority: defaultConfig.priority,
            runAt: defaultConfig.runAt!,
            maxAttempts: defaultConfig.maxAttempts,
            dedupeKey: defaultConfig.dedupeKey,
            attempts: 0,
          }
        })
      })

      console.log(`[JOB_QUEUE] ✅ Enqueued job ${job.id} of type ${type}`)
      return job.id
    } catch (error: any) {
      // Handle deduplication constraint violation
      if (error.code === 'P2002' && error.meta?.target?.includes('dedupe_key')) {
        console.log(`[JOB_QUEUE] ⚡ Job deduplicated for key: ${defaultConfig.dedupeKey}`)
        
        // Find the existing job
        const existingJob = await prisma.jobQueue.findUnique({
          where: { dedupeKey: defaultConfig.dedupeKey }
        })
        
        if (existingJob) {
          console.log(`[JOB_QUEUE] ✅ Returning existing job ID: ${existingJob.id}`)
          return existingJob.id
        }
        
        // CRITICAL FIX: Job was deleted but dedupe constraint still exists
        // This is a race condition - the job completed and was deleted but the unique constraint triggered
        // Solution: Retry creating the job without dedupeKey (let it be a new job)
        console.warn(`[JOB_QUEUE] ⚠️ Dedupe conflict but job not found - creating new job without dedupeKey`)
        const retryJob = await withPrismaRetry(async () => {
          return await prisma.jobQueue.create({
            data: {
              type,
              payload: JSON.stringify(payload),
              status: JobStatus.QUEUED,
              priority: defaultConfig.priority,
              runAt: defaultConfig.runAt!,
              maxAttempts: defaultConfig.maxAttempts,
              dedupeKey: null, // Don't use dedupeKey on retry
              attempts: 0,
            }
          })
        })
        console.log(`[JOB_QUEUE] ✅ Created retry job ${retryJob.id} without dedupeKey`)
        return retryJob.id
      }
      
      console.error(`[JOB_QUEUE] ❌ Failed to enqueue job:`, error)
      throw error
    }
  }

  /**
   * Verify a job exists in the database (read-after-write verification)
   */
  async verifyJobExists(jobId: string): Promise<{exists: boolean, job?: any}> {
    try {
      const job = await prisma.jobQueue.findUnique({
        where: { id: jobId }
      })
      
      if (job) {
        console.log(`[JOB_QUEUE] ✅ Verification passed - job ${jobId} exists`)
        return { exists: true, job }
      } else {
        console.error(`[JOB_QUEUE] ❌ Verification failed - job ${jobId} not found in database`)
        return { exists: false }
      }
    } catch (error) {
      console.error(`[JOB_QUEUE] ❌ Verification error for job ${jobId}:`, error)
      return { exists: false }
    }
  }

  /**
   * Worker: Get next available job using PostgreSQL SKIP LOCKED
   */
  async getNextJob(workerId: string, batchSize: number = 1): Promise<Array<{job: any, jobRunId: string}>> {
    try {
      // Use raw SQL for SELECT FOR UPDATE SKIP LOCKED (Prisma doesn't support this natively)
      const rawJobs = await prisma.$queryRaw`
        UPDATE job_queue 
        SET status = ${JobStatus.RUNNING}::"JobStatus",
            updated_at = NOW()
        WHERE id IN (
          SELECT id FROM job_queue 
          WHERE status = ${JobStatus.QUEUED}::"JobStatus"
            AND run_at <= NOW()
          ORDER BY priority DESC, run_at ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      ` as any[]

      if (rawJobs.length > 0) {
        console.log(`[JOB_QUEUE] 🎯 Worker ${workerId} claimed ${rawJobs.length} job(s)`)
        
        // CRITICAL FIX: Map snake_case column names to camelCase for consistency
        // Raw SQL returns snake_case (max_attempts, run_at, etc.) but code expects camelCase
        const jobs = rawJobs.map(rawJob => ({
          id: rawJob.id,
          type: rawJob.type,
          payload: rawJob.payload,
          status: rawJob.status,
          priority: rawJob.priority,
          runAt: rawJob.run_at,
          attempts: rawJob.attempts,
          maxAttempts: rawJob.max_attempts,
          dedupeKey: rawJob.dedupe_key,
          lastError: rawJob.last_error,
          createdAt: rawJob.created_at,
          updatedAt: rawJob.updated_at
        }))
        
        // Create job run records and return both job and jobRunId
        const jobsWithRuns = []
        for (const job of jobs) {
          const jobRunId = await this.createJobRun(job.id, workerId)
          jobsWithRuns.push({ job, jobRunId })
        }
        
        return jobsWithRuns
      }

      return []
    } catch (error) {
      console.error(`[JOB_QUEUE] ❌ Failed to get next job:`, error)
      throw error
    }
  }

  /**
   * Create a job run record for tracking execution
   */
  private async createJobRun(jobId: string, workerId: string): Promise<string> {
    const jobRun = await withPrismaRetry(async () => {
      return await prisma.jobRun.create({
        data: {
          jobId,
          workerId,
          startedAt: new Date(),
          heartbeatAt: new Date(),
        }
      })
    })

    console.log(`[JOB_QUEUE] 📝 Created job run ${jobRun.id} for job ${jobId}`)
    return jobRun.id
  }

  /**
   * Mark job as completed successfully
   */
  async completeJob(jobId: string, jobRunId: string, durationMs: number, logs?: any): Promise<void> {
    await withPrismaRetry(async () => {
      await prisma.$transaction([
        // Update job status
        prisma.jobQueue.update({
          where: { id: jobId },
          data: {
            status: JobStatus.SUCCEEDED,
            updatedAt: new Date(),
          }
        }),
        // Update job run
        prisma.jobRun.update({
          where: { id: jobRunId },
          data: {
            finishedAt: new Date(),
            durationMs,
            success: true,
            logs: logs ? JSON.stringify(logs) : null,
          }
        })
      ])
    })

    console.log(`[JOB_QUEUE] ✅ Job ${jobId} completed successfully in ${durationMs}ms`)
  }

  /**
   * Mark job as failed with retry logic
   */
  async failJob(
    jobId: string, 
    jobRunId: string, 
    error: string, 
    durationMs?: number
  ): Promise<void> {
    const job = await prisma.jobQueue.findUnique({ where: { id: jobId } })
    if (!job) throw new Error(`Job ${jobId} not found`)

    const newAttempts = job.attempts + 1
    const shouldRetry = newAttempts < job.maxAttempts

    await withPrismaRetry(async () => {
      await prisma.$transaction([
        // Update job
        prisma.jobQueue.update({
          where: { id: jobId },
          data: {
            status: shouldRetry ? JobStatus.QUEUED : JobStatus.FAILED,
            attempts: newAttempts,
            lastError: error,
            runAt: shouldRetry ? this.calculateRetryDelay(newAttempts) : job.runAt,
            updatedAt: new Date(),
          }
        }),
        // Update job run
        prisma.jobRun.update({
          where: { id: jobRunId },
          data: {
            finishedAt: new Date(),
            durationMs: durationMs || 0,
            success: false,
            error,
          }
        })
      ])
    })

    const status = shouldRetry ? 'retrying' : 'failed permanently'
    console.log(`[JOB_QUEUE] ❌ Job ${jobId} ${status} (attempt ${newAttempts}/${job.maxAttempts})`)
  }

  /**
   * Calculate exponential backoff with jitter for retries
   */
  private calculateRetryDelay(attempt: number): Date {
    const baseDelayMs = 1000 // 1 second
    const maxDelayMs = 5 * 60 * 1000 // 5 minutes
    const exponentialMs = baseDelayMs * Math.pow(2, attempt - 1)
    const jitterMs = Math.random() * 1000 // Up to 1 second jitter
    const delayMs = Math.min(exponentialMs + jitterMs, maxDelayMs)
    
    return new Date(Date.now() + delayMs)
  }

  /**
   * Start heartbeat for a worker
   */
  startHeartbeat(workerId: string, intervalMs: number = 30000): void {
    this.workerConfig = {
      workerId,
      batchSize: 1,
      heartbeatIntervalMs: intervalMs,
      maxExecutionTimeMs: 30 * 60 * 1000, // 30 minutes
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.updateHeartbeat(workerId)
      } catch (error) {
        console.error(`[JOB_QUEUE] ❌ Heartbeat failed for worker ${workerId}:`, error)
      }
    }, intervalMs)

    console.log(`[JOB_QUEUE] 💓 Started heartbeat for worker ${workerId} (${intervalMs}ms interval)`)
  }

  /**
   * Update heartbeat for active job runs
   */
  private async updateHeartbeat(workerId: string): Promise<void> {
    await withPrismaRetry(async () => {
      await prisma.jobRun.updateMany({
        where: {
          workerId,
          finishedAt: null, // Only active job runs
        },
        data: {
          heartbeatAt: new Date(),
        }
      })
    })
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
      console.log(`[JOB_QUEUE] 💔 Stopped heartbeat`)
    }
  }

  /**
   * Get job queue status for monitoring
   */
  async getQueueStatus(): Promise<{
    queuedJobs: number
    runningJobs: number
    failedJobs: number
    completedJobs: number
    oldestQueuedJob?: Date
  }> {
    const [queuedJobs, runningJobs, failedJobs, completedJobs, oldestQueued] = await Promise.all([
      prisma.jobQueue.count({ where: { status: JobStatus.QUEUED } }),
      prisma.jobQueue.count({ where: { status: JobStatus.RUNNING } }),
      prisma.jobQueue.count({ where: { status: JobStatus.FAILED } }),
      prisma.jobQueue.count({ where: { status: JobStatus.SUCCEEDED } }),
      prisma.jobQueue.findFirst({
        where: { status: JobStatus.QUEUED },
        orderBy: { runAt: 'asc' },
        select: { runAt: true }
      })
    ])

    return {
      queuedJobs,
      runningJobs,
      failedJobs,
      completedJobs,
      oldestQueuedJob: oldestQueued?.runAt,
    }
  }

  /**
   * Get recent job runs for monitoring
   */
  async getRecentJobs(limit: number = 10): Promise<any[]> {
    return await prisma.jobQueue.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        jobRuns: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        }
      }
    })
  }

  /**
   * Cancel a job (cooperative cancellation)
   */
  async cancelJob(jobId: string): Promise<void> {
    await withPrismaRetry(async () => {
      await prisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: JobStatus.CANCELLED,
          updatedAt: new Date(),
        }
      })
    })

    console.log(`[JOB_QUEUE] 🚫 Job ${jobId} cancelled`)
  }

  /**
   * Cleanup old completed jobs
   */
  async cleanupOldJobs(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const result = await withPrismaRetry(async () => {
      return await prisma.jobQueue.deleteMany({
        where: {
          status: { in: [JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED] },
          updatedAt: { lt: cutoffDate }
        }
      })
    })

    console.log(`[JOB_QUEUE] 🧹 Cleaned up ${result.count} old jobs`)
    return result.count
  }

  /**
   * Clear stuck jobs that have been running for too long
   */
  async clearStuckJobs(maxRunTimeMs: number = 30 * 60 * 1000): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxRunTimeMs)

    const result = await withPrismaRetry(async () => {
      return await prisma.jobQueue.updateMany({
        where: {
          status: JobStatus.RUNNING,
          updatedAt: { lt: cutoffTime }
        },
        data: {
          status: JobStatus.FAILED,
          lastError: `Job timeout: exceeded ${maxRunTimeMs}ms runtime limit`,
          updatedAt: new Date()
        }
      })
    })

    console.log(`[JOB_QUEUE] ⏰ Cleared ${result.count} stuck jobs older than ${maxRunTimeMs}ms`)
    return result.count
  }
}

export const jobQueueService = JobQueueService.getInstance()