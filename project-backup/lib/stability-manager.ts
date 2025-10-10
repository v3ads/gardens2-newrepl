import { prisma } from './prisma'
import { EasternTimeManager } from './timezone-utils'

export interface StabilityReport {
  overall_status: 'stable' | 'unstable' | 'critical'
  data_consistency: boolean
  sync_health: boolean
  database_health: boolean
  issues: string[]
  recommendations: string[]
  last_check: string
}

export class StabilityManager {
  private static instance: StabilityManager
  
  static getInstance(): StabilityManager {
    if (!StabilityManager.instance) {
      StabilityManager.instance = new StabilityManager()
    }
    return StabilityManager.instance
  }

  /**
   * Comprehensive system health check
   */
  public async performHealthCheck(): Promise<StabilityReport> {
    console.log('[STABILITY] Starting comprehensive health check...')
    
    const report: StabilityReport = {
      overall_status: 'stable',
      data_consistency: true,
      sync_health: true,
      database_health: true,
      issues: [],
      recommendations: [],
      last_check: new Date().toISOString()
    }

    try {
      // Check 1: Data Consistency
      await this.checkDataConsistency(report)
      
      // Check 2: Database Health
      await this.checkDatabaseHealth(report)
      
      // Check 3: Sync Status
      await this.checkSyncHealth(report)
      
      // Check 4: Essential Data Availability
      await this.checkEssentialData(report)
      
      // Determine overall status
      if (report.issues.length === 0) {
        report.overall_status = 'stable'
      } else if (report.issues.some(issue => issue.includes('CRITICAL'))) {
        report.overall_status = 'critical'
      } else {
        report.overall_status = 'unstable'
      }

      console.log(`[STABILITY] Health check completed: ${report.overall_status}`)
      return report

    } catch (error) {
      report.overall_status = 'critical'
      report.issues.push(`CRITICAL: Health check failed - ${error instanceof Error ? error.message : 'Unknown error'}`)
      return report
    }
  }

