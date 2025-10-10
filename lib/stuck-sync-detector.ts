import { prisma } from './prisma'
import { failureNotificationManager } from './failure-notification-manager'

/**
 * Stuck Sync Detection and Recovery System
 * 
 * Detects AppFolio syncs that have been running too long without progress
 * and provides automatic recovery mechanisms.
 */

interface StuckSyncInfo {
  lockId: string
  owner: string
  startedAt: Date
  lastProgressUpdate: Date
  currentProgress: string
  syncType: string
  hoursStuck: number
  shouldRecover: boolean
}

interface StuckSyncStatus {
  hasStuckSync: boolean
  stuckSyncs: StuckSyncInfo[]
  autoRecoveryTriggered: boolean
  recoveryActions: string[]
}

export class StuckSyncDetector {
  private static instance: StuckSyncDetector
  
  // Configuration
  private readonly MAX_SYNC_HOURS = 6 // Consider sync stuck after 6 hours
  private readonly MAX_PROGRESS_STALENESS_HOURS = 2 // No progress updates for 2+ hours
  private readonly AUTO_RECOVERY_ENABLED = true
  
  static getInstance(): StuckSyncDetector {
    if (!StuckSyncDetector.instance) {
      StuckSyncDetector.instance = new StuckSyncDetector()
    }
    return StuckSyncDetector.instance
  }

