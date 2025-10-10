/**
 * Data Quality Monitor
 * 
 * Detects silent failures and data quality issues that don't throw errors
 * but indicate system problems, such as:
 * - Analytics steps processing 0 records
 * - Stale data in critical tables
 * - Missing expected data patterns
 */

import { failureNotificationManager } from './failure-notification-manager'
import { prisma, withPrismaRetry } from './prisma'
import { EasternTimeManager } from './timezone-utils'

interface DataQualityCheck {
  name: string
  description: string
  checkFunction: () => Promise<{ passed: boolean; details: any }>
  severity: 'low' | 'medium' | 'high' | 'critical'
  frequency: 'every_sync' | 'hourly' | 'daily'
}

export class DataQualityMonitor {
  private static instance: DataQualityMonitor
  
  static getInstance(): DataQualityMonitor {
    if (!DataQualityMonitor.instance) {
      DataQualityMonitor.instance = new DataQualityMonitor()
    }
    return DataQualityMonitor.instance
  }

  /**
   * Monitor analytics build results for silent failures
   */
  async monitorAnalyticsBuildResults(buildResults: {
    unitsLeasingMaster: { success: boolean; recordsProcessed: number }
    tenantMart: { success: boolean; recordsProcessed: number }
    operationsMart: { success: boolean; recordsProcessed: number }
    forecastViews: { success: boolean; recordsProcessed: number }
  }): Promise<void> {
    try {
      console.log('[DATA_QUALITY] Monitoring analytics build results...')
      
      // Check for zero-record builds (silent failures)
      const zeroRecordSteps = []
      
      for (const [stepName, result] of Object.entries(buildResults)) {
        if (result.success && result.recordsProcessed === 0) {
          zeroRecordSteps.push({
            step: stepName,
            recordsProcessed: result.recordsProcessed
          })
        }
      }
      
      if (zeroRecordSteps.length > 0) {
        console.warn('[DATA_QUALITY] 🚨 Silent failure detected: Analytics steps processed 0 records')
        
        await failureNotificationManager.reportFailure({
          type: 'critical_error',
          title: 'Analytics Silent Failure: 0 Records Processed',
          description: `Analytics build steps completed successfully but processed 0 records. This indicates a data pipeline issue that needs immediate attention.`,
          context: {
            affectedSteps: zeroRecordSteps,
            buildResults,
            potentialCauses: [
              'Wrong table names in analytics queries',
              'Empty raw data tables',
              'Data format changes from AppFolio',
              'Query syntax errors returning empty results'
            ]
          },
          recoveryActions: [
            'Check raw data table existence and contents',
            'Verify analytics builder query table names',
            'Review recent AppFolio API changes',
            'Run manual analytics rebuild to test fix'
          ]
        })
      }
      
      // Check for data freshness issues
      await this.checkDataFreshness()
      
    } catch (error) {
      console.error('[DATA_QUALITY] Error monitoring analytics build:', error)
    }
  }

  /**
   * Check if critical data tables have fresh data
   */
  private async checkDataFreshness(): Promise<void> {
    try {
      const checks = [
        {
          name: 'Raw AppFolio Data Freshness',
          query: `
            SELECT 
              COUNT(*) as total_records,
              MAX(created_at) as latest_record
            FROM raw_appfolio_rent_roll
          `,
          expectedMinRecords: 100,
          maxAgeHours: 25 // Should be updated daily
        },
        {
          name: 'Analytics Master Data Freshness', 
          query: `
            SELECT 
              COUNT(*) as total_records,
              MAX(last_updated) as latest_record
            FROM analytics_master
          `,
          expectedMinRecords: 150,
          maxAgeHours: 25
        }
      ]

      for (const check of checks) {
        try {
          const results = await withPrismaRetry(() => prisma.$queryRawUnsafe(check.query)) as Array<any>
          const data = results[0]
          
          if (!data) {
            await this.reportDataQualityIssue(
              `${check.name}: No Data Found`,
              `No records found in critical table`,
              { checkName: check.name, query: check.query }
            )
            continue
          }

          const recordCount = parseInt(data.total_records) || 0
          const latestRecord = new Date(data.latest_record)
          const hoursOld = (Date.now() - latestRecord.getTime()) / (1000 * 60 * 60)

          // Check record count
          if (recordCount < check.expectedMinRecords) {
            await this.reportDataQualityIssue(
              `${check.name}: Insufficient Records`,
              `Only ${recordCount} records found, expected at least ${check.expectedMinRecords}`,
              { 
                checkName: check.name,
                recordCount,
                expectedMinRecords: check.expectedMinRecords
              }
            )
          }

          // Check data age
          if (hoursOld > check.maxAgeHours) {
            await this.reportDataQualityIssue(
              `${check.name}: Stale Data`,
              `Latest record is ${hoursOld.toFixed(1)} hours old, expected within ${check.maxAgeHours} hours`,
              {
                checkName: check.name,
                hoursOld: hoursOld.toFixed(1),
                maxAgeHours: check.maxAgeHours,
                latestRecord: latestRecord.toISOString()
              }
            )
          }

        } catch (queryError) {
          await this.reportDataQualityIssue(
            `${check.name}: Query Failed`,
            `Data freshness check query failed`,
            { 
              checkName: check.name,
              error: queryError instanceof Error ? queryError.message : String(queryError)
            }
          )
        }
      }

    } catch (error) {
      console.error('[DATA_QUALITY] Error checking data freshness:', error)
    }
  }

