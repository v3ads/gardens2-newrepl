import { DailySyncManager } from './daily-sync-manager'
import { jobQueueService } from './job-queue-service'

export class SyncMaintenanceService {
  private static instance: SyncMaintenanceService

  static getInstance(): SyncMaintenanceService {
    if (!SyncMaintenanceService.instance) {
      SyncMaintenanceService.instance = new SyncMaintenanceService()
    }
    return SyncMaintenanceService.instance
  }

  async performPreSyncCleanup(triggeredBy: 'webhook' | 'worker-startup'): Promise<{
    locksCleared: number
    jobsCleared: number
  }> {
    const startTime = Date.now()
    console.log(`[SYNC_MAINTENANCE] 🧹 Starting pre-sync cleanup (triggered by: ${triggeredBy})`)

    let locksCleared = 0
    let jobsCleared = 0

    try {
      console.log('[SYNC_MAINTENANCE] 🔓 Cleaning up stale sync locks...')
      
      if (triggeredBy === 'webhook') {
        // CRITICAL: Webhooks force-clear ALL locks (even if not expired)
        console.log('[SYNC_MAINTENANCE] 🔨 Force-clearing all sync locks (webhook-triggered)')
        const { prisma } = await import('./prisma')
        const deletedLocks = await prisma.syncLock.deleteMany({
          where: { id: 'daily_sync_lock' }
        })
        locksCleared = deletedLocks.count
        console.log(`[SYNC_MAINTENANCE] ✅ Force-cleared ${locksCleared} lock(s)`)
      } else {
        // Worker startup: Only clean expired locks (conservative)
        const syncManager = DailySyncManager.getInstance()
        await syncManager.cleanupExpiredLocks()
        locksCleared = 1
        console.log('[SYNC_MAINTENANCE] ✅ Expired lock cleanup completed')
      }
    } catch (error) {
      console.error('[SYNC_MAINTENANCE] ⚠️ Error during lock cleanup (non-fatal):', error)
    }

    try {
      console.log('[SYNC_MAINTENANCE] 🗑️ Clearing stuck jobs...')
      
      // CRITICAL: Use aggressive 10-minute threshold for webhooks, conservative 3-hour for worker startup
      const maxRunTimeMs = triggeredBy === 'webhook' 
        ? 10 * 60 * 1000 // 10 minutes for webhooks
        : parseInt(process.env.SYNC_TIMEOUT_MINUTES || '180', 10) * 60 * 1000 // 3 hours for worker startup
      
      const thresholdMinutes = Math.round(maxRunTimeMs / 60 / 1000)
      console.log(`[SYNC_MAINTENANCE] Using ${thresholdMinutes}-minute threshold for ${triggeredBy}`)
      
      jobsCleared = await jobQueueService.clearStuckJobs(maxRunTimeMs)
      console.log(`[SYNC_MAINTENANCE] ✅ Cleared ${jobsCleared} stuck job(s)`)
    } catch (error) {
      console.error('[SYNC_MAINTENANCE] ⚠️ Error during stuck job cleanup (non-fatal):', error)
    }

    const duration = Date.now() - startTime
    console.log(`[SYNC_MAINTENANCE] ✅ Pre-sync cleanup complete in ${duration}ms (locks: ${locksCleared}, jobs: ${jobsCleared})`)

    return { locksCleared, jobsCleared }
  }
}

export const syncMaintenanceService = SyncMaintenanceService.getInstance()
