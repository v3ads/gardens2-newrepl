/**
 * Data Integrity Monitoring System
 * 
 * This module provides comprehensive data validation to prevent silent failures
 * and ensure analytics_master table has current, accurate data.
 * 
 * ROOT CAUSE PREVENTION: Detects when analytics_master becomes orphaned
 * from the daily sync pipeline, preventing expensive debugging cycles.
 */

import { prisma } from './prisma'

export interface DataIntegrityReport {
  success: boolean
  timestamp: string
  checks: {
    analyticsMasterExists: boolean
    hasCurrentDateData: boolean
    recordCountValid: boolean
    csvDataConsistency: boolean
    noSilentFailures: boolean
  }
  metrics: {
    analyticsMasterRecords: number
    masterCsvRecords: number
    latestAnalyticsDate: string | null
    latestCsvDate: string | null
    expectedRecordCount: number
    actualRecordCount: number
  }
  issues: string[]
  recommendations: string[]
}

/**
 * Comprehensive data integrity validation
 */
export async function validateDataIntegrity(targetDate?: string): Promise<DataIntegrityReport> {
  const timestamp = new Date().toISOString()
  const issues: string[] = []
  const recommendations: string[] = []
  
  // Use current Eastern date if not specified
  if (!targetDate) {
    const { EasternTimeManager } = await import('./timezone-utils')
    targetDate = EasternTimeManager.getCurrentEasternDate()
  }
  
  console.log(`[DATA_INTEGRITY] Starting validation for ${targetDate}`)
  
  try {
    // Check 1: analytics_master table exists and has data
    const analyticsMasterCount = await prisma.analyticsMaster.count()
    const analyticsMasterExists = analyticsMasterCount > 0
    
    if (!analyticsMasterExists) {
      issues.push('analytics_master table is empty')
      recommendations.push('Run daily sync to populate analytics_master')
    }
    
    // Check 2: analytics_master has current date data (timezone-safe comparison)
    const currentDateCount = await prisma.analyticsMaster.count({
      where: {
        snapshotDate: {
          gte: new Date(targetDate + 'T00:00:00.000Z'),
          lt: new Date(targetDate + 'T23:59:59.999Z')
        }
      }
    })
    const hasCurrentDateData = currentDateCount > 0
    
    if (!hasCurrentDateData) {
      issues.push(`analytics_master has no data for ${targetDate}`)
      recommendations.push('Run analytics_master materialization step')
    }
    
    // Check 3: Get latest dates for comparison
    const latestAnalytics = await prisma.analyticsMaster.aggregate({
      _max: { snapshotDate: true }
    })
    const latestCsv = await prisma.masterCsvData.aggregate({
      _max: { updatedAt: true }
    })
    
    const latestAnalyticsDate = latestAnalytics._max.snapshotDate?.toISOString().split('T')[0] || null
    const latestCsvDate = latestCsv._max.updatedAt?.toISOString().split('T')[0] || null
    
    // Check 4: Record count validation (accounting for data transformation)
    const masterCsvRecords = await prisma.masterCsvData.count()
    const expectedRecordCount = masterCsvRecords
    const actualRecordCount = currentDateCount
    
    // More lenient validation - analytics_master might filter/deduplicate data
    const recordCountValid = (expectedRecordCount > 0) && 
                            (actualRecordCount > 0) && 
                            (actualRecordCount >= Math.floor(expectedRecordCount * 0.8)) && // At least 80% of CSV records
                            (actualRecordCount <= expectedRecordCount * 1.1) // At most 110% (accounting for any duplication)
    
    if (!recordCountValid && expectedRecordCount > 0) {
      issues.push(`Record count mismatch: expected ~${expectedRecordCount}, got ${actualRecordCount}`)
      recommendations.push('Re-run analytics_master materialization')
    }
    
    // Check 5: CSV-Analytics consistency (detect silent failures)
    const csvDataConsistency = masterCsvRecords > 0 && 
                              latestCsvDate !== null && 
                              latestAnalyticsDate !== null
    
    if (!csvDataConsistency) {
      issues.push('CSV and analytics data inconsistency detected')
      recommendations.push('Verify data pipeline integrity')
    }
    
    // Check 6: No silent failures (data exists but processing failed)
    const noSilentFailures = !(masterCsvRecords > 0 && currentDateCount === 0)
    
    if (!noSilentFailures) {
      issues.push(`SILENT FAILURE DETECTED: CSV has ${masterCsvRecords} records but analytics_master has 0 for ${targetDate}`)
      recommendations.push('CRITICAL: Re-run analytics_master materialization immediately')
    }
    
    // Overall success determination
    const allChecks = [
      analyticsMasterExists,
      hasCurrentDateData,
      recordCountValid,
      csvDataConsistency,
      noSilentFailures
    ]
    const success = allChecks.every(check => check)
    
    const report: DataIntegrityReport = {
      success,
      timestamp,
      checks: {
        analyticsMasterExists,
        hasCurrentDateData,
        recordCountValid,
        csvDataConsistency,
        noSilentFailures
      },
      metrics: {
        analyticsMasterRecords: analyticsMasterCount,
        masterCsvRecords,
        latestAnalyticsDate,
        latestCsvDate,
        expectedRecordCount,
        actualRecordCount
      },
      issues,
      recommendations
    }
    
    if (success) {
      console.log(`[DATA_INTEGRITY] ✅ All checks passed for ${targetDate}`)
    } else {
      console.warn(`[DATA_INTEGRITY] ❌ ${issues.length} issues found for ${targetDate}:`, issues)
    }
    
    return report
    
  } catch (error) {
    console.error('[DATA_INTEGRITY] Validation failed:', error)
    return {
      success: false,
      timestamp,
      checks: {
        analyticsMasterExists: false,
        hasCurrentDateData: false,
        recordCountValid: false,
        csvDataConsistency: false,
        noSilentFailures: false
      },
      metrics: {
        analyticsMasterRecords: 0,
        masterCsvRecords: 0,
        latestAnalyticsDate: null,
        latestCsvDate: null,
        expectedRecordCount: 0,
        actualRecordCount: 0
      },
      issues: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
      recommendations: ['Fix validation system and retry']
    }
  }
}

