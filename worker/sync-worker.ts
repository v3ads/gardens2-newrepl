#!/usr/bin/env tsx

/**
 * Background Worker for Cynthia Gardens Command Center
 * 
 * This worker runs independently of the Next.js application and processes
 * long-running sync operations from the job queue. It's designed to run
 * continuously and handle job failures gracefully.
 */

import { jobQueueService, JobPayload } from '../lib/job-queue-service'
import { DailySyncManager } from '../lib/daily-sync-manager'
import { syncMaintenanceService } from '../lib/sync-maintenance-service'
import { EmailService } from '../lib/email-service'

// JobType enum definition (matches Prisma schema - UPPERCASE values)
enum JobType {
  DAILY_SYNC = 'DAILY_SYNC',
  WEBHOOK_SYNC = 'WEBHOOK_SYNC', 
  MANUAL_SYNC = 'MANUAL_SYNC',
  EMAIL_SEND = 'EMAIL_SEND',
  DATA_CLEANUP = 'DATA_CLEANUP'
}

interface WorkerConfig {
  workerId: string
  batchSize: number
  pollingIntervalMs: number
  heartbeatIntervalMs: number
  maxConcurrentJobs: number
  shutdownTimeoutMs: number
}

class SyncWorker {
  private config: WorkerConfig
  private isShuttingDown = false
  private activeJobs = new Set<Promise<void>>()
  private pollingTimer: NodeJS.Timeout | null = null

  constructor(config: Partial<WorkerConfig> = {}) {
    this.config = {
      workerId: `sync-worker-${Date.now()}`,
      batchSize: 1, // Process one job at a time for sync operations
      pollingIntervalMs: 5000, // Check for jobs every 5 seconds
      heartbeatIntervalMs: 30000, // Heartbeat every 30 seconds
      maxConcurrentJobs: 1, // Sync operations should not run concurrently
      shutdownTimeoutMs: 60000, // 1 minute to complete jobs on shutdown
      ...config
    }

    console.log(`[SYNC_WORKER] 🚀 Initializing worker ${this.config.workerId}`)
  }

  async start(): Promise<void> {
    console.log(`[SYNC_WORKER] 🎯 Starting worker with config:`, {
      workerId: this.config.workerId,
      batchSize: this.config.batchSize,
      pollingInterval: `${this.config.pollingIntervalMs}ms`,
      maxConcurrentJobs: this.config.maxConcurrentJobs
    })

    // CRITICAL: Perform pre-sync cleanup on worker startup
    console.log('[SYNC_WORKER] 🧹 Performing startup cleanup...')
    try {
      const cleanupResult = await syncMaintenanceService.performPreSyncCleanup('worker-startup')
      console.log(`[SYNC_WORKER] ✅ Startup cleanup complete - locks: ${cleanupResult.locksCleared}, jobs: ${cleanupResult.jobsCleared}`)
    } catch (error) {
      console.error('[SYNC_WORKER] ⚠️ Error during startup cleanup (non-fatal):', error)
    }

    // Start heartbeat monitoring
    jobQueueService.startHeartbeat(this.config.workerId, this.config.heartbeatIntervalMs)

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers()

    // Start the main processing loop
    this.startPolling()

    console.log(`[SYNC_WORKER] ✅ Worker ${this.config.workerId} is now running`)
  }

