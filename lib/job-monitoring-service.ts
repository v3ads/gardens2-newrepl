import { prisma, withPrismaRetry } from './prisma'
import { jobQueueService } from './job-queue-service'
import { EmailService } from './email-service'

// JobStatus enum definition (matches Prisma schema)
enum JobStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export interface JobAlert {
  type: 'failure' | 'stuck' | 'backlog' | 'worker_down'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  message: string
  jobId?: string
  metadata?: Record<string, any>
}

export interface MonitoringMetrics {
  totalJobs: number
  queuedJobs: number
  runningJobs: number
  completedJobs: number
  failedJobs: number
  avgExecutionTimeMs: number
  oldestQueuedJob?: Date
  stuckJobs: number
  workerStatus: {
    activeWorkers: number
    lastHeartbeat?: Date
    healthyWorkers: number
  }
  alerts: JobAlert[]
}

export class JobMonitoringService {
  private static instance: JobMonitoringService
  private emailService: EmailService
  private alertCooldowns = new Map<string, number>()
  private readonly ALERT_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes

  constructor() {
    this.emailService = new EmailService()
  }

  static getInstance(): JobMonitoringService {
    if (!JobMonitoringService.instance) {
      JobMonitoringService.instance = new JobMonitoringService()
    }
    return JobMonitoringService.instance
  }

  /**
   * Get comprehensive job queue metrics and health status
   */
  async getMonitoringMetrics(): Promise<MonitoringMetrics> {
    try {
      const [
        jobCounts,
        avgExecution,
        oldestQueued,
        stuckJobs,
        workerStatus
      ] = await Promise.all([
        this.getJobCounts(),
        this.getAverageExecutionTime(),
        this.getOldestQueuedJob(),
        this.detectStuckJobs(),
        this.getWorkerStatus()
      ])

      const alerts = await this.generateAlerts({
        ...jobCounts,
        stuckJobs: stuckJobs.length,
        workerStatus,
        oldestQueuedJob: oldestQueued
      })

      return {
        totalJobs: jobCounts.totalJobs,
        queuedJobs: jobCounts.queuedJobs,
        runningJobs: jobCounts.runningJobs,
        completedJobs: jobCounts.completedJobs,
        failedJobs: jobCounts.failedJobs,
        avgExecutionTimeMs: avgExecution,
        oldestQueuedJob: oldestQueued,
        stuckJobs: stuckJobs.length,
        workerStatus,
        alerts
      }
    } catch (error) {
      console.error('[JOB_MONITOR] Error getting metrics:', error)
      throw error
    }
  }

  /**
   * Get job counts by status
   */
  private async getJobCounts(): Promise<{
    totalJobs: number
    queuedJobs: number
    runningJobs: number
    completedJobs: number
    failedJobs: number
  }> {
    const counts = await withPrismaRetry(async () => {
      return await prisma.jobQueue.groupBy({
        by: ['status'],
        _count: {
          id: true
        }
      })
    })

    const result = {
      totalJobs: 0,
      queuedJobs: 0,
      runningJobs: 0,
      completedJobs: 0,
      failedJobs: 0
    }

    counts.forEach(({ status, _count }: { status: any, _count: any }) => {
      result.totalJobs += _count.id
      switch (status) {
        case JobStatus.QUEUED:
          result.queuedJobs = _count.id
          break
        case JobStatus.RUNNING:
          result.runningJobs = _count.id
          break
        case JobStatus.SUCCEEDED:
          result.completedJobs = _count.id
          break
        case JobStatus.FAILED:
          result.failedJobs = _count.id
          break
      }
    })

    return result
  }