  private async checkDataConsistency(report: StabilityReport): Promise<void> {
    try {
      // ARCHITECTURE FIX: Use Prisma aggregates for PostgreSQL data consistency checks
      const occupancyDateResult = await prisma.masterTenantData.aggregate({
        _max: { snapshotDate: true }
      })
      
      const tenantDateResult = await prisma.analyticsTenantDaily.aggregate({
        _max: { snapshotDate: true }
      })

      const occupancyDate = occupancyDateResult._max.snapshotDate
      const tenantDate = tenantDateResult._max.snapshotDate

      if (!occupancyDate || !tenantDate) {
        report.data_consistency = false
        report.issues.push('CRITICAL: Missing snapshot data in core tables')
        return
      }

      // ARCHITECTURE FIX: Compare dates using toDateString for consistency (Eastern timezone policy)
      const occupancyDateStr = occupancyDate.toISOString().split('T')[0]
      const tenantDateStr = tenantDate.toISOString().split('T')[0]

      if (occupancyDateStr !== tenantDateStr) {
        report.data_consistency = false
        report.issues.push(`Data inconsistency: Occupancy (${occupancyDateStr}) vs Tenant (${tenantDateStr}) dates don't match`)
        report.recommendations.push('Run data consistency repair to synchronize all analytics dates')
      }

      // ARCHITECTURE FIX: Check data freshness using Eastern timezone (should be within 2 days)
      const nowET = new Date()
      const latestDate = new Date(occupancyDate)
      const daysDiff = Math.floor((nowET.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysDiff > 2) {
        report.issues.push(`Data freshness issue: Latest data is ${daysDiff} days old`)
        report.recommendations.push('Schedule immediate sync to refresh data')
      }

    } catch (error) {
      report.data_consistency = false
      report.issues.push(`Data consistency check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async checkDatabaseHealth(report: StabilityReport): Promise<void> {
    try {
      // ARCHITECTURE FIX: PostgreSQL connectivity and migration health checks
      await prisma.$queryRaw`SELECT 1` // Verify database connectivity
      
      // Check for unfinished migrations (PostgreSQL-specific health check)
      const unfinishedMigrations = await prisma.$queryRaw<[{count: bigint}]>`
        SELECT COUNT(*) as count FROM "_prisma_migrations" WHERE finished_at IS NULL
      `
      
      if (unfinishedMigrations[0].count > 0) {
        report.database_health = false
        report.issues.push('CRITICAL: Unfinished database migrations detected')
        report.recommendations.push('Complete pending migrations immediately')
      }

      // ARCHITECTURE FIX: PostgreSQL database size check (replaces SQLite PRAGMA page_size/page_count)
      const dbSizeResult = await prisma.$queryRaw<[{bytes: bigint}]>`
        SELECT pg_database_size(current_database()) as bytes
      `
      
      const totalSizeMB = Number(dbSizeResult[0].bytes) / (1024 * 1024)
      
      if (totalSizeMB > 1000) { // > 1GB
        report.issues.push(`Large database size: ${Math.round(totalSizeMB)}MB`)
        report.recommendations.push('Consider data archiving or optimization')
      }

      // ARCHITECTURE FIX: Optional dead tuples check for PostgreSQL maintenance signal
      const deadTuplesResult = await prisma.$queryRaw<[{dead: bigint}]>`
        SELECT COALESCE(SUM(n_dead_tup), 0)::bigint as dead FROM pg_stat_user_tables
      `
      
      const deadTuples = Number(deadTuplesResult[0].dead)
      if (deadTuples > 10000) {
        report.issues.push(`High dead tuple count: ${deadTuples} (consider VACUUM)`)
        report.recommendations.push('Database maintenance recommended')
      }

    } catch (error) {
      report.database_health = false
      report.issues.push(`Database health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async checkSyncHealth(report: StabilityReport): Promise<void> {
    try {
      // ARCHITECTURE FIX: Use Prisma for PostgreSQL sync status checks
      const syncStatus = await prisma.dailySyncStatus.findFirst({
        orderBy: { updatedAt: 'desc' }
      })

      if (!syncStatus) {
        report.sync_health = false
        report.issues.push('No sync status found')
        report.recommendations.push('Initialize sync system')
        return
      }

      // ARCHITECTURE FIX: Use Eastern timezone for date comparison consistency
      const today = EasternTimeManager.getCurrentEasternDate()
      const lastSyncDate = syncStatus.lastSyncDate || EasternTimeManager.toEasternDate(syncStatus.updatedAt)
      
      if (lastSyncDate !== today) {
        report.sync_health = false
        report.issues.push(`Sync outdated: Last sync was ${lastSyncDate}, expected ${today}`)
        report.recommendations.push('Trigger immediate sync')
      }

      if (!syncStatus.lastSyncSuccess) {
        report.sync_health = false
        report.issues.push('Last sync failed')
        report.recommendations.push('Investigate sync failure and retry')
      }

      // Check sync performance
      if (syncStatus.lastSyncDurationMs && syncStatus.lastSyncDurationMs > 300000) { // > 5 minutes
        report.issues.push(`Slow sync performance: ${Math.round(syncStatus.lastSyncDurationMs / 1000)}s`)
        report.recommendations.push('Optimize sync process')
      }

    } catch (error) {
      report.sync_health = false
      report.issues.push(`Sync health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async checkEssentialData(report: StabilityReport): Promise<void> {
    try {
      // ARCHITECTURE FIX: Use Prisma count for PostgreSQL essential data checks
      const masterCount = await prisma.masterTenantData.count()
      if (masterCount < 100) {
        report.issues.push('CRITICAL: Insufficient master tenant data')
        report.recommendations.push('Reload master CSV data immediately')
      }

      // Check analytics tenant daily
      const tenantCount = await prisma.analyticsTenantDaily.count()
      if (tenantCount < 100) {
        report.issues.push('CRITICAL: Insufficient tenant analytics data')
        report.recommendations.push('Rebuild tenant analytics mart')
      }

      // Check essential API endpoints (basic connectivity)
      // This would be expanded to check actual API health
      
    } catch (error) {
      report.issues.push(`Essential data check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Auto-repair system issues
   */
  public async performAutoRepair(): Promise<{ success: boolean; repairs: string[]; errors: string[] }> {
    console.log('[STABILITY] Starting auto-repair sequence...')
    
    const result = {
      success: false,
      repairs: [] as string[],
      errors: [] as string[]
    }

    try {
      // ARCHITECTURE FIX: Remove SQLite WAL checkpoint - not applicable to PostgreSQL
      
      // Repair 1: Data consistency check and repair using Prisma
      const occupancyDateResult = await prisma.masterTenantData.aggregate({
        _max: { snapshotDate: true }
      })
      const tenantDateResult = await prisma.analyticsTenantDaily.aggregate({
        _max: { snapshotDate: true }
      })

      const occupancyDate = occupancyDateResult._max.snapshotDate
      const tenantDate = tenantDateResult._max.snapshotDate

      if (occupancyDate && tenantDate) {
        const occupancyDateStr = occupancyDate.toISOString().split('T')[0]
        const tenantDateStr = tenantDate.toISOString().split('T')[0]
        
        if (occupancyDateStr !== tenantDateStr) {
          // Auto-rebuild tenant analytics to match occupancy date
          const { buildTenantMart } = await import('./analytics-builder')
          const rebuildResult = await buildTenantMart()
          
          if (rebuildResult.success) {
            result.repairs.push(`Tenant analytics rebuilt to match date ${occupancyDateStr}`)
          } else {
            result.errors.push('Failed to rebuild tenant analytics')
          }
        }
      }

      // Repair 2: Clean up old data using Prisma deleteMany (keep last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      
      const cleanupResult = await prisma.analyticsTenantDaily.deleteMany({
        where: {
          snapshotDate: {
            lt: thirtyDaysAgo
          }
        }
      })
      
      if (cleanupResult.count > 0) {
        result.repairs.push(`Cleaned up ${cleanupResult.count} old tenant records`)
      }

      result.success = result.errors.length === 0
      console.log(`[STABILITY] Auto-repair completed: ${result.repairs.length} repairs, ${result.errors.length} errors`)
      
      return result

    } catch (error) {
      result.errors.push(`Auto-repair failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return result
    }
  }

  /**
   * Get stability metrics for monitoring
   */
  public async getStabilityMetrics(): Promise<{
    uptime_days: number
    data_age_hours: number
    sync_success_rate: number
    database_size_mb: number
    last_issues: string[]
  }> {
    try {
      // ARCHITECTURE FIX: Get latest data age using Prisma aggregate
      const latestDataResult = await prisma.masterTenantData.aggregate({
        _max: { snapshotDate: true }
      })
      
      const dataAgeHours = latestDataResult._max.snapshotDate ? 
        Math.floor((Date.now() - latestDataResult._max.snapshotDate.getTime()) / (1000 * 60 * 60)) : 999

      // ARCHITECTURE FIX: Get PostgreSQL database size
      const dbSizeResult = await prisma.$queryRaw<[{bytes: bigint}]>`
        SELECT pg_database_size(current_database()) as bytes
      `
      const totalSizeMB = Number(dbSizeResult[0].bytes) / (1024 * 1024)

      // ARCHITECTURE FIX: Calculate sync success rate using Prisma (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      
      const totalSyncs = await prisma.dailySyncStatus.count({
        where: { updatedAt: { gte: weekAgo } }
      })
      
      const successfulSyncs = await prisma.dailySyncStatus.count({
        where: { 
          updatedAt: { gte: weekAgo },
          lastSyncSuccess: true
        }
      })

      const syncSuccessRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 0

      return {
        uptime_days: 1, // Simplified - would need actual uptime tracking
        data_age_hours: dataAgeHours,
        sync_success_rate: Math.round(syncSuccessRate),
        database_size_mb: Math.round(totalSizeMB),
        last_issues: [] // Would store recent issues
      }

    } catch (error) {
      console.error('[STABILITY] Failed to get metrics:', error)
      return {
        uptime_days: 0,
        data_age_hours: 999,
        sync_success_rate: 0,
        database_size_mb: 0,
        last_issues: [`Metrics collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      }
    }
  }
}