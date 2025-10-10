import { analyticsDb } from './analytics-db-pg'
import { AppFolioReportIngestor } from './appfolioIngestor'
import { buildUnitsLeasingMaster, hasAnalyticsData, getOccupancyKPIs } from './occupancy-analytics'
import { MasterCSVSync } from './master-csv-sync'
import { GoogleSheetsVacancySync } from './google-sheets-vacancy-sync'
import { prisma, withPrismaRetry } from './prisma'
import { upsertKPI, type OccupancyKPIData } from './occupancy-kpi-repository'
import { stuckSyncDetector } from './stuck-sync-detector'
import { failureNotificationManager } from './failure-notification-manager'
import { EmailService } from './email-service'
import { EasternTimeManager } from './timezone-utils'

interface DailySyncStatus {
  last_sync_date: string | null
  last_sync_success: boolean
  last_sync_duration_ms: number
  total_records: number
  error_message: string | null
}

export class DailySyncManager {
  // Feature flag for sync optimization with safety fallback
  private readonly USE_OPTIMIZED_SYNC = process.env.USE_OPTIMIZED_SYNC === 'true'
  private static instance: DailySyncManager
  private isSyncing = false
  private currentProgress = ''
  private currentSyncType: 'daily' | 'webhook' | 'manual' | null = null
  private lockOwner: string = `process-${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  private lockRenewalInterval: NodeJS.Timeout | null = null
  
  // In-memory cache for sync status to reduce database calls
  private cachedSyncStatus: DailySyncStatus | null = null
  private lastCacheUpdate: number = 0
  private readonly CACHE_TTL_MS = 2000 // 2 second cache
  private readonly SYNC_LOCK_ID = 8675309 // Unique numeric ID for PostgreSQL advisory lock

  // CRITICAL FIX: Private constructor to set up exit handlers for zombie lock cleanup
  private constructor() {
    this.setupExitHandlers()
  }

  static getInstance(): DailySyncManager {
    if (!DailySyncManager.instance) {
      DailySyncManager.instance = new DailySyncManager()
    }
    return DailySyncManager.instance
  }

  // CRITICAL FIX: Setup process exit handlers to release locks on shutdown/crash
  private setupExitHandlers(): void {
    const gracefulShutdown = async (signal: string) => {
      console.log(`[DAILY_SYNC] 🛑 ${signal} received - attempting graceful lock cleanup...`)
      try {
        // Stop lock renewal immediately
        this.stopLockRenewal()
        
        // Release lock if we own it
        await this.releaseDistributedLock()
        console.log(`[DAILY_SYNC] ✅ Lock released successfully during ${signal} shutdown`)
      } catch (error) {
        console.error(`[DAILY_SYNC] ❌ Error releasing lock during ${signal}:`, error)
      }
    }

    // Handle graceful shutdown signals
    process.on('SIGTERM', () => {
      gracefulShutdown('SIGTERM').then(() => {
        process.exit(0)
      }).catch(() => {
        process.exit(1)
      })
    })

    process.on('SIGINT', () => {
      gracefulShutdown('SIGINT').then(() => {
        process.exit(0)
      }).catch(() => {
        process.exit(1)
      })
    })

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('[DAILY_SYNC] ❌ Uncaught exception - attempting lock cleanup:', error)
      gracefulShutdown('uncaughtException').then(() => {
        process.exit(1)
      }).catch(() => {
        process.exit(1)
      })
    })

    process.on('unhandledRejection', (reason) => {
      console.error('[DAILY_SYNC] ❌ Unhandled rejection - attempting lock cleanup:', reason)
      gracefulShutdown('unhandledRejection').then(() => {
        process.exit(1)
      }).catch(() => {
        process.exit(1)
      })
    })

    console.log('[DAILY_SYNC] ✅ Exit handlers installed for zombie lock prevention')
  }

  // Public methods for sync status tracking - restored table-based consistency
  public async isSyncInProgress(): Promise<boolean> {
    try {
      const lockId = 'daily_sync_lock'
      const lockCheck = await withPrismaRetry(() => 
        prisma.$queryRaw<[{owner: string}]>`
          SELECT owner FROM sync_locks WHERE id = ${lockId} AND expires_at > CURRENT_TIMESTAMP LIMIT 1
        `
      )
      return lockCheck.length > 0
    } catch (error) {
      console.error('[DAILY_SYNC] ❌ CRITICAL: Error checking sync status - assuming sync IS running for safety:', error)
      // CRITICAL FIX: Return true (safe default) instead of in-memory flag
      // If we can't check DB, assume sync might be running to prevent duplicate syncs
      return true
    }
  }

  public async getCurrentProgress(): Promise<string> {
    try {
      const lockId = 'daily_sync_lock'
      const result = await withPrismaRetry(() => 
        prisma.$queryRaw<[{current_progress: string}]>`
          SELECT current_progress FROM sync_locks WHERE id = ${lockId} LIMIT 1
        `
      )
      return result.length > 0 ? (result[0].current_progress || '') : ''
    } catch (error) {
      console.error('[DAILY_SYNC] Error getting progress - returning empty:', error)
      // CRITICAL FIX: Return empty string (safe default) instead of in-memory flag
      return ''
    }
  }

  public async getCurrentSyncType(): Promise<'daily' | 'webhook' | 'manual' | null> {
    try {
      const lockId = 'daily_sync_lock'
      const result = await withPrismaRetry(() => 
        prisma.$queryRaw<[{sync_type: string}]>`
          SELECT sync_type FROM sync_locks WHERE id = ${lockId} LIMIT 1
        `
      )
      return result.length > 0 ? (result[0].sync_type as 'daily' | 'webhook' | 'manual' | null) : null
    } catch (error) {
      console.error('[DAILY_SYNC] Error getting sync type - returning null:', error)
      // CRITICAL FIX: Return null (safe default) instead of in-memory flag
      return null
    }
  }

  private async setProgress(progress: string, step?: number, totalSteps?: number, recordsProcessed?: number) {
    this.currentProgress = progress // Keep memory copy for fallback
    console.log(`[DAILY_SYNC] Progress: ${progress} (Step ${step || 0}/${totalSteps || 0}, Records: ${recordsProcessed || 0})`)
    
    // CRITICAL FIX: Fire-and-forget DB updates to avoid blocking on locked rows
    // The outer withJobProtection transaction holds a lock on sync_locks, so we must NOT await these updates
    const lockId = 'daily_sync_lock'
    
    // Spawn progress update in background (non-blocking)
    withPrismaRetry(() => 
      prisma.$executeRaw`
        UPDATE sync_locks 
        SET current_progress = ${progress},
            current_step = COALESCE(${step !== undefined ? step : null}, current_step),
            total_steps = COALESCE(${totalSteps !== undefined ? totalSteps : null}, total_steps),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${lockId} AND owner = ${this.lockOwner}
      `
    ).then(result => {
      // Defensive diagnostic: Check if UPDATE actually affected any rows
      if (Number(result) === 0) {
        console.warn(`[DAILY_SYNC] ⚠️ Progress update affected 0 rows - owner mismatch detected`)
      }
    }).catch(error => {
      console.warn('[DAILY_SYNC] Progress update failed (non-fatal):', error)
    })
    
    // Also update total_records in sync status if provided (also fire-and-forget)
    if (recordsProcessed !== undefined && recordsProcessed > 0) {
      this.updateSyncStatus({
        total_records: recordsProcessed
      }).catch(err => {
        console.warn('[DAILY_SYNC] Sync status update failed (non-fatal):', err)
      })
    }
  }

  private async setSyncType(type: 'daily' | 'webhook' | 'manual') {
    this.currentSyncType = type // Keep memory copy for fallback
    
    try {
      const lockId = 'daily_sync_lock'
      await withPrismaRetry(() => 
        prisma.$executeRaw`
          UPDATE sync_locks 
          SET sync_type = ${type},
              started_at = CASE WHEN started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END
          WHERE id = ${lockId} AND owner = ${this.lockOwner}
        `
      )
    } catch (error) {
      console.error('[DAILY_SYNC] Error updating sync type:', error)
    }
  }

  // Safe application-level distributed locking
  private async acquireDistributedLock(): Promise<boolean> {
    try {
      console.log(`[DAILY_SYNC] Attempting to acquire distributed lock (owner: ${this.lockOwner})`)
      
      // Create sync_locks table if not exists with all progress tracking fields
      await withPrismaRetry(() => 
        prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS sync_locks (
            id TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            current_progress TEXT,
            current_step INTEGER,
            total_steps INTEGER,
            sync_type VARCHAR(50),
            started_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            cancel_requested BOOLEAN NOT NULL DEFAULT FALSE
          )
        `
      )
      
      // Add cancel_requested column if table already exists without it
      await withPrismaRetry(() => 
        prisma.$executeRaw`
          ALTER TABLE sync_locks 
          ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT FALSE
        `
      )
      
      const lockId = 'daily_sync_lock'
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes TTL
      
      // Try to acquire lock (upsert with conditional logic)
      const upsertResult = await withPrismaRetry(() => 
        prisma.$executeRaw`
          INSERT INTO sync_locks (id, owner, expires_at, created_at, updated_at) 
          VALUES (${lockId}, ${this.lockOwner}, ${expiresAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            owner = CASE 
              WHEN sync_locks.expires_at < CURRENT_TIMESTAMP THEN ${this.lockOwner}
              ELSE sync_locks.owner
            END,
            acquired_at = CASE
              WHEN sync_locks.expires_at < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP  
              ELSE sync_locks.acquired_at
            END,
            expires_at = CASE
              WHEN sync_locks.expires_at < CURRENT_TIMESTAMP THEN ${expiresAt}
              ELSE sync_locks.expires_at
            END
          WHERE sync_locks.expires_at < CURRENT_TIMESTAMP
        `
      )
      
      // Check if we actually got the lock
      const lockCheck = await withPrismaRetry(() => 
        prisma.$queryRaw<[{owner: string}]>`
          SELECT owner FROM sync_locks WHERE id = ${lockId} AND owner = ${this.lockOwner} LIMIT 1
        `
      )
      
      const acquired = lockCheck.length > 0
      
      if (acquired) {
        console.log(`[DAILY_SYNC] ✅ Distributed lock acquired successfully`)
        // Initialize progress tracking fields
        await withPrismaRetry(() => 
          prisma.$executeRaw`
            UPDATE sync_locks 
            SET current_progress = 'Initializing sync...',
                current_step = 1,
                started_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${lockId} AND owner = ${this.lockOwner}
          `
        )
        // Start lock renewal every 5 minutes
        this.startLockRenewal()
      } else {
        console.log(`[DAILY_SYNC] ❌ Failed to acquire distributed lock - another process is syncing`)
      }
      return acquired
    } catch (error) {
      console.error('[DAILY_SYNC] Error acquiring distributed lock:', error)
      return false
    }
  }

  // Start lock lease renewal with cancellation checking
  private startLockRenewal(): void {
    // Renew lock every 30 seconds for responsive cancellation checking
    this.lockRenewalInterval = setInterval(async () => {
      try {
        const lockId = 'daily_sync_lock'
        
        // Check for cancellation request before renewing
        const cancelCheck = await withPrismaRetry(() => 
          prisma.$queryRaw<[{cancel_requested: boolean}]>`
            SELECT cancel_requested FROM sync_locks WHERE id = ${lockId} AND owner = ${this.lockOwner} LIMIT 1
          `
        )
        
        if (cancelCheck.length > 0 && cancelCheck[0].cancel_requested) {
          console.warn(`[DAILY_SYNC] 🚨 Cancellation requested - stopping sync gracefully`)
          await this.handleCooperativeCancellation()
          return
        }
        
        const newExpiresAt = new Date(Date.now() + 30 * 60 * 1000) // Extend by 30 minutes
        
        const result = await withPrismaRetry(() => 
          prisma.$executeRaw`
            UPDATE sync_locks 
            SET expires_at = ${newExpiresAt},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${lockId} AND owner = ${this.lockOwner}
          `
        )
        console.log(`[DAILY_SYNC] 🔄 Lock lease renewed until ${newExpiresAt.toISOString()}`)
      } catch (error) {
        console.error('[DAILY_SYNC] ❌ Failed to renew lock lease:', error)
      }
    }, 30 * 1000) // Every 30 seconds for responsive cancellation
  }

  // Handle cooperative cancellation
  private async handleCooperativeCancellation(): Promise<void> {
    try {
      console.log(`[DAILY_SYNC] 🔴 Handling cooperative cancellation request`)
      
      // Update progress to show we're cancelling
      await this.setProgress('Sync cancelled by administrator request', 0, 0)
      
      // Clean up state
      this.isSyncing = false
      this.currentSyncType = null
      
      // Release the lock
      await this.releaseDistributedLock()
      
      // Update sync status to show cancellation
      const { EasternTimeManager } = await import('./timezone-utils')
      const today = EasternTimeManager.getCurrentEasternDate()
      await this.updateSyncStatus({
        last_sync_date: today,
        last_sync_success: false,
        last_sync_duration_ms: 0,
        total_records: 0,
        error_message: 'Sync cancelled by administrator request'
      })
      
      console.log(`[DAILY_SYNC] ✅ Cooperative cancellation completed successfully`)
      
    } catch (error) {
      console.error('[DAILY_SYNC] ❌ Error during cooperative cancellation:', error)
      // Force stop renewal and exit
      this.stopLockRenewal()
      throw error
    }
  }

  // Stop lock renewal
  private stopLockRenewal(): void {
    if (this.lockRenewalInterval) {
      clearInterval(this.lockRenewalInterval)
      this.lockRenewalInterval = null
      console.log(`[DAILY_SYNC] Lock renewal stopped`)
    }
  }

  // Release safe application-level lock
  private async releaseDistributedLock(): Promise<void> {
    try {
      this.stopLockRenewal()
      const lockId = 'daily_sync_lock'
      console.log(`[DAILY_SYNC] Releasing distributed lock (owner: ${this.lockOwner})`)
      
      await withPrismaRetry(() => 
        prisma.$executeRaw`
          DELETE FROM sync_locks WHERE id = ${lockId} AND owner = ${this.lockOwner}
        `
      )
      console.log(`[DAILY_SYNC] ✅ Distributed lock released`)
    } catch (error) {
      console.error('[DAILY_SYNC] Error releasing distributed lock:', error)
    }
  }

  // Check if we need to sync today - SERVER-SIDE ONLY
  public async needsDailySync(): Promise<boolean> {
    try {
      // EASTERN TIMEZONE NORMALIZATION: Always use Eastern time for sync consistency
      const { EasternTimeManager } = await import('./timezone-utils')
      const today = EasternTimeManager.getCurrentEasternDate()
      const status = await this.getSyncStatus()
      
      // Need sync if:
      // 1. Never synced before
      // 2. Last sync was a different day
      // 3. Last sync failed
      const needsSync = !status.last_sync_date || 
                       status.last_sync_date !== today || 
                       !status.last_sync_success

      console.log(`[DAILY_SYNC] Today: ${today}, Last sync: ${status.last_sync_date}, Last success: ${status.last_sync_success}, Needs sync: ${needsSync}`)
      return needsSync

    } catch (error) {
      console.error('[DAILY_SYNC] Error checking sync status:', error)
      return true // Default to needing sync on error
    }
  }

  // Get current sync status with in-memory caching
  public async getSyncStatus(): Promise<DailySyncStatus> {
    const now = Date.now()
    
    // Return cached result if still fresh
    if (this.cachedSyncStatus && (now - this.lastCacheUpdate) < this.CACHE_TTL_MS) {
      return this.cachedSyncStatus
    }
    
    try {
      const result = await prisma.dailySyncStatus.findUnique({
        where: { id: 'sync_status_singleton' }
      })

      let status: DailySyncStatus
      if (result) {
        status = {
          last_sync_date: result.lastSyncDate,
          last_sync_success: result.lastSyncSuccess,
          last_sync_duration_ms: result.lastSyncDurationMs,
          total_records: result.totalRecords,
          error_message: result.errorMessage
        }
      } else {
        // Return default if no record exists
        status = {
          last_sync_date: null,
          last_sync_success: false,
          last_sync_duration_ms: 0,
          total_records: 0,
          error_message: null
        }
      }
      
      // Cache the result
      this.cachedSyncStatus = status
      this.lastCacheUpdate = now
      return status
      
    } catch (error) {
      console.error('[DAILY_SYNC] Error getting sync status from PostgreSQL:', error)
      
      // Return cached result if we have one, otherwise default
      if (this.cachedSyncStatus) {
        return this.cachedSyncStatus
      }
      
      return {
        last_sync_date: null,
        last_sync_success: false,
        last_sync_duration_ms: 0,
        total_records: 0,
        error_message: 'Failed to get sync status'
      }
    }
  }

  // Update sync status in PostgreSQL
  private async updateSyncStatus(status: Partial<DailySyncStatus>): Promise<void> {
    try {
      await withPrismaRetry(() => 
        prisma.dailySyncStatus.upsert({
          where: { id: 'sync_status_singleton' },
          update: {
            lastSyncDate: status.last_sync_date,
            lastSyncSuccess: status.last_sync_success ?? false,
            lastSyncDurationMs: status.last_sync_duration_ms ?? 0,
            totalRecords: status.total_records ?? 0,
            errorMessage: status.error_message
          },
          create: {
            id: 'sync_status_singleton',
            lastSyncDate: status.last_sync_date,
            lastSyncSuccess: status.last_sync_success ?? false,
            lastSyncDurationMs: status.last_sync_duration_ms ?? 0,
            totalRecords: status.total_records ?? 0,
            errorMessage: status.error_message
          }
        })
      )

      console.log('[DAILY_SYNC] Updated sync status in PostgreSQL:', status)
    } catch (error) {
      console.error('[DAILY_SYNC] Error updating sync status in PostgreSQL:', error)
    }
  }

  // Check for stuck syncs before starting new sync
  private async checkAndRecoverStuckSyncs(): Promise<void> {
    try {
      console.log('[DAILY_SYNC] Checking for stuck sync operations...')
      
      // First, clean up any expired locks immediately
      await this.cleanupExpiredLocks()
      
      const stuckStatus = await stuckSyncDetector.detectStuckSyncs()
      
      if (stuckStatus.hasStuckSync) {
        console.warn(`[DAILY_SYNC] Found ${stuckStatus.stuckSyncs.length} stuck sync(s):`)
        stuckStatus.stuckSyncs.forEach(stuck => {
          console.warn(`  - ${stuck.syncType} sync stuck for ${stuck.hoursStuck.toFixed(1)}h (progress: ${stuck.currentProgress})`)
        })
        
        if (stuckStatus.autoRecoveryTriggered) {
          console.log('[DAILY_SYNC] ✅ Auto-recovery completed:')
          stuckStatus.recoveryActions.forEach(action => {
            console.log(`  - ${action}`)
          })
        }
      } else {
        console.log('[DAILY_SYNC] ✅ No stuck syncs detected')
      }
    } catch (error) {
      console.error('[DAILY_SYNC] Error checking for stuck syncs:', error)
      // Don't fail the sync for stuck detection errors
    }
  }

  // Clean up any expired locks immediately  
  // CRITICAL FIX: Made public for worker startup cleanup
  public async cleanupExpiredLocks(): Promise<void> {
    try {
      const result = await prisma.$executeRaw`
        DELETE FROM sync_locks WHERE expires_at < CURRENT_TIMESTAMP
      `
      if (result > 0) {
        console.log(`[DAILY_SYNC] ✅ Cleaned up ${result} expired lock(s)`)
      }
    } catch (error) {
      console.error('[DAILY_SYNC] Error cleaning up expired locks:', error)
    }
  }

  // Main sync router - chooses between legacy and optimized sync based on feature flag
  public async performSync(syncType: 'daily' | 'webhook' | 'manual' = 'daily'): Promise<{
    success: boolean
    duration: number
    totalRecords: number
    error?: string
  }> {
    const syncMethod = this.USE_OPTIMIZED_SYNC ? 'OPTIMIZED' : 'LEGACY'
    console.log(`[${syncType.toUpperCase()}_SYNC] 🛡️ FEATURE FLAG: Using ${syncMethod} sync method (USE_OPTIMIZED_SYNC=${process.env.USE_OPTIMIZED_SYNC || 'false'})`)
    
    if (this.USE_OPTIMIZED_SYNC) {
      return this.performOptimizedSync(syncType)
    } else {
      return this.performLegacySync(syncType)
    }
  }

  // LEGACY SYNC: Current proven sync method (preserved exactly as-is for safety)
  // This is the original working sync logic - DO NOT MODIFY without testing
  private async performLegacySync(syncType: 'daily' | 'webhook' | 'manual' = 'daily'): Promise<{
    success: boolean
    duration: number
    totalRecords: number
    error?: string
  }> {
    if (this.isSyncing) {
      console.log(`[${syncType.toUpperCase()}_SYNC] Sync already in progress (in-memory check), skipping`)
      return { success: false, duration: 0, totalRecords: 0, error: 'Sync already in progress' }
    }

    // Check for and recover any stuck syncs before proceeding
    await this.checkAndRecoverStuckSyncs()

    // Track if we acquired lock to ensure cleanup in finally block
    let lockAcquired = false
    const startTime = Date.now()
    
    // Declare variables before try block for catch/finally access (CRITICAL FIX for zombie locks)
    let today: string | null = null
    let csvSyncResult: any = null
    let ingestionResult: any = { totalRecords: 0 }
    let vacancyRecords = 0
    let analyticsResult: any = { recordsProcessed: 0 }
    let tenantResult: any = null

    try {
      // CRITICAL FIX: Acquire lock INSIDE try block to ensure finally cleanup
      lockAcquired = await this.acquireDistributedLock()
      if (!lockAcquired) {
        return { 
          success: false, 
          duration: 0, 
          totalRecords: 0, 
          error: 'Another process is currently performing sync operation' 
        }
      }

      this.isSyncing = true
      this.setSyncType(syncType)
      
      // EASTERN TIMEZONE NORMALIZATION: Always use Eastern time for all sync operations
      const { EasternTimeManager } = await import('./timezone-utils')
      today = EasternTimeManager.getCurrentEasternDate()
      EasternTimeManager.logSyncOperation(`Starting ${syncType} sync`, { syncType, today })

      console.log(`[${syncType.toUpperCase()}_SYNC] Starting ${syncType} sync and analytics build...`)
      await this.setProgress('Starting sync...', 1, 7)

      // Update sync status immediately at start to show today's date
      await this.updateSyncStatus({
        last_sync_date: today,
        last_sync_success: false, // Will be updated to true on completion
        last_sync_duration_ms: 0,
        total_records: 0,
        error_message: 'Sync in progress...'
      })
      // Check credentials
      const clientId = process.env.APPFOLIO_CLIENT_ID
      const clientSecret = process.env.APPFOLIO_CLIENT_SECRET
      
      if (!clientId || !clientSecret) {
        throw new Error('AppFolio credentials not configured')
      }

      const tenantDomain = process.env.APPFOLIO_TENANT_DOMAIN || 'cynthiagardens.appfolio.com'
      
      // Step 1: Sync master CSV from Google Sheets
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 1: Syncing master.csv from Google Sheets...`)
      await this.setProgress('Syncing master.csv from Google Sheets...', 1, 7)
      csvSyncResult = await MasterCSVSync.syncMasterCSV()
      
      if (!csvSyncResult.success) {
        throw new Error(`Master CSV sync failed: ${csvSyncResult.error}`)
      }

      // Step 1.5: Materialize analytics_master from CSV data (ROOT CAUSE FIX)
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 1.5: Materializing analytics_master from CSV data...`)
      await this.setProgress('Materializing analytics_master from CSV data...', 1, 7)
      try {
        const analyticsResult = await this.materializeAnalyticsMasterFromCSV(today)
        if (!analyticsResult.success) {
          console.error(`[${syncType.toUpperCase()}_SYNC] ❌ analytics_master materialization failed: ${analyticsResult.error}`)
          throw new Error(`analytics_master materialization failed: ${analyticsResult.error}`)
        }
        console.log(`[${syncType.toUpperCase()}_SYNC] ✅ analytics_master materialized: ${analyticsResult.recordsProcessed} records for ${today}`)
      } catch (error) {
        console.error(`[${syncType.toUpperCase()}_SYNC] ❌ Failed to materialize analytics_master:`, error)
        throw error
      }

      // Step 1.6: Send email notification early (with previous day fallback for reliability)
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 1.6: Sending daily email notification...`)
      await this.setProgress('Sending daily email notification...', 1, 7)
      let earlyEmailSent = false
      if (csvSyncResult.csvFilePath) {
        const { emailService } = await import('./email-service')
        earlyEmailSent = await emailService.sendMasterCSVUpdateWithFallback(csvSyncResult.csvFilePath, csvSyncResult.metrics)
        if (earlyEmailSent) {
          console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Daily email notification sent successfully`)
        } else {
          console.log(`[${syncType.toUpperCase()}_SYNC] ⚠️ Daily email notification failed`)
        }
      }

      // Step 2: Ingest occupancy reports from AppFolio (with timeout)
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 2: Ingesting AppFolio occupancy reports...`)
      await this.setProgress('Ingesting AppFolio reports...', 2, 7, csvSyncResult.recordsProcessed)
      
      try {
        // NO TOP-LEVEL TIMEOUT - Rely on per-page 2-hour timeouts for true robustness  
        console.log(`[${syncType.toUpperCase()}_SYNC] Starting bulletproof AppFolio ingestion with per-page fault tolerance...`)
        
        const ingestor = new AppFolioReportIngestor({
          clientId,
          clientSecret,
          tenantDomain,
          concurrency: 1,
          delayBetweenRequests: 3000, // Base delay with intelligent adaptation
          maxConsecutive429s: 3, 
          rateLimitBackoffMs: 10000 // Base backoff for 429s  
        })
        
        const ingestionResults = await ingestor.ingestAllReports()
        
        ingestionResult = {
          success: ingestionResults.some(r => r.success),
          totalRecords: ingestionResults.reduce((sum, r) => sum + r.recordsIngested, 0)
        }
        
        if (!ingestionResult.success) {
          console.warn(`[${syncType.toUpperCase()}_SYNC] ⚠️ AppFolio ingestion had issues - continuing with partial sync`)
        } else {
          console.log(`[${syncType.toUpperCase()}_SYNC] ✅ AppFolio ingestion completed successfully`)
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.warn(`[${syncType.toUpperCase()}_SYNC] ⚠️ AppFolio ingestion failed or timed out: ${errorMessage} - continuing with partial sync`)
        ingestionResult = { success: false, totalRecords: 0 }
        // Don't throw - continue with partial sync
      }

      // Step 2.5: Ingest unit vacancy data from Google Sheets
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 2.5: Ingesting unit vacancy from Google Sheets...`)
      let runningTotal = csvSyncResult.recordsProcessed + ingestionResult.totalRecords
      await this.setProgress('Ingesting vacancy data from Google Sheets...', 3, 7, runningTotal)
      const vacancySync = new GoogleSheetsVacancySync()
      vacancyRecords = await vacancySync.syncVacancyData()
      
      runningTotal += vacancyRecords
      console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Google Sheets vacancy sync: ${vacancyRecords} records (Running total: ${runningTotal})`)

      // Step 3: Build analytics master - CRITICAL for data consistency
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 3: Building analytics master table...`)
      await this.setProgress('Building analytics master table...', 4, 7, runningTotal)
      analyticsResult = await buildUnitsLeasingMaster(today, async (progressMessage) => {
        await this.setProgress(progressMessage, 4, 7)
      })
      
      if (!analyticsResult.success) {
        throw new Error(`Analytics build failed: ${analyticsResult.error || 'Unknown error'}. Cannot mark sync as successful with stale analytics data.`)
      }
      
      runningTotal += analyticsResult.recordsProcessed
      console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Analytics build completed: ${analyticsResult.recordsProcessed} records processed (Running total: ${runningTotal})`)

      // Step 3.5: Process operational data ETL
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 3.5: Processing operational data ETL...`)
      await this.setProgress('Processing operational data ETL...', 5, 7, runningTotal)
      const { OperationalETL } = await import('./operational-etl')
      const operationalResult = await OperationalETL.processOperationalData()
      
      if (!operationalResult.success) {
        console.warn(`[${syncType.toUpperCase()}_SYNC] ⚠️ Operational ETL failed: ${operationalResult.error}`)
        // Don't fail entire sync for operational ETL issues
      } else {
        console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Operational ETL completed: ${operationalResult.recordsProcessed} records, ${operationalResult.tablesUpdated.join(', ')} updated`)
      }

      // Step 3.6: Build tenant analytics mart
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 3.6: Building tenant analytics mart...`)
      await this.setProgress('Building tenant analytics mart...', 6, 7)
      const { buildTenantMart } = await import('./analytics-builder')
      tenantResult = await buildTenantMart()
      
      if (!tenantResult.success) {
        console.warn(`[${syncType.toUpperCase()}_SYNC] ⚠️ Tenant mart build failed: ${tenantResult.error}`)
        // Don't fail entire sync for tenant analytics issues
      } else {
        console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Tenant mart built: ${tenantResult.recordsProcessed} records`)
      }

      // Step 4: Validate data integrity (ROOT CAUSE PREVENTION)
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 4: Validating data integrity...`)
      await this.setProgress('Validating data integrity...', 7, 7)
      const { validateDataIntegrity } = await import('./data-integrity-monitor')
      const integrityReport = await validateDataIntegrity(today)
      
      if (!integrityReport.success) {
        console.error(`[${syncType.toUpperCase()}_SYNC] ❌ Data integrity validation failed:`, integrityReport.issues)
        console.error(`[${syncType.toUpperCase()}_SYNC] Recommendations:`, integrityReport.recommendations)
        
        // Don't fail the sync but log critical issues
        if (integrityReport.issues.some(issue => issue.includes('SILENT FAILURE'))) {
          console.error(`[${syncType.toUpperCase()}_SYNC] 🚨 CRITICAL: Silent failure detected - analytics_master not updated properly`)
        }
      } else {
        console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Data integrity validation passed`)
      }
      
      // Also validate KPIs for backward compatibility
      const { getOccupancyKPIs } = await import('./occupancy-analytics')
      const kpis = await getOccupancyKPIs('latest')
      
      if (!kpis || kpis.total_units === 0) {
        console.warn(`[${syncType.toUpperCase()}_SYNC] ⚠️ KPI validation warning: No valid KPI data, but continuing sync`)
      } else {
        console.log(`[${syncType.toUpperCase()}_SYNC] ✅ KPI validation: ${kpis.total_units} units, ${kpis.occupied_units} occupied`)
      }

      // Step 5: Stability check and auto-repair
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 5: Stability check and maintenance...`)
      await this.setProgress('Running stability checks...', 6, 7)
      await this.performStabilityMaintenance()

      // Step 6: RentIQ calculation (if feature enabled)
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 6: Running RentIQ calculations...`)
      await this.setProgress('Calculating RentIQ pricing...', 6, 7)
      await this.performRentIQCalculation()

      // Step 7: Database maintenance (WAL checkpoint)
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 7: Performing database maintenance...`)
      await this.setProgress('Performing database maintenance...', 7, 7)
      this.performWALCheckpoint()

      // Step 8: Email already sent earlier - this is just logging
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 8: Email notification was sent after master CSV sync`)
      await this.setProgress('Email notification completed early...', 7, 7)

      // Step 9: Calculate and persist occupancy KPIs for instant page loads
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 9: Calculating and persisting occupancy KPIs...`)
      await this.setProgress('Calculating occupancy KPIs...', 6, 7)
      let kpiSuccess = false
      try {
        await this.calculateAndPersistOccupancyKPIs(today)
        console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Occupancy KPIs calculated and stored successfully`)
        kpiSuccess = true
      } catch (kpiError) {
        console.error(`[${syncType.toUpperCase()}_SYNC] ⚠️ KPI calculation failed, but sync continues:`, kpiError)
        // Don't fail the entire sync for KPI calculation errors - just log and continue
      }

      // Step 10: Parity validation (Phase 1 monitoring) - only if optimized sync is enabled
      if (this.USE_OPTIMIZED_SYNC) {
        console.log(`[${syncType.toUpperCase()}_SYNC] Step 10: Running parity validation for Phase 1 monitoring...`)
        await this.setProgress('Running parity validation...', 7, 7)
        try {
          const { ParityMonitor } = await import('./parity-monitor')
          const parityResult = await ParityMonitor.runParityValidation()
          
          if (parityResult.passedThreshold) {
            console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Parity validation passed: ${Math.max(...Object.values(parityResult.variance.kpis)).toFixed(3)}% max variance`)
          } else {
            console.warn(`[${syncType.toUpperCase()}_SYNC] ⚠️ Parity validation failed threshold: ${Math.max(...Object.values(parityResult.variance.kpis)).toFixed(3)}% variance`)
          }
          
          // Log performance improvement
          const performanceImprovement = parityResult.legacyResult.duration / Math.max(parityResult.optimizedResult.duration, 1)
          console.log(`[${syncType.toUpperCase()}_SYNC] 📊 Performance improvement: ${performanceImprovement.toFixed(1)}x faster than legacy`)
          
        } catch (parityError) {
          console.error(`[${syncType.toUpperCase()}_SYNC] ⚠️ Parity validation failed, but sync continues:`, parityError)
          // Don't fail the entire sync for parity validation errors - this is monitoring only
        }
      } else {
        console.log(`[${syncType.toUpperCase()}_SYNC] Step 10: Skipping parity validation (optimized sync not enabled)`)
      }

      const duration = Date.now() - startTime
      const totalRecords = csvSyncResult.recordsProcessed + ingestionResult.totalRecords + vacancyRecords + analyticsResult.recordsProcessed + (tenantResult?.recordsProcessed || 0)

      // Update sync status
      await this.updateSyncStatus({
        last_sync_date: today,
        last_sync_success: true,
        last_sync_duration_ms: duration,
        total_records: totalRecords,
        error_message: null
      })

      await this.setProgress('Sync completed successfully!', 7, 7)
      console.log(`[${syncType.toUpperCase()}_SYNC] ✅ ${syncType} sync completed successfully in ${duration}ms`)
      console.log(`[${syncType.toUpperCase()}_SYNC] Total records: ${totalRecords} (${csvSyncResult.recordsProcessed} CSV, ${ingestionResult.totalRecords} AppFolio, ${vacancyRecords} vacancy, ${analyticsResult.recordsProcessed} analytics, ${tenantResult?.recordsProcessed || 0} tenant mart)`)

      return {
        success: true,
        duration,
        totalRecords
      }

    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      await this.setProgress(`Error: ${errorMessage}`, 0, 6)
      console.error(`[${syncType.toUpperCase()}_SYNC] ❌ ${syncType} sync failed:`, error)

      // Send failure notification to admin
      try {
        await failureNotificationManager.reportSyncFailure(error, {
          syncType,
          step: this.currentProgress || 'unknown',
          duration: Math.round(duration / 1000 / 60), // minutes
          recordsProcessed: (csvSyncResult?.recordsProcessed || 0) + (ingestionResult?.totalRecords || 0) + vacancyRecords + (analyticsResult?.recordsProcessed || 0) + (tenantResult?.recordsProcessed || 0)
        })
      } catch (notificationError) {
        console.error('[DAILY_SYNC] Failed to send failure notification:', notificationError)
      }

      // Update sync status with error but preserve any partial progress
      await this.updateSyncStatus({
        last_sync_date: today || EasternTimeManager.getCurrentEasternDate(), // Fallback to current Eastern date if today is null
        last_sync_success: false,
        last_sync_duration_ms: duration,
        total_records: (csvSyncResult?.recordsProcessed || 0) + (ingestionResult?.totalRecords || 0) + vacancyRecords + (analyticsResult?.recordsProcessed || 0) + (tenantResult?.recordsProcessed || 0), // Preserve any completed records
        error_message: errorMessage
      })

      return {
        success: false,
        duration,
        totalRecords: 0,
        error: errorMessage
      }

    } finally {
      this.isSyncing = false
      this.currentSyncType = null
      this.currentProgress = ''
      
      // Clean up old raw data (keep only today + previous day)
      try {
        console.log('[DAILY_SYNC] Performing raw data cleanup...')
        const { cleanupRawAppfolioData } = await import('./raw-data-cleanup')
        const cleanupResult = await cleanupRawAppfolioData()
        if (cleanupResult.success) {
          console.log(`[DAILY_SYNC] ✅ Raw data cleanup: ${cleanupResult.recordsDeleted} old records removed`)
        } else {
          console.warn(`[DAILY_SYNC] ⚠️ Raw data cleanup failed: ${cleanupResult.error}`)
        }
      } catch (cleanupError) {
        console.warn('[DAILY_SYNC] Raw data cleanup warning (non-critical):', cleanupError)
      }
      
      // CRITICAL FIX: Only release lock if we actually acquired it (prevents releasing another process's lock)
      if (lockAcquired) {
        console.log('[DAILY_SYNC] 🔓 Releasing lock in finally block (guaranteed cleanup)')
        await this.releaseDistributedLock()
      }
    }
  }

  // OPTIMIZED SYNC: New streamlined sync method with delta processing
  // This is the new optimized sync logic - UNDER DEVELOPMENT
  private async performOptimizedSync(syncType: 'daily' | 'webhook' | 'manual' = 'daily'): Promise<{
    success: boolean
    duration: number
    totalRecords: number
    error?: string
  }> {
    console.log(`[${syncType.toUpperCase()}_SYNC] 🚀 OPTIMIZED SYNC: Starting optimized sync process...`)
    console.log(`[${syncType.toUpperCase()}_SYNC] ⚡ This is the new streamlined sync with delta processing`)
    
    if (this.isSyncing) {
      console.log(`[${syncType.toUpperCase()}_SYNC] Sync already in progress (in-memory check), skipping`)
      return { success: false, duration: 0, totalRecords: 0, error: 'Sync already in progress' }
    }

    // Check for and recover any stuck syncs before proceeding
    await this.checkAndRecoverStuckSyncs()

    // Track if we acquired lock to ensure cleanup in finally block
    let lockAcquired = false
    const startTime = Date.now()
    
    // Declare variables before try block for catch/finally access (CRITICAL FIX for zombie locks)
    let today: string | null = null
    let vacancyRecords = 0
    let tenantResult: any = null

    try {
      // CRITICAL FIX: Acquire lock INSIDE try block to ensure finally cleanup
      lockAcquired = await this.acquireDistributedLock()
      if (!lockAcquired) {
        return { 
          success: false, 
          duration: 0, 
          totalRecords: 0, 
          error: 'Another process is currently performing sync operation' 
        }
      }

      this.isSyncing = true
      this.setSyncType(syncType)
      
      // EASTERN TIMEZONE NORMALIZATION: Always use Eastern time for all sync operations
      const { EasternTimeManager } = await import('./timezone-utils')
      today = EasternTimeManager.getCurrentEasternDate()
      EasternTimeManager.logSyncOperation(`Starting ${syncType} optimized sync`, { syncType, today })

      console.log(`[${syncType.toUpperCase()}_SYNC] 🎯 Starting OPTIMIZED ${syncType} sync with delta processing...`)
      await this.setProgress('Starting optimized sync...', 1, 5) // Optimized sync with email

      // Update sync status immediately at start to show today's date
      await this.updateSyncStatus({
        last_sync_date: today,
        last_sync_success: false, // Will be updated to true on completion
        last_sync_duration_ms: 0,
        total_records: 0,
        error_message: null
      })
      // Check credentials
      const clientId = process.env.APPFOLIO_CLIENT_ID
      const clientSecret = process.env.APPFOLIO_CLIENT_SECRET
      const tenantDomain = process.env.APPFOLIO_TENANT_DOMAIN || 'cynthiagardens.appfolio.com'
      
      if (!clientId || !clientSecret) {
        throw new Error('AppFolio credentials not configured')
      }

      console.log(`[${syncType.toUpperCase()}_SYNC] 🚀 Step 1: Optimized delta ingestion from AppFolio...`)
      await this.setProgress('Delta ingestion from AppFolio (optimized)...', 1, 5, 0)
      
      // Use the new optimized ingestor with delta processing
      const { OptimizedAppFolioIngestor } = await import('./appfolio-ingestor-optimized')
      const optimizedIngestor = new OptimizedAppFolioIngestor({
        clientId,
        clientSecret,
        tenantDomain,
        concurrency: 3, // Process 3 reports in parallel
        globalRpsLimit: 1.5, // 1.5 requests per second
        enableDeltaIngestion: true
      })

      const ingestionResult = await optimizedIngestor.ingestAllReports()
      
      if (!ingestionResult.success) {
        throw new Error(`Optimized ingestion failed: ${ingestionResult.error}`)
      }

      console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Delta ingestion completed:`)
      console.log(`  • Records ingested: ${ingestionResult.totalRecords}`)
      console.log(`  • API calls saved: ${ingestionResult.metrics.reduce((sum, m) => sum + m.apiCallsReduced, 0)}`)
      console.log(`  • Delta records skipped: ${ingestionResult.metrics.reduce((sum, m) => sum + m.deltaRecordsSkipped, 0)}`)
      console.log(`  • Avg throughput: ${Math.round(ingestionResult.metrics.reduce((sum, m) => sum + m.throughputRowsPerSec, 0) / ingestionResult.metrics.length)} rows/sec`)
      
      // Step 1.5: Master CSV Sync - fetch from Google Sheets and save CSV file
      // CRITICAL: This must succeed for email attachment consistency (fatal error)
      console.log(`[${syncType.toUpperCase()}_SYNC] 📊 Step 1.5: Master CSV sync from Google Sheets...`)
      await this.setProgress('Syncing master CSV from Google Sheets...', 1, 5, ingestionResult.totalRecords)
      
      const { MasterCSVSync } = await import('./master-csv-sync')
      const csvSyncResult = await MasterCSVSync.syncMasterCSV()
      
      if (!csvSyncResult.success) {
        throw new Error(`Master CSV sync failed: ${csvSyncResult.error}. Cannot mark sync as successful without fresh CSV file.`)
      }
      
      const csvFilePath = csvSyncResult.csvFilePath
      const csvSyncRecords = csvSyncResult.recordsProcessed
      console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Master CSV synced: ${csvSyncRecords} records, file: ${csvFilePath}`)
      
      // Step 1.6: Google Sheets Vacancy Sync - fetch and store vacancy tracking data
      // CRITICAL: This must succeed for accurate KPI calculations (fatal error)
      console.log(`[${syncType.toUpperCase()}_SYNC] 📊 Step 1.6: Vacancy data sync from Google Sheets...`)
      await this.setProgress('Syncing vacancy data from Google Sheets...', 1, 5, ingestionResult.totalRecords + csvSyncRecords)
      
      const { GoogleSheetsVacancySync } = await import('./google-sheets-vacancy-sync')
      const vacancySync = new GoogleSheetsVacancySync()
      vacancyRecords = await vacancySync.syncVacancyData()
      console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Vacancy data synced: ${vacancyRecords} records`)
      
      console.log(`[${syncType.toUpperCase()}_SYNC] 🔄 Step 2: Incremental analytics processing...`)
      await this.setProgress('Incremental analytics processing...', 2, 5, ingestionResult.totalRecords + csvSyncRecords + vacancyRecords)
      
      // Build analytics - CRITICAL: This must succeed for data consistency
      // IMPORTANT: Use occupancy-analytics (Prisma/Postgres), NOT analytics-builder (SQLite)
      const { buildUnitsLeasingMaster } = await import('./occupancy-analytics')
      const analyticsResult = await buildUnitsLeasingMaster(today, async (progressMessage) => {
        await this.setProgress(progressMessage, 2, 5)
      })
      
      if (!analyticsResult.success) {
        throw new Error(`Analytics build failed: ${analyticsResult.error || 'Unknown error'}. Cannot mark sync as successful with stale analytics data.`)
      }
      
      console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Analytics build completed: ${analyticsResult.recordsProcessed} records processed`)
      
      console.log(`[${syncType.toUpperCase()}_SYNC] 🔄 Step 3: Set-based KPI calculation...`)
      await this.setProgress('Set-based KPI calculation...', 3, 5, analyticsResult.recordsProcessed)
      
      // Calculate and persist KPIs using the optimized data
      await this.calculateAndPersistOccupancyKPIs(today)
      console.log(`[${syncType.toUpperCase()}_SYNC] ✅ KPI calculation completed`)
      
      // Step 3.6: Build tenant analytics mart (PostgreSQL-backed, non-fatal)
      console.log(`[${syncType.toUpperCase()}_SYNC] 🔄 Step 3.6: Building tenant analytics mart...`)
      await this.setProgress('Building tenant analytics mart...', 3, 5, analyticsResult.recordsProcessed)
      try {
        // Use PostgreSQL-backed tenant-etl instead of SQLite analytics-builder
        const { buildTenantMart } = await import('./tenant-etl')
        tenantResult = await buildTenantMart(today)
        
        if (!tenantResult.success) {
          console.warn(`[${syncType.toUpperCase()}_SYNC] ⚠️ Tenant mart build failed: ${tenantResult.error}`)
        } else {
          console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Tenant mart built: ${tenantResult.recordsProcessed} records in ${tenantResult.duration}ms`)
        }
      } catch (tenantError) {
        console.error(`[${syncType.toUpperCase()}_SYNC] ⚠️ Tenant mart build error:`, tenantError)
        tenantResult = { success: false, recordsProcessed: 0, duration: 0, error: tenantError instanceof Error ? tenantError.message : 'Unknown error' }
      }
      
      // Step 3.7: Send email notification with current analytics data
      console.log(`[${syncType.toUpperCase()}_SYNC] Step 3.7: Sending daily email notification...`)
      await this.setProgress('Sending daily email notification...', 4, 5, analyticsResult.recordsProcessed)
      let optimizedEmailSent = false
      try {
        // Use the CSV file path from Master CSV sync (if available)
        const csvPath = csvFilePath || `data/master-${today}.csv`
        
        // Calculate current metrics for email (map camelCase to snake_case)
        const { UnifiedAnalytics } = await import('./unified-analytics')
        const analytics = await UnifiedAnalytics.getAnalyticsMetrics()
        const metrics = {
          snapshot_date: analytics.snapshotDate,
          total_units: analytics.totalUnits,
          occupied_units: analytics.occupiedUnits,
          vacant_units: analytics.vacantUnits,
          actual_mrr: analytics.actualMRR,
          market_potential: analytics.marketPotential,
          vacancy_loss: analytics.vacancyLoss
        }
        
        console.log(`[OPTIMIZED_SYNC][STEP 3.5] Email notification attempt with metrics:`, metrics)
        console.log(`[OPTIMIZED_SYNC][STEP 3.5] CSV path: ${csvPath}, exists: ${require('fs').existsSync(csvPath)}`)
        
        const { emailService } = await import('./email-service')
        optimizedEmailSent = await emailService.sendMasterCSVUpdateWithFallback(csvPath, metrics)
        if (optimizedEmailSent) {
          console.log(`[${syncType.toUpperCase()}_SYNC][STEP 3.5] ✅ Email notification sent successfully`)
        } else {
          console.log(`[${syncType.toUpperCase()}_SYNC][STEP 3.5] ❌ Email notification failed`)
        }
      } catch (emailError) {
        console.error(`[${syncType.toUpperCase()}_SYNC] ⚠️ Email notification failed:`, emailError)
        // Don't fail the sync for email errors - continue processing
      }
      
      // Step 4: RentIQ calculation and email (non-fatal)
      console.log(`[${syncType.toUpperCase()}_SYNC] 🔄 Step 4: Running RentIQ calculations...`)
      await this.setProgress('Calculating RentIQ pricing...', 4, 5, analyticsResult.recordsProcessed)
      await this.performRentIQCalculation()
      
      console.log(`[${syncType.toUpperCase()}_SYNC] 🔄 Step 5: Final validation and cleanup...`)
      await this.setProgress('Final validation and cleanup...', 5, 5)
      
      // Perform stability maintenance
      await this.performStabilityMaintenance()
      
      // Step 5.5: Parity validation (Phase 1 monitoring) - optimized sync always includes this
      console.log(`[${syncType.toUpperCase()}_SYNC] 🔍 Step 5.5: Running parity validation for Phase 1 monitoring...`)
      await this.setProgress('Running parity validation...', 5, 5)
      try {
        const { ParityMonitor } = await import('./parity-monitor')
        const parityResult = await ParityMonitor.runParityValidation()
        
        if (parityResult.passedThreshold) {
          console.log(`[${syncType.toUpperCase()}_SYNC] ✅ Parity validation passed: ${Math.max(...Object.values(parityResult.variance.kpis)).toFixed(3)}% max variance`)
        } else {
          console.warn(`[${syncType.toUpperCase()}_SYNC] ⚠️ Parity validation failed threshold: ${Math.max(...Object.values(parityResult.variance.kpis)).toFixed(3)}% variance`)
        }
        
        // Log performance improvement
        const performanceImprovement = parityResult.legacyResult.duration / Math.max(parityResult.optimizedResult.duration, 1)
        console.log(`[${syncType.toUpperCase()}_SYNC] 📊 Performance improvement: ${performanceImprovement.toFixed(1)}x faster than legacy`)
        
      } catch (parityError) {
        console.error(`[${syncType.toUpperCase()}_SYNC] ⚠️ Parity validation failed, but sync continues:`, parityError)
        // Don't fail the entire sync for parity validation errors - this is monitoring only
      }

      const duration = Date.now() - startTime
      const totalRecords = ingestionResult.totalRecords + csvSyncRecords + vacancyRecords + (analyticsResult?.recordsProcessed || 0) + (tenantResult?.recordsProcessed || 0)
      
      console.log(`[${syncType.toUpperCase()}_SYNC] ⚡ OPTIMIZED SYNC COMPLETED in ${Math.round(duration / 1000)}s`)
      console.log(`[${syncType.toUpperCase()}_SYNC] 🎯 Performance metrics:`)
      console.log(`  • Total duration: ${Math.round(duration / 1000)}s (target: <45min)`)
      console.log(`  • Records processed: ${totalRecords}`)
      console.log(`  • Throughput: ${Math.round(totalRecords / (duration / 1000))} rows/sec`)
      
      // Update sync status with success
      await this.updateSyncStatus({
        last_sync_date: today,
        last_sync_success: true,
        last_sync_duration_ms: duration,
        total_records: totalRecords,
        error_message: null
      })

      return {
        success: true,
        duration,
        totalRecords,
        error: undefined
      }
      
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      console.error(`[${syncType.toUpperCase()}_SYNC] ❌ OPTIMIZED SYNC FAILED:`, errorMessage)
      console.log(`[${syncType.toUpperCase()}_SYNC] 🔄 Falling back to legacy sync...`)
      
      // Send failure notification for optimized sync failure
      try {
        await failureNotificationManager.reportFailure({
          type: 'sync_failure',
          title: `Optimized ${syncType.charAt(0).toUpperCase() + syncType.slice(1)} Sync Failed - Falling Back to Legacy`,
          description: `The optimized sync method failed and the system has automatically fallen back to the legacy sync method to ensure continuity.`,
          error,
          context: {
            syncType: `optimized_${syncType}`,
            fallbackTriggered: true,
            duration: Math.round(duration / 1000 / 60), // minutes
            step: this.currentProgress || 'unknown'
          },
          recoveryActions: [
            'Automatically falling back to legacy sync',
            'Optimized sync will be retried on next sync',
            'No data loss expected'
          ]
        })
      } catch (notificationError) {
        console.error('[DAILY_SYNC] Failed to send optimized sync failure notification:', notificationError)
      }
      
      // CRITICAL FIX: Don't manually release lock here - finally block will handle it
      // Clean up flags before fallback
      this.isSyncing = false
      this.currentSyncType = null
      this.currentProgress = ''
      
      // Release lock before fallback (since finally won't run after return)
      if (lockAcquired) {
        console.log('[DAILY_SYNC] 🔓 Releasing lock before legacy fallback')
        await this.releaseDistributedLock()
        lockAcquired = false // Prevent double release in finally
      }
      
      return this.performLegacySync(syncType)
      
    } finally {
      this.isSyncing = false
      this.currentSyncType = null
      this.currentProgress = ''
      
      // CRITICAL FIX: Only release lock if we actually acquired it (prevents releasing another process's lock)
      if (lockAcquired) {
        console.log('[DAILY_SYNC] 🔓 Releasing lock in finally block (guaranteed cleanup)')
        await this.releaseDistributedLock()
      }
    }
  }

  // Legacy method for backward compatibility
  public async performDailySync(): Promise<{
    success: boolean
    duration: number
    totalRecords: number
    error?: string
  }> {
    return this.performSync('daily')
  }

  // Force a manual sync (for admin use)
  public async forceDailySync(): Promise<{
    success: boolean
    duration: number
    totalRecords: number
    error?: string
  }> {
    console.log('[MANUAL_SYNC] Manual sync triggered')
    return this.performSync('manual')
  }

  // Stop current sync (for admin use)
  public async stopCurrentSync(): Promise<{
    success: boolean
    message: string
  }> {
    try {
      console.log('[STOP_SYNC] Admin-requested sync stop initiated')
      
      // Check if sync is actually running
      const isRunning = await this.isSyncInProgress()
      if (!isRunning) {
        return {
          success: false,
          message: 'No sync is currently in progress'
        }
      }

      // CRITICAL FIX: Set cancel_requested flag for cooperative cancellation
      const lockId = 'daily_sync_lock'
      console.log('[STOP_SYNC] Setting cancel_requested flag for cooperative cancellation...')
      
      await prisma.$executeRaw`
        UPDATE sync_locks 
        SET cancel_requested = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${lockId}
      `
      
      console.log('[STOP_SYNC] ✅ Cancellation request sent - sync will stop gracefully within 30 seconds')
      
      // NOTE: Don't immediately release lock or reset state - let cooperative cancellation handle it
      // This allows the sync process to clean up properly and prevents the broken stop behavior
      
      return {
        success: true,
        message: 'Sync cancellation requested - will stop gracefully within 30 seconds'
      }
    } catch (error) {
      console.error('[STOP_SYNC] Error stopping sync:', error)
      return {
        success: false,
        message: `Failed to stop sync: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  // ARCHITECTURE FIX: PostgreSQL doesn't need WAL checkpoints like SQLite
  private performWALCheckpoint(): void {
    // PostgreSQL handles WAL automatically - no manual checkpoint needed
    console.log('[DAILY_SYNC] PostgreSQL WAL management handled automatically')
  }

  // Perform stability maintenance during sync
  private async performStabilityMaintenance(): Promise<void> {
    try {
      console.log('[DAILY_SYNC] Running stability checks...')
      const { StabilityManager } = await import('./stability-manager')
      const stabilityManager = StabilityManager.getInstance()
      
      // Health check
      const healthReport = await stabilityManager.performHealthCheck()
      console.log(`[DAILY_SYNC] System health: ${healthReport.overall_status}`)
      
      if (healthReport.overall_status !== 'stable') {
        console.log(`[DAILY_SYNC] Issues detected: ${healthReport.issues.join(', ')}`)
        
        // Auto-repair
        const repairResult = await stabilityManager.performAutoRepair()
        console.log(`[DAILY_SYNC] Auto-repair completed: ${repairResult.repairs.length} repairs, ${repairResult.errors.length} errors`)
        
        if (repairResult.errors.length > 0) {
          console.warn(`[DAILY_SYNC] Repair errors: ${repairResult.errors.join(', ')}`)
        }
      } else {
        console.log('[DAILY_SYNC] ✅ System is stable')
      }
      
    } catch (error) {
      console.warn('[DAILY_SYNC] Stability maintenance warning (non-critical):', error)
      // Non-critical error - don't fail the sync
    }
  }

  // Perform RentIQ calculation during sync
  private async performRentIQCalculation(): Promise<void> {
    try {
      console.log('[DAILY_SYNC] Running RentIQ calculations...')
      
      // Check if RentIQ feature is enabled
      const { PrismaClient } = await import('@prisma/client')
      // Use shared prisma instance
      const rentiqFeature = await prisma.feature.findUnique({
        where: { key: 'rentiq' }
      })
      const isRentIQEnabled = rentiqFeature?.enabled || false
      // Using shared prisma - no disconnect needed
      
      if (!isRentIQEnabled) {
        console.log('[DAILY_SYNC] ✅ RentIQ feature disabled, skipping calculation')
        return
      }
      
      const { rentiqAdvancedAnalytics } = await import('./rentiq-analytics-advanced')
      
      // EASTERN TIMEZONE NORMALIZATION: RentIQ calculations always use Eastern time
      const { EasternTimeManager } = await import('./timezone-utils')
      const currentDate = EasternTimeManager.getCurrentEasternDate()
      EasternTimeManager.logSyncOperation('RentIQ calculation', { date: currentDate })
      const results = await rentiqAdvancedAnalytics.calculateRentIQ(currentDate)
      
      console.log(`[DAILY_SYNC] ✅ RentIQ calculated: ${results.rentiq_pool_count} units in pool, active: ${results.rentiq_active}`)
      
      // Send daily RentIQ email if we have suggestions
      if (results.rentiq_units && results.rentiq_units.length > 0) {
        console.log(`[DAILY_SYNC] Sending daily RentIQ email for ${results.rentiq_units.length} units...`)
        await this.sendDailyRentIQEmail(results)
        console.log('[DAILY_SYNC] ✅ Daily RentIQ email sent')
        
        // Update Google Sheets with RentIQ data
        try {
          console.log('[DAILY_SYNC] Updating Google Sheets with RentIQ data...')
          const { RentIQSheetsSync } = await import('./rentiq-sheets-sync')
          await RentIQSheetsSync.updateRentIQSheet(results)
          console.log('[DAILY_SYNC] ✅ Google Sheets updated with RentIQ data')
        } catch (sheetsError) {
          console.warn('[DAILY_SYNC] Warning: Failed to update Google Sheets (non-critical):', sheetsError)
          // Don't fail the sync if sheets update fails
        }
      } else {
        console.log('[DAILY_SYNC] ✅ No RentIQ suggestions to email')
      }
      
    } catch (error) {
      console.warn('[DAILY_SYNC] RentIQ calculation warning (non-critical):', error)
      // Non-critical error - don't fail the sync
    }
  }

  private async sendDailyRentIQEmail(rentiqData: any): Promise<void> {
    try {
      const brevo = require('@getbrevo/brevo')
      
      // Generate CSV content
      const headers = ['Unit', 'Market Rent', 'Suggested Rent', 'Days Vacant', 'Category', 'Min Threshold', 'Cap Applied', 'Pricing Tier']
      const csvContent = [
        headers.join(','),
        ...rentiqData.rentiq_units.map((unit: any) => [
          unit.unit,
          unit.market_rent || 0,
          unit.suggested_new_rent,
          unit.days_vacant,
          unit.assigned_category,
          unit.minimum_threshold,
          unit.cap_applied ? 'Yes' : 'No',
          unit.pricing_tier
        ].join(','))
      ].join('\n')

      // Convert CSV to base64 for email attachment
      const csvBase64 = Buffer.from(csvContent).toString('base64')
      
      // Setup Brevo API
      const apiInstance = new brevo.TransactionalEmailsApi()
      apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY)

      // EASTERN TIMEZONE NORMALIZATION: Email dates always use Eastern time
      const { EasternTimeManager } = await import('./timezone-utils')
      const todaysDate = EasternTimeManager.formatEasternDateForDisplay()

      const emailData = {
        sender: { email: 'noreply@gardencommand.com', name: 'Garden Command Center' },
        to: [{ email: 'leasing@cynthiagardens.com', name: 'Leasing Team' }],
        subject: `Daily RentIQ Suggestions for ${todaysDate}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5; margin-bottom: 20px;">🏢 Daily RentIQ Pricing Suggestions</h2>
            
            <p style="margin-bottom: 15px;">Dear Leasing Team,</p>
            
            <p style="margin-bottom: 15px;">Your daily RentIQ pricing suggestions for <strong>${todaysDate}</strong> are ready!</p>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h3 style="color: #374151; margin: 0 0 10px 0;">📊 Today's Summary:</h3>
              <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                <li><strong>${rentiqData.rentiq_units.length}</strong> units with pricing suggestions</li>
                <li>Current occupancy: <strong>${rentiqData.current_occupancy.toFixed(1)}%</strong></li>
                <li>Target: <strong>${rentiqData.target_occupancy}%</strong> occupancy</li>
                <li>Units needed: <strong>${rentiqData.units_needed_for_95}</strong> more units</li>
                <li>Average suggested rent: <strong>$${Math.round(rentiqData.rentiq_units.reduce((sum: number, unit: any) => sum + unit.suggested_new_rent, 0) / rentiqData.rentiq_units.length).toLocaleString()}</strong></li>
              </ul>
            </div>
            
            <p style="margin-bottom: 15px;">The attached CSV contains detailed pricing recommendations with category mapping and progressive discounting based on vacancy duration.</p>
            
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #065f46; font-weight: 600;">
                🎯 This email is automatically sent daily after data sync and RentIQ calculation.
              </p>
            </div>
            
            <p style="margin-bottom: 15px;">Best regards,<br>
            <strong>Garden Command Center</strong><br>
            <em>Daily Auto-Sync System</em></p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="font-size: 12px; color: #6b7280; margin: 0;">
              This email was automatically generated by the Garden Command Center daily sync process.
            </p>
          </div>
        `,
        attachment: [
          {
            content: csvBase64,
            name: `daily-rentiq-suggestions-${rentiqData.date}.csv`,
            type: 'text/csv'
          }
        ]
      }

      // Send email
      const emailResult = await apiInstance.sendTransacEmail(emailData)
      console.log(`[DAILY_SYNC] Daily RentIQ email sent successfully - Message ID: ${emailResult.messageId}`)
      
    } catch (error) {
      console.warn('[DAILY_SYNC] Failed to send daily RentIQ email (non-critical):', error)
      // Don't fail the sync for email issues
    }
  }

  /**
   * Calculate and persist occupancy KPIs for instant page loads
   * This replaces real-time calculations with pre-computed data
   */
  private async calculateAndPersistOccupancyKPIs(snapshotDate: string): Promise<void> {
    console.log(`[KPI_CALCULATION] Calculating occupancy KPIs for ${snapshotDate}...`)
    
    try {
      // Use existing analytics function to calculate KPIs
      const kpis = await getOccupancyKPIs(snapshotDate)
      
      if (!kpis) {
        throw new Error(`No KPI data available for ${snapshotDate}`)
      }

      // Convert to repository format
      const kpiData: OccupancyKPIData = {
        snapshotDate,
        scope: 'portfolio',
        totalUnits: kpis.total_units,
        occupiedUnits: kpis.occupied_units,
        vacantUnits: kpis.vacant_units,
        occupancyRatePct: kpis.occupancy_rate_pct || kpis.occupancy_all || 0,
        occupancyStudent: kpis.occupancy_student,
        occupancyNonStudent: kpis.occupancy_non_student,
        avgVacancyDays: kpis.avg_vacancy_days,
        moveInsMTD: kpis.move_ins_mtd || 0,
        moveOutsMTD: kpis.move_outs_mtd || 0,
        expirations30: kpis.expirations_30 || 0,
        expirations60: kpis.expirations_60 || 0,
        expirations90: kpis.expirations_90 || 0,
        calcVersion: 'v1'
      }

      // Upsert KPI data to database  
      const result = await upsertKPI(kpiData)
      
      console.log(`[KPI_CALCULATION] ✅ KPIs calculated and stored:`, {
        snapshotDate: result.snapshotDate,
        occupancyRate: `${result.occupancyRatePct}%`,
        totalUnits: result.totalUnits,
        occupiedUnits: result.occupiedUnits,
        computedAt: result.computedAt.toISOString()
      })
      
    } catch (error) {
      console.error(`[KPI_CALCULATION] Failed to calculate/persist KPIs:`, error)
      throw error // Re-throw to be handled by caller
    }
  }

  // ROOT CAUSE FIX: Materialize analytics_master table from same CSV source as dashboard
  private async materializeAnalyticsMasterFromCSV(snapshotDate: string): Promise<{
    success: boolean
    recordsProcessed: number
    error?: string
  }> {
    console.log(`[ANALYTICS_MASTER] Materializing analytics_master from CSV for ${snapshotDate}`)
    
    // Import timezone manager for proper date handling
    const { EasternTimeManager } = await import('./timezone-utils')
    
    try {
      // Get CSV data using the same source as dashboard
      const csvData = await withPrismaRetry(() => 
        prisma.masterCsvData.findMany({
          orderBy: { unit: 'asc' }
        })
      )
      
      if (csvData.length === 0) {
        return {
          success: false,
          recordsProcessed: 0,
          error: 'No CSV data available for materialization'
        }
      }
      
      console.log(`[ANALYTICS_MASTER] Processing ${csvData.length} units from master CSV`)
      
      // Clear existing data for this snapshot date
      await withPrismaRetry(() => 
        prisma.analyticsMaster.deleteMany({
          where: { snapshotDate: EasternTimeManager.createEasternDate(snapshotDate) }
        })
      )
      
      // Transform CSV data to analytics_master format
      const analyticsRecords = csvData.map((row, index) => {
        // Determine occupancy status using same logic as dashboard
        const isOccupied = row.tenantStatus?.toLowerCase() === 'current' || 
                          row.tenantStatus?.toLowerCase() === 'notice'
        
        // Parse financial values safely
        const marketRent = typeof row.marketRent === 'number' ? row.marketRent : 
                          parseFloat(String(row.marketRent || '0').replace(/[$,]/g, '')) || 0
        const monthlyRent = typeof row.monthlyRent === 'number' ? row.monthlyRent :
                           parseFloat(String(row.monthlyRent || '0').replace(/[$,]/g, '')) || 0
        const mrr = isOccupied ? monthlyRent : 0
        const vacancyLoss = isOccupied ? 0 : marketRent
        
        return {
          snapshotDate: EasternTimeManager.createEasternDate(snapshotDate),
          propertyId: 'CG001', // Standard property ID
          unitCode: row.unit || '',
          bedspaceCode: row.unit || '', // Use unit as fallback
          tenantId: row.fullName || null,
          leaseId: null, // Not available in CSV
          isOccupied: isOccupied,
          studentFlag: false, // Default, can be enhanced later
          primaryTenantFlag: true, // Default, can be enhanced later
          marketRent: Math.round(marketRent),
          mrr: Math.round(mrr),
          moveIn: row.moveInDate ? new Date(row.moveInDate) : null,
          moveOut: null, // Not available in CSV
          leaseStart: row.leaseStartDate ? new Date(row.leaseStartDate) : null,
          leaseEnd: row.leaseEndDate ? new Date(row.leaseEndDate) : null,
          daysVacant: row.daysVacant || 0,
          vacancyLoss: Math.round(vacancyLoss),
          updatedAt: new Date()
        }
      })
      
      // Batch insert the records
      const batchSize = 100
      let recordsProcessed = 0
      
      for (let i = 0; i < analyticsRecords.length; i += batchSize) {
        const batch = analyticsRecords.slice(i, i + batchSize)
        await withPrismaRetry(() => 
          prisma.analyticsMaster.createMany({
            data: batch,
            skipDuplicates: true
          })
        )
        recordsProcessed += batch.length
        
        // Log progress
        if (recordsProcessed % 100 === 0 || recordsProcessed === analyticsRecords.length) {
          console.log(`[ANALYTICS_MASTER] Progress: ${recordsProcessed}/${analyticsRecords.length} records processed`)
        }
      }
      
      // Validate the result
      const finalCount = await withPrismaRetry(() => 
        prisma.analyticsMaster.count({
          where: { snapshotDate: EasternTimeManager.createEasternDate(snapshotDate) }
        })
      )
      
      if (finalCount === 0) {
        return {
          success: false,
          recordsProcessed: 0,
          error: 'No records were inserted into analytics_master'
        }
      }
      
      console.log(`[ANALYTICS_MASTER] ✅ Successfully materialized ${finalCount} records for ${snapshotDate}`)
      
      return {
        success: true,
        recordsProcessed: finalCount
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[ANALYTICS_MASTER] ❌ Failed to materialize analytics_master:`, error)
      return {
        success: false,
        recordsProcessed: 0,
        error: errorMessage
      }
    }
  }
}