  /**
   * Report data quality issues through failure notification system
   */
  private async reportDataQualityIssue(
    title: string, 
    description: string, 
    context: any
  ): Promise<void> {
    await failureNotificationManager.reportFailure({
      type: 'critical_error',
      title: `Data Quality Issue: ${title}`,
      description,
      context: {
        ...context,
        monitorType: 'data_quality',
        timestamp: EasternTimeManager.getCurrentEasternISO()
      },
      recoveryActions: [
        'Check daily sync status and logs',
        'Verify AppFolio API connectivity',
        'Run manual sync to refresh data',
        'Investigate pipeline data flow'
      ]
    })
  }

  /**
   * Run comprehensive data quality checks
   */
  async runDataQualityChecks(): Promise<{
    passed: number
    failed: number
    issues: Array<{ name: string; passed: boolean; details: any }>
  }> {
    const results = {
      passed: 0,
      failed: 0,
      issues: [] as Array<{ name: string; passed: boolean; details: any }>
    }

    const checks: DataQualityCheck[] = [
      {
        name: 'Raw Data Availability',
        description: 'Check that raw AppFolio tables have recent data',
        checkFunction: async () => {
          try {
            const rentRollCount = await withPrismaRetry(() => prisma.$queryRaw<[{count: number}]>`SELECT COUNT(*) FROM raw_appfolio_rent_roll`)
            const unitsCount = await withPrismaRetry(() => prisma.$queryRaw<[{count: number}]>`SELECT COUNT(*) FROM raw_appfolio_units`)
            const tenantsCount = await withPrismaRetry(() => prisma.$queryRaw<[{count: number}]>`SELECT COUNT(*) FROM raw_appfolio_tenants`)
            
            const counts = {
              rentRoll: Number(rentRollCount[0]?.count || 0),
              units: Number(unitsCount[0]?.count || 0),
              tenants: Number(tenantsCount[0]?.count || 0)
            }
            
            const passed = counts.rentRoll > 100 && counts.units > 1000 && counts.tenants > 1000
            
            return {
              passed,
              details: {
                counts,
                thresholds: { rentRoll: 100, units: 1000, tenants: 1000 }
              }
            }
          } catch (error) {
            return {
              passed: false,
              details: { error: error instanceof Error ? error.message : String(error) }
            }
          }
        },
        severity: 'critical',
        frequency: 'every_sync'
      },
      {
        name: 'Analytics Tables Population',
        description: 'Check that analytics tables are populated with recent data',
        checkFunction: async () => {
          try {
            const analyticsMasterCount = await withPrismaRetry(() => prisma.$queryRaw<[{count: number}]>`SELECT COUNT(*) FROM analytics_master`)
            const count = Number(analyticsMasterCount[0]?.count || 0)
            const passed = count > 150
            
            return {
              passed,
              details: {
                recordCount: count,
                threshold: 150
              }
            }
          } catch (error) {
            return {
              passed: false,
              details: { error: error instanceof Error ? error.message : String(error) }
            }
          }
        },
        severity: 'high',
        frequency: 'every_sync'
      }
    ]

    for (const check of checks) {
      try {
        const result = await check.checkFunction()
        
        results.issues.push({
          name: check.name,
          passed: result.passed,
          details: result.details
        })

        if (result.passed) {
          results.passed++
        } else {
          results.failed++
          
          // Report failed checks as data quality issues
          await this.reportDataQualityIssue(
            check.name,
            check.description,
            {
              checkDetails: result.details,
              severity: check.severity,
              frequency: check.frequency
            }
          )
        }
        
      } catch (error) {
        results.failed++
        results.issues.push({
          name: check.name,
          passed: false,
          details: { error: error instanceof Error ? error.message : String(error) }
        })
      }
    }

    console.log(`[DATA_QUALITY] Quality checks completed: ${results.passed} passed, ${results.failed} failed`)
    return results
  }
}

// Export singleton for easy access
export const dataQualityMonitor = DataQualityMonitor.getInstance()