  /**
   * Check for stuck sync operations
   */
  async detectStuckSyncs(): Promise<StuckSyncStatus> {
    try {
      const now = new Date()
      const stuckSyncs: StuckSyncInfo[] = []
      let autoRecoveryTriggered = false
      const recoveryActions: string[] = []

      // Query for potentially stuck syncs
      const activeLocks = await prisma.$queryRaw<Array<{
        id: string
        owner: string
        acquired_at: Date
        expires_at: Date
        current_progress: string | null
        sync_type: string | null
        started_at: Date | null
        updated_at: Date | null
      }>>`
        SELECT id, owner, acquired_at, expires_at, current_progress, sync_type, started_at, updated_at
        FROM sync_locks 
        WHERE expires_at > CURRENT_TIMESTAMP
        ORDER BY acquired_at ASC
      `

      for (const lock of activeLocks) {
        const startedAt = lock.started_at || lock.acquired_at
        const lastProgressUpdate = lock.updated_at || lock.acquired_at
        
        const hoursRunning = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60)
        const hoursSinceProgress = (now.getTime() - lastProgressUpdate.getTime()) / (1000 * 60 * 60)
        
        const isStuckByDuration = hoursRunning > this.MAX_SYNC_HOURS
        const isStuckByProgress = hoursSinceProgress > this.MAX_PROGRESS_STALENESS_HOURS
        const shouldRecover = this.AUTO_RECOVERY_ENABLED && (isStuckByDuration || isStuckByProgress)
        
        if (isStuckByDuration || isStuckByProgress) {
          const stuckInfo: StuckSyncInfo = {
            lockId: lock.id,
            owner: lock.owner,
            startedAt,
            lastProgressUpdate,
            currentProgress: lock.current_progress || 'Unknown',
            syncType: lock.sync_type || 'unknown',
            hoursStuck: Math.max(hoursRunning, hoursSinceProgress),
            shouldRecover
          }
          
          stuckSyncs.push(stuckInfo)
          
          console.warn(`[STUCK_SYNC_DETECTOR] 🚨 Detected stuck sync:`, {
            lockId: stuckInfo.lockId,
            owner: stuckInfo.owner,
            hoursStuck: stuckInfo.hoursStuck.toFixed(1),
            currentProgress: stuckInfo.currentProgress,
            shouldRecover: stuckInfo.shouldRecover
          })
          
          // Perform auto-recovery if enabled
          if (shouldRecover) {
            try {
              await this.recoverStuckSync(stuckInfo)
              autoRecoveryTriggered = true
              const recoveryMessage = `Recovered stuck ${stuckInfo.syncType} sync (${stuckInfo.hoursStuck.toFixed(1)}h stuck)`
              recoveryActions.push(recoveryMessage)
              
              // Send failure notification for stuck sync recovery
              try {
                await failureNotificationManager.reportStuckSyncRecovery({
                  lockId: stuckInfo.lockId,
                  hoursStuck: stuckInfo.hoursStuck,
                  syncType: stuckInfo.syncType,
                  recoveryMethod: 'automatic'
                })
              } catch (notificationError) {
                console.error(`[STUCK_SYNC_DETECTOR] Failed to send recovery notification:`, notificationError)
              }
              
            } catch (recoveryError) {
              console.error(`[STUCK_SYNC_DETECTOR] ❌ Failed to recover stuck sync ${stuckInfo.lockId}:`, recoveryError)
              const failureMessage = `Failed to recover ${stuckInfo.syncType} sync: ${recoveryError}`
              recoveryActions.push(failureMessage)
              
              // Send failure notification for failed recovery
              try {
                await failureNotificationManager.reportFailure({
                  type: 'critical_error',
                  title: 'Stuck Sync Auto-Recovery Failed',
                  description: `Failed to automatically recover a stuck ${stuckInfo.syncType} sync that was stuck for ${stuckInfo.hoursStuck.toFixed(1)} hours. Manual intervention may be required.`,
                  error: recoveryError,
                  context: {
                    lockId: stuckInfo.lockId,
                    hoursStuck: stuckInfo.hoursStuck,
                    syncType: stuckInfo.syncType,
                    currentProgress: stuckInfo.currentProgress
                  },
                  recoveryActions: [
                    'Automatic recovery failed',
                    'Manual intervention required',
                    'Check system logs for details',
                    'Consider manual sync restart'
                  ]
                })
              } catch (notificationError) {
                console.error(`[STUCK_SYNC_DETECTOR] Failed to send recovery failure notification:`, notificationError)
              }
            }
          }
        }
      }

      const result: StuckSyncStatus = {
        hasStuckSync: stuckSyncs.length > 0,
        stuckSyncs,
        autoRecoveryTriggered,
        recoveryActions
      }

      if (result.hasStuckSync) {
        console.warn(`[STUCK_SYNC_DETECTOR] Found ${stuckSyncs.length} stuck sync(s)`)
      }

      return result
    } catch (error) {
      console.error('[STUCK_SYNC_DETECTOR] Error detecting stuck syncs:', error)
      return {
        hasStuckSync: false,
        stuckSyncs: [],
        autoRecoveryTriggered: false,
        recoveryActions: [`Detection failed: ${error}`]
      }
    }
  }

  /**
   * Recover a stuck sync by using cooperative cancellation first, then force recovery
   */
  private async recoverStuckSync(stuckSync: StuckSyncInfo): Promise<void> {
    console.log(`[STUCK_SYNC_DETECTOR] 🔧 Attempting recovery for stuck sync: ${stuckSync.lockId}`)
    
    try {
      // Step 1: Request cooperative cancellation first
      await this.requestCooperativeCancellation(stuckSync.lockId)
      
      // Step 2: Wait longer for cooperative cancellation (2x polling interval)
      await new Promise(resolve => setTimeout(resolve, 75000)) // 75 second grace period
      
      // Step 3: Check if sync cooperatively cancelled
      const stillExists = await this.checkLockExists(stuckSync.lockId)
      if (!stillExists) {
        console.log(`[STUCK_SYNC_DETECTOR] ✅ Sync cooperatively cancelled: ${stuckSync.lockId}`)
        return
      }
      
      // Step 4: Force-release if cooperative cancellation failed
      console.warn(`[STUCK_SYNC_DETECTOR] Cooperative cancellation failed, force-releasing: ${stuckSync.lockId}`)
      await this.forceReleaseLock(stuckSync.lockId)
      
      // Step 5: Clean up stuck checkpoints (scoped to this sync)
      await this.cleanupStuckCheckpoints(stuckSync.owner, stuckSync.syncType)
      
      // Step 6: Log the recovery action
      await this.logRecoveryAction(stuckSync)
      
      console.log(`[STUCK_SYNC_DETECTOR] ✅ Successfully recovered stuck sync: ${stuckSync.lockId}`)
      
    } catch (error) {
      console.error(`[STUCK_SYNC_DETECTOR] ❌ Recovery failed for ${stuckSync.lockId}:`, error)
      throw error
    }
  }

  /**
   * Force-release a stuck sync lock
   */
  private async forceReleaseLock(lockId: string): Promise<void> {
    try {
      const deleteResult = await prisma.$executeRaw`
        DELETE FROM sync_locks WHERE id = ${lockId}
      `
      console.log(`[STUCK_SYNC_DETECTOR] 🔓 Force-released lock: ${lockId}`)
    } catch (error) {
      console.error(`[STUCK_SYNC_DETECTOR] Failed to force-release lock ${lockId}:`, error)
      throw error
    }
  }

  /**
   * Request cooperative cancellation by setting the cancel_requested flag
   */
  private async requestCooperativeCancellation(lockId: string): Promise<void> {
    try {
      // Set cancel flag and shorten lock expiry to encourage quick release
      const urgentExpiry = new Date(Date.now() + 2 * 60 * 1000) // 2 minutes from now
      
      await prisma.$executeRaw`
        UPDATE sync_locks 
        SET cancel_requested = true,
            expires_at = ${urgentExpiry},
            current_progress = 'Cancellation requested - stopping gracefully...'
        WHERE id = ${lockId}
      `
      console.log(`[STUCK_SYNC_DETECTOR] 📢 Requested cooperative cancellation for: ${lockId} (expires in 2 min)`)
    } catch (error) {
      console.error(`[STUCK_SYNC_DETECTOR] Failed to request cooperative cancellation:`, error)
      throw error
    }
  }

  /**
   * Check if a lock still exists
   */
  private async checkLockExists(lockId: string): Promise<boolean> {
    try {
      const result = await prisma.$queryRaw<[{count: number}]>`
        SELECT COUNT(*) as count FROM sync_locks WHERE id = ${lockId}
      `
      return result[0].count > 0
    } catch (error) {
      console.error(`[STUCK_SYNC_DETECTOR] Failed to check lock existence:`, error)
      return true // Assume exists on error for safety
    }
  }

  /**
   * Clean up stuck report checkpoints that might be preventing progress (scoped to specific sync)
   */
  private async cleanupStuckCheckpoints(owner: string, syncType?: string): Promise<void> {
    try {
      // First check if report_checkpoints table exists
      const tableExists = await prisma.$queryRaw<[{exists: boolean}]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'report_checkpoints'
        ) as exists
      `
      
      if (!tableExists[0].exists) {
        console.log(`[STUCK_SYNC_DETECTOR] report_checkpoints table doesn't exist - skipping cleanup`)
        return
      }

      // Reset running checkpoints that are genuinely stuck (more conservative)
      const resetResult = await prisma.$executeRaw`
        UPDATE report_checkpoints 
        SET status = 'pending', 
            "resumeMetadata" = NULL,
            "lastError" = ${`Reset due to ${syncType || 'unknown'} sync recovery`}
        WHERE status = 'running'
        AND "lastIngestedAt" < (CURRENT_TIMESTAMP - INTERVAL '4 hours')
      `
      
      console.log(`[STUCK_SYNC_DETECTOR] 🧹 Reset genuinely stuck report checkpoints (4+ hours old)`)
    } catch (error) {
      console.error(`[STUCK_SYNC_DETECTOR] Failed to cleanup stuck checkpoints:`, error)
      // Don't throw - this is cleanup, not critical
    }
  }

  /**
   * Log recovery action for audit trail
   */
  private async logRecoveryAction(stuckSync: StuckSyncInfo): Promise<void> {
    try {
      await prisma.dailySyncStatus.upsert({
        where: { id: 'sync_status_singleton' },
        update: {
          lastSyncSuccess: false,
          errorMessage: `Auto-recovered stuck ${stuckSync.syncType} sync after ${stuckSync.hoursStuck.toFixed(1)} hours`,
          updatedAt: new Date()
        },
        create: {
          id: 'sync_status_singleton',
          lastSyncSuccess: false,
          errorMessage: `Auto-recovered stuck ${stuckSync.syncType} sync after ${stuckSync.hoursStuck.toFixed(1)} hours`
        }
      })
      
      console.log(`[STUCK_SYNC_DETECTOR] 📝 Logged recovery action for ${stuckSync.lockId}`)
    } catch (error) {
      console.error(`[STUCK_SYNC_DETECTOR] Failed to log recovery action:`, error)
      // Don't throw - this is logging, not critical
    }
  }

  /**
   * Manual recovery trigger (for API endpoints or admin use)
   */
  async forceRecoverAllStuckSyncs(): Promise<StuckSyncStatus> {
    console.log(`[STUCK_SYNC_DETECTOR] 🔧 Manual recovery triggered`)
    
    const status = await this.detectStuckSyncs()
    
    // The detectStuckSyncs already handles auto-recovery, so we just return the status
    return status
  }

  /**
   * Get current status without triggering recovery (read-only)
   */
  async getStuckSyncStatus(): Promise<StuckSyncStatus> {
    // Temporarily disable auto-recovery for this check
    const originalAutoRecovery = (this as any).AUTO_RECOVERY_ENABLED
    ;(this as any).AUTO_RECOVERY_ENABLED = false
    
    try {
      const status = await this.detectStuckSyncs()
      return status
    } finally {
      // Restore auto-recovery setting
      ;(this as any).AUTO_RECOVERY_ENABLED = originalAutoRecovery
    }
  }
}

// Export singleton for easy access
export const stuckSyncDetector = StuckSyncDetector.getInstance()