  /**
   * Get average execution time for completed jobs (last 24h)
   */
  private async getAverageExecutionTime(): Promise<number> {
    try {
      const result = await withPrismaRetry(async () => {
        return await prisma.jobRun.aggregate({
          where: {
            finishedAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            },
            success: true,
            durationMs: {
              not: null
            }
          },
          _avg: {
            durationMs: true
          }
        })
      })

      return Math.round(result._avg.durationMs || 0)
    } catch (error) {
      console.error('[JOB_MONITOR] Error calculating avg execution time:', error)
      return 0
    }
  }

  /**
   * Get oldest queued job
   */
  private async getOldestQueuedJob(): Promise<Date | undefined> {
    try {
      const oldestJob = await withPrismaRetry(async () => {
        return await prisma.jobQueue.findFirst({
          where: { status: JobStatus.QUEUED },
          orderBy: { runAt: 'asc' },
          select: { runAt: true }
        })
      })

      return oldestJob?.runAt
    } catch (error) {
      console.error('[JOB_MONITOR] Error getting oldest queued job:', error)
      return undefined
    }
  }

  /**
   * Detect stuck jobs (running too long without heartbeat)
   */
  private async detectStuckJobs(): Promise<any[]> {
    try {
      const stuckThresholdMs = 45 * 60 * 1000 // 45 minutes
      const heartbeatThresholdMs = 5 * 60 * 1000 // 5 minutes since last heartbeat

      const stuckJobs = await withPrismaRetry(async () => {
        return await prisma.jobQueue.findMany({
          where: {
            status: JobStatus.RUNNING,
            updatedAt: {
              lt: new Date(Date.now() - stuckThresholdMs)
            }
          },
          include: {
            jobRuns: {
              where: {
                finishedAt: null // Still running
              },
              orderBy: {
                startedAt: 'desc'
              },
              take: 1
            }
          }
        })
      })

      // Filter jobs with stale heartbeats
      return stuckJobs.filter((job: any) => {
        const lastRun = job.jobRuns[0]
        if (!lastRun) return true

        const timeSinceHeartbeat = Date.now() - new Date(lastRun.heartbeatAt).getTime()
        return timeSinceHeartbeat > heartbeatThresholdMs
      })
    } catch (error) {
      console.error('[JOB_MONITOR] Error detecting stuck jobs:', error)
      return []
    }
  }

  /**
   * Get worker status and health
   */
  private async getWorkerStatus(): Promise<{
    activeWorkers: number
    lastHeartbeat?: Date
    healthyWorkers: number
  }> {
    try {
      const heartbeatThresholdMs = 2 * 60 * 1000 // 2 minutes

      const activeRuns = await withPrismaRetry(async () => {
        return await prisma.jobRun.findMany({
          where: {
            finishedAt: null // Still running
          },
          select: {
            workerId: true,
            heartbeatAt: true
          },
          distinct: ['workerId']
        })
      })

      const now = Date.now()
      const healthyWorkers = activeRuns.filter((run: any) => {
        const timeSinceHeartbeat = now - new Date(run.heartbeatAt).getTime()
        return timeSinceHeartbeat <= heartbeatThresholdMs
      })

      const lastHeartbeat = activeRuns.length > 0 
        ? new Date(Math.max(...activeRuns.map((run: any) => new Date(run.heartbeatAt).getTime())))
        : undefined

      return {
        activeWorkers: activeRuns.length,
        lastHeartbeat,
        healthyWorkers: healthyWorkers.length
      }
    } catch (error) {
      console.error('[JOB_MONITOR] Error getting worker status:', error)
      return {
        activeWorkers: 0,
        healthyWorkers: 0
      }
    }
  }

  /**
   * Generate alerts based on current metrics
   */
  private async generateAlerts(metrics: any): Promise<JobAlert[]> {
    const alerts: JobAlert[] = []

    // Critical: No healthy workers
    if (metrics.workerStatus.healthyWorkers === 0 && metrics.queuedJobs > 0) {
      alerts.push({
        type: 'worker_down',
        severity: 'critical',
        title: 'No Healthy Workers',
        message: `No active workers detected with ${metrics.queuedJobs} queued jobs. Background processing is stopped.`,
        metadata: { 
          queuedJobs: metrics.queuedJobs,
          activeWorkers: metrics.workerStatus.activeWorkers 
        }
      })
    }

    // High: Stuck jobs detected
    if (metrics.stuckJobs > 0) {
      alerts.push({
        type: 'stuck',
        severity: 'high',
        title: 'Stuck Jobs Detected',
        message: `${metrics.stuckJobs} job(s) appear to be stuck (running too long without heartbeat).`,
        metadata: { stuckJobs: metrics.stuckJobs }
      })
    }

    // Medium: Large backlog
    if (metrics.queuedJobs > 10) {
      alerts.push({
        type: 'backlog',
        severity: 'medium',
        title: 'Large Job Backlog',
        message: `${metrics.queuedJobs} jobs are queued. Consider increasing worker capacity.`,
        metadata: { queuedJobs: metrics.queuedJobs }
      })
    }

    // Medium: Old queued jobs
    if (metrics.oldestQueuedJob) {
      const ageMs = Date.now() - new Date(metrics.oldestQueuedJob).getTime()
      const ageHours = ageMs / (1000 * 60 * 60)
      
      if (ageHours > 2) {
        alerts.push({
          type: 'backlog',
          severity: 'medium',
          title: 'Old Queued Jobs',
          message: `Oldest queued job is ${Math.round(ageHours)} hours old. Processing may be delayed.`,
          metadata: { 
            oldestQueuedAge: Math.round(ageHours),
            oldestQueuedJob: metrics.oldestQueuedJob 
          }
        })
      }
    }

    // High: High failure rate
    const totalRecentJobs = metrics.completedJobs + metrics.failedJobs
    if (totalRecentJobs > 0) {
      const failureRate = metrics.failedJobs / totalRecentJobs
      if (failureRate > 0.5) {
        alerts.push({
          type: 'failure',
          severity: 'high',
          title: 'High Failure Rate',
          message: `${Math.round(failureRate * 100)}% of recent jobs are failing. Check worker logs.`,
          metadata: { 
            failureRate: Math.round(failureRate * 100),
            failedJobs: metrics.failedJobs,
            totalJobs: totalRecentJobs 
          }
        })
      }
    }

    return alerts
  }

  /**
   * Send critical alerts via email (with cooldown)
   */
  async sendCriticalAlerts(alerts: JobAlert[]): Promise<void> {
    const criticalAlerts = alerts.filter(alert => alert.severity === 'critical')
    
    for (const alert of criticalAlerts) {
      const alertKey = `${alert.type}-${alert.severity}`
      const lastSent = this.alertCooldowns.get(alertKey) || 0
      const now = Date.now()

      // Check cooldown
      if (now - lastSent < this.ALERT_COOLDOWN_MS) {
        console.log(`[JOB_MONITOR] Alert ${alertKey} skipped (cooldown)`)
        continue
      }

      try {
        await this.emailService.sendEmail({
          to: 'vipaymanshalaby@gmail.com',
          subject: `🚨 CRITICAL ALERT: ${alert.title}`,
          htmlContent: `
            <h2>🚨 Critical System Alert</h2>
            <p><strong>Alert Type:</strong> ${alert.type}</p>
            <p><strong>Severity:</strong> ${alert.severity}</p>
            <p><strong>Title:</strong> ${alert.title}</p>
            <p><strong>Message:</strong> ${alert.message}</p>
            
            ${alert.metadata ? `
              <h3>Details:</h3>
              <pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
            ` : ''}
            
            <hr>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            <p><strong>System:</strong> Cynthia Gardens Command Center Job Queue</p>
            <p>This alert has a 15-minute cooldown to prevent spam.</p>
          `,
          textContent: `CRITICAL ALERT: ${alert.title}\n\n${alert.message}\n\nTimestamp: ${new Date().toISOString()}`
        })

        this.alertCooldowns.set(alertKey, now)
        console.log(`[JOB_MONITOR] 🚨 Critical alert sent: ${alert.title}`)
      } catch (error) {
        console.error(`[JOB_MONITOR] Failed to send critical alert:`, error)
      }
    }
  }

  /**
   * Check and cleanup stuck jobs
   */
  async cleanupStuckJobs(): Promise<number> {
    try {
      const stuckJobs = await this.detectStuckJobs()
      let cleanedCount = 0

      for (const stuckJob of stuckJobs) {
        console.log(`[JOB_MONITOR] 🧹 Cleaning up stuck job ${stuckJob.id}`)
        
        // Mark job as failed and create failure record
        await jobQueueService.failJob(
          stuckJob.id,
          stuckJob.jobRuns[0]?.id || 'unknown',
          'Job stuck - cleaned up by monitoring service',
          Date.now() - new Date(stuckJob.updatedAt).getTime()
        )
        
        cleanedCount++
      }

      if (cleanedCount > 0) {
        console.log(`[JOB_MONITOR] ✅ Cleaned up ${cleanedCount} stuck jobs`)
      }

      return cleanedCount
    } catch (error) {
      console.error('[JOB_MONITOR] Error cleaning stuck jobs:', error)
      return 0
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<{
    healthy: boolean
    metrics: MonitoringMetrics
    cleanedStuckJobs: number
  }> {
    try {
      const metrics = await this.getMonitoringMetrics()
      const cleanedStuckJobs = await this.cleanupStuckJobs()
      
      // Send critical alerts
      await this.sendCriticalAlerts(metrics.alerts)

      // System is healthy if no critical alerts
      const healthy = !metrics.alerts.some(alert => alert.severity === 'critical')

      console.log(`[JOB_MONITOR] Health check complete - ${healthy ? 'HEALTHY' : 'UNHEALTHY'}`)
      console.log(`[JOB_MONITOR] Metrics: ${metrics.queuedJobs} queued, ${metrics.runningJobs} running, ${metrics.failedJobs} failed`)
      
      return {
        healthy,
        metrics,
        cleanedStuckJobs
      }
    } catch (error) {
      console.error('[JOB_MONITOR] Health check failed:', error)
      throw error
    }
  }
}

export const jobMonitoringService = JobMonitoringService.getInstance()