  private setupShutdownHandlers(): void {
    const gracefulShutdown = async (signal: string) => {
      console.log(`[SYNC_WORKER] 🛑 Received ${signal}, initiating graceful shutdown...`)
      this.isShuttingDown = true

      // Stop polling for new jobs
      if (this.pollingTimer) {
        clearTimeout(this.pollingTimer)
        this.pollingTimer = null
      }

      // Stop heartbeat
      jobQueueService.stopHeartbeat()

      // Wait for active jobs to complete
      if (this.activeJobs.size > 0) {
        console.log(`[SYNC_WORKER] ⏳ Waiting for ${this.activeJobs.size} active job(s) to complete...`)
        
        const shutdownPromise = Promise.all(Array.from(this.activeJobs))
        const timeoutPromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            console.log(`[SYNC_WORKER] ⚠️ Shutdown timeout reached, forcing exit`)
            resolve()
          }, this.config.shutdownTimeoutMs)
        })

        await Promise.race([shutdownPromise, timeoutPromise])
      }

      console.log(`[SYNC_WORKER] 👋 Worker ${this.config.workerId} shutdown complete`)
      process.exit(0)
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'))
  }

  private startPolling(): void {
    this.poll()
  }

  private async poll(): Promise<void> {
    if (this.isShuttingDown) return

    try {
      // Don't exceed max concurrent jobs
      if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
        console.log(`[SYNC_WORKER] ⏳ Max concurrent jobs (${this.config.maxConcurrentJobs}) reached, waiting...`)
        this.scheduleNextPoll()
        return
      }

      // Get next batch of jobs (now returns {job, jobRunId})
      const jobsWithRuns = await jobQueueService.getNextJob(
        this.config.workerId, 
        Math.min(this.config.batchSize, this.config.maxConcurrentJobs - this.activeJobs.size)
      )

      if (jobsWithRuns.length === 0) {
        console.log(`[SYNC_WORKER] 😴 No jobs found, waiting ${this.config.pollingIntervalMs}ms...`)
      }

      // Process each job
      for (const {job, jobRunId} of jobsWithRuns) {
        const jobPromise = this.processJob(job, jobRunId)
        this.activeJobs.add(jobPromise)
        
        // Remove from active jobs when complete
        jobPromise.finally(() => {
          this.activeJobs.delete(jobPromise)
        })
      }

    } catch (error) {
      console.error(`[SYNC_WORKER] ❌ Polling error:`, error)
    }

    this.scheduleNextPoll()
  }

  private scheduleNextPoll(): void {
    if (!this.isShuttingDown) {
      this.pollingTimer = setTimeout(() => this.poll(), this.config.pollingIntervalMs)
    }
  }

  private async processJob(job: any, jobRunId: string): Promise<void> {
    const startTime = Date.now()

    try {
      console.log(`[SYNC_WORKER] 🎯 Processing job ${job.id} of type ${job.type} (run: ${jobRunId})`)

      // jobRunId is now properly passed from getNextJob()

      const payload: JobPayload = JSON.parse(job.payload)
      const result = await this.executeJob(job.type, payload)

      const durationMs = Date.now() - startTime
      
      // CRITICAL FIX: Check if sync actually succeeded before marking job as complete
      // Syncs can return {success: false} without throwing, which should mark the job as FAILED
      if (result && result.success === false) {
        const errorMessage = result.error || 'Sync operation failed'
        await jobQueueService.failJob(job.id, jobRunId, errorMessage, durationMs)
        console.log(`[SYNC_WORKER] ❌ Job ${job.id} failed: ${errorMessage}`)
        // Don't send error notification here since it's expected (lock contention, etc)
      } else {
        await jobQueueService.completeJob(job.id, jobRunId, durationMs, result)
        console.log(`[SYNC_WORKER] ✅ Job ${job.id} completed successfully in ${durationMs}ms`)
      }

    } catch (error: any) {
      const durationMs = Date.now() - startTime
      const errorMessage = error.message || 'Unknown error'

      console.error(`[SYNC_WORKER] ❌ Job ${job.id} failed:`, errorMessage)

      if (jobRunId) {
        await jobQueueService.failJob(job.id, jobRunId, errorMessage, durationMs)
      }

      // Send error notification for critical failures
      await this.sendErrorNotification(job, error)
    }
  }

  private async executeJob(type: JobType, payload: JobPayload): Promise<any> {
    switch (type) {
      case JobType.DAILY_SYNC:
      case JobType.WEBHOOK_SYNC:
      case JobType.MANUAL_SYNC:
        return await this.handleDailySyncJob(payload)

      case JobType.EMAIL_SEND:
        return await this.handleEmailJob(payload)

      case JobType.DATA_CLEANUP:
        return await this.handleDataCleanupJob(payload)

      default:
        throw new Error(`Unknown job type: ${type}`)
    }
  }

  private async handleDailySyncJob(payload: JobPayload): Promise<any> {
    console.log(`[SYNC_WORKER] 🔄 Starting daily sync operation...`)
    
    // Configurable timeout with generous default for large syncs
    // Set SYNC_TIMEOUT_MINUTES env var to customize (default: 180 minutes)
    const timeoutMinutes = parseInt(process.env.SYNC_TIMEOUT_MINUTES || '180', 10)
    const SYNC_TIMEOUT_MS = timeoutMinutes * 60 * 1000
    
    console.log(`[SYNC_WORKER] ⏱️  Sync timeout set to ${timeoutMinutes} minutes`)
    
    const startTime = Date.now()
    
    try {
      const syncPromise = this.executeSyncWithTimeout(SYNC_TIMEOUT_MS)
      const result = await syncPromise

      // CRITICAL FIX: Update DailySyncStatus on SUCCESS as well
      // This ensures the UI always shows the most recent sync status
      console.log(`[SYNC_WORKER] ✅ Daily sync completed successfully, updating status table...`)
      
      const syncManager = DailySyncManager.getInstance()
      const { EasternTimeManager } = await import('../lib/timezone-utils')
      const today = EasternTimeManager.getCurrentEasternDate()
      
      // Update status to reflect successful completion
      await (syncManager as any).updateSyncStatus({
        last_sync_date: today,
        last_sync_success: true,
        last_sync_duration_ms: result.duration || (Date.now() - startTime),
        total_records: result.totalRecords || 0,
        error_message: null
      })
      
      console.log(`[SYNC_WORKER] 📊 Status updated: ${result.totalRecords} records in ${result.duration}ms`)
      return result
    } catch (error: any) {
      // CRITICAL FIX: Update DailySyncStatus even on timeout/failure
      // This ensures the UI always shows the correct status
      console.error(`[SYNC_WORKER] ❌ Sync failed, updating status table...`)
      
      const syncManager = DailySyncManager.getInstance()
      const { EasternTimeManager } = await import('../lib/timezone-utils')
      const today = EasternTimeManager.getCurrentEasternDate()
      
      // Update status to show failure with helpful message
      await (syncManager as any).updateSyncStatus({
        last_sync_date: today,
        last_sync_success: false,
        last_sync_duration_ms: 0,
        total_records: 0,
        error_message: error.message || 'Sync operation failed'
      })
      
      throw error // Re-throw to let job queue handle retry logic
    }
  }

  private async executeSyncWithTimeout(timeoutMs: number): Promise<any> {
    const syncManager = DailySyncManager.getInstance()
    
    return new Promise(async (resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        reject(new Error(`Sync operation timed out after ${timeoutMs / 1000} seconds`))
      }, timeoutMs)

      try {
        console.log(`[SYNC_WORKER] 🕐 Starting sync with ${timeoutMs / 1000}s timeout`)
        const result = await syncManager.performSync('daily')
        clearTimeout(timeout)
        resolve(result)
      } catch (error) {
        clearTimeout(timeout)
        reject(error)
      }
    })
  }

  private async handleEmailJob(payload: JobPayload): Promise<any> {
    console.log(`[SYNC_WORKER] 📧 Processing email job...`)
    
    const { emailType, recipient, subject, htmlContent, textContent } = payload.metadata || {}
    
    if (!emailType || !recipient) {
      throw new Error('Invalid email job payload: missing emailType or recipient')
    }

    const emailService = new EmailService()
    const success = await emailService.sendEmail({
      to: recipient,
      subject: subject || 'Cynthia Gardens Notification',
      htmlContent: htmlContent || textContent || 'No content provided',
      textContent: textContent || 'No content provided'
    })

    if (!success) {
      throw new Error('Email sending failed')
    }

    console.log(`[SYNC_WORKER] ✅ Email sent to ${recipient}`)
    return { sent: true, recipient }
  }

  private async handleDataCleanupJob(payload: JobPayload): Promise<any> {
    console.log(`[SYNC_WORKER] 🧹 Starting data cleanup operation...`)
    
    const { olderThanDays = 7 } = payload.metadata || {}
    
    // Cleanup old jobs
    const deletedJobs = await jobQueueService.cleanupOldJobs(olderThanDays)
    
    console.log(`[SYNC_WORKER] ✅ Data cleanup completed: removed ${deletedJobs} old jobs`)
    return { deletedJobs, olderThanDays }
  }

  private async sendErrorNotification(job: any, error: Error): Promise<void> {
    try {
      const payload: JobPayload = JSON.parse(job.payload)
      const emailService = new EmailService()
      
      // Send notifications for all sync job failures (DAILY_SYNC and WEBHOOK_SYNC)
      const isSyncJob = [JobType.DAILY_SYNC, JobType.WEBHOOK_SYNC, JobType.MANUAL_SYNC].includes(job.type as JobType)
      
      if (!isSyncJob) {
        return
      }

      // Determine severity based on retry status
      const hasRetriesLeft = job.attempts < job.maxAttempts
      const severity = hasRetriesLeft ? 'high' : 'critical'
      
      // Prepare detailed error information
      const errorDetails = {
        jobId: job.id,
        jobType: job.type,
        attempts: `${job.attempts}/${job.maxAttempts}`,
        triggeredBy: payload.triggeredBy || 'unknown',
        triggeredAt: payload.timestamp,
        syncType: payload.syncType || job.type,
        errorMessage: error.message,
        errorName: error.name,
        retryStatus: hasRetriesLeft ? `Will retry (${job.maxAttempts - job.attempts} attempts remaining)` : 'All retries exhausted',
        metadata: payload.metadata
      }

      // Send enhanced failure notification
      await emailService.sendFailureNotification({
        type: 'sync_failure',
        title: hasRetriesLeft 
          ? `Webhook Sync Failed - Retry Pending (Attempt ${job.attempts}/${job.maxAttempts})`
          : `🚨 CRITICAL: Webhook Sync Failed Permanently`,
        description: hasRetriesLeft
          ? `The sync operation failed but will be retried automatically. This notification is for your awareness in case manual intervention is needed.`
          : `The sync operation has failed after all retry attempts. Manual intervention is required to resolve this issue.`,
        severity,
        details: errorDetails,
        timestamp: new Date().toISOString(),
        errorStack: error.stack,
        recoveryActions: hasRetriesLeft 
          ? [
              `Automatic retry scheduled`,
              `Monitor system logs for retry status`,
              `Check job queue status at https://gardencommand.com/admin`
            ]
          : [
              `Review error details above`,
              `Check AppFolio API connectivity and credentials`,
              `Verify database connection is stable`,
              `Check system logs for additional context`,
              `Manually trigger sync from admin panel after resolving issues`
            ]
      })

      const notificationLevel = hasRetriesLeft ? 'warning' : 'critical'
      console.log(`[SYNC_WORKER] 🚨 ${notificationLevel.toUpperCase()} failure notification sent to vipaymanshalaby@gmail.com for job ${job.id}`)
      
    } catch (notificationError) {
      console.error(`[SYNC_WORKER] ❌ Failed to send error notification:`, notificationError)
    }
  }

  async getStatus(): Promise<any> {
    const queueStatus = await jobQueueService.getQueueStatus()
    
    return {
      workerId: this.config.workerId,
      isShuttingDown: this.isShuttingDown,
      activeJobs: this.activeJobs.size,
      config: this.config,
      queueStatus
    }
  }
}

// Main entry point when run as standalone script
async function main() {
  console.log(`[SYNC_WORKER] 🎬 Starting Cynthia Gardens Sync Worker`)
  console.log(`[SYNC_WORKER] 📊 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`[SYNC_WORKER] 🕐 Started at: ${new Date().toISOString()}`)

  try {
    const worker = new SyncWorker()
    await worker.start()
  } catch (error) {
    console.error(`[SYNC_WORKER] 💥 Fatal error starting worker:`, error)
    process.exit(1)
  }
}

// Export for testing and programmatic use
export { SyncWorker }

// Run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`[SYNC_WORKER] 💥 Unhandled error:`, error)
    process.exit(1)
  })
}