/**
 * Quick health check for CI/CD deployment gates
 */
export async function quickHealthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
  try {
    console.log('[DATA_INTEGRITY] Running quick health check...')
    
    const { EasternTimeManager } = await import('./timezone-utils')
    const today = EasternTimeManager.getCurrentEasternDate()
    
    // Critical checks only
    const [csvCount, analyticsCount] = await Promise.all([
      prisma.masterCsvData.count(),
      prisma.analyticsMaster.count({ where: { snapshotDate: new Date(today) } })
    ])
    
    const issues: string[] = []
    
    if (csvCount === 0) {
      issues.push('No master CSV data available')
    }
    
    if (analyticsCount === 0) {
      issues.push(`No analytics_master data for ${today}`)
    }
    
    if (csvCount > 0 && analyticsCount === 0) {
      issues.push('CRITICAL: Silent failure detected - CSV has data but analytics_master is empty')
    }
    
    const healthy = issues.length === 0
    
    if (healthy) {
      console.log('[DATA_INTEGRITY] ✅ Quick health check passed')
    } else {
      console.warn('[DATA_INTEGRITY] ❌ Quick health check failed:', issues)
    }
    
    return { healthy, issues }
    
  } catch (error) {
    console.error('[DATA_INTEGRITY] Quick health check error:', error)
    return {
      healthy: false,
      issues: [`Health check error: ${error instanceof Error ? error.message : String(error)}`]
    }
  }
}

/**
 * Monitor for analytics_master data freshness
 */
export async function checkDataFreshness(): Promise<{
  fresh: boolean
  daysBehind: number
  latestDate: string | null
  currentDate: string
}> {
  try {
    const { EasternTimeManager } = await import('./timezone-utils')
    const currentDate = EasternTimeManager.getCurrentEasternDate()
    
    const latestAnalytics = await prisma.analyticsMaster.aggregate({
      _max: { snapshotDate: true }
    })
    
    const latestDate = latestAnalytics._max.snapshotDate?.toISOString().split('T')[0] || null
    
    if (!latestDate) {
      return {
        fresh: false,
        daysBehind: Infinity,
        latestDate: null,
        currentDate
      }
    }
    
    const latestDateObj = new Date(latestDate)
    const currentDateObj = new Date(currentDate)
    const daysBehind = Math.floor((currentDateObj.getTime() - latestDateObj.getTime()) / (24 * 60 * 60 * 1000))
    
    const fresh = daysBehind <= 1 // Within 1 day is considered fresh
    
    console.log(`[DATA_INTEGRITY] Data freshness: ${daysBehind} days behind (fresh: ${fresh})`)
    
    return {
      fresh,
      daysBehind,
      latestDate,
      currentDate
    }
    
  } catch (error) {
    console.error('[DATA_INTEGRITY] Data freshness check failed:', error)
    return {
      fresh: false,
      daysBehind: Infinity,
      latestDate: null,
      currentDate: 'unknown'
    }
  }
}