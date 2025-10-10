/**
 * Failure Notification Manager
 * 
 * Centralized system for detecting, categorizing, and notifying about system failures.
 * Integrates with email service to send admin alerts for critical issues.
 * 
 * Key Features:
 * - Intelligent failure categorization and severity assessment
 * - Notification throttling to prevent spam
 * - Recovery action tracking
 * - Integration with existing monitoring systems
 */

import { emailService } from './email-service'
import { EasternTimeManager } from './timezone-utils'

interface FailureRecord {
  type: string
  timestamp: string
  count: number
  lastNotified: string | null
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export class FailureNotificationManager {
  private static instance: FailureNotificationManager
  private recentFailures = new Map<string, FailureRecord>()
  
  // Throttling configuration (prevent spam)
  private readonly THROTTLE_WINDOWS = {
    low: 4 * 60 * 60 * 1000,      // 4 hours for low severity
    medium: 2 * 60 * 60 * 1000,   // 2 hours for medium severity  
    high: 1 * 60 * 60 * 1000,     // 1 hour for high severity
    critical: 15 * 60 * 1000      // 15 minutes for critical severity
  }
  
  // Failure severity escalation thresholds
  private readonly ESCALATION_THRESHOLDS = {
    sync_failure: { low: 1, medium: 2, high: 3, critical: 5 },
    database_error: { low: 1, medium: 3, high: 5, critical: 10 },
    api_failure: { low: 5, medium: 10, high: 20, critical: 50 },
    critical_error: { low: 1, medium: 1, high: 1, critical: 1 }
  }

  static getInstance(): FailureNotificationManager {
    if (!FailureNotificationManager.instance) {
      FailureNotificationManager.instance = new FailureNotificationManager()
    }
    return FailureNotificationManager.instance
  }

  /**
   * Report a system failure and send notification if appropriate
   */
  async reportFailure(failureData: {
    type: 'sync_failure' | 'stuck_sync_recovery' | 'database_error' | 'api_failure' | 'critical_error'
    title: string
    description: string
    error?: Error | any
    context?: any
    recoveryActions?: string[]
  }): Promise<boolean> {
    try {
      console.log(`[FAILURE_NOTIFICATION] Reporting ${failureData.type}: ${failureData.title}`)
      
      const now = EasternTimeManager.getCurrentEasternISO()
      const failureKey = `${failureData.type}_${failureData.title}`
      
      // Update failure tracking
      const existing = this.recentFailures.get(failureKey)
      const count = existing ? existing.count + 1 : 1
      
      // Determine severity based on failure type and frequency
      const severity = this.calculateSeverity(failureData.type, count)
      
      const failureRecord: FailureRecord = {
        type: failureData.type,
        timestamp: now,
        count,
        lastNotified: existing?.lastNotified || null,
        severity
      }
      
      this.recentFailures.set(failureKey, failureRecord)
      
      // Check if we should send notification (throttling)
      const shouldNotify = this.shouldSendNotification(failureRecord)
      
      if (shouldNotify) {
        console.log(`[FAILURE_NOTIFICATION] Sending ${severity} notification for ${failureData.type}`)
        
        // Prepare error details
        let errorStack: string | undefined
        let details: any = failureData.context
        
        if (failureData.error) {
          if (failureData.error instanceof Error) {
            errorStack = failureData.error.stack
            details = {
              ...details,
              errorMessage: failureData.error.message,
              errorName: failureData.error.name
            }
          } else {
            details = { ...details, error: failureData.error }
          }
        }
        
        // Add failure frequency information
        details = {
          ...details,
          failureCount: count,
          firstOccurrence: existing?.timestamp || now,
          pattern: count > 1 ? 'Recurring failure' : 'First occurrence'
        }
        
        const success = await emailService.sendFailureNotification({
          type: failureData.type,
          title: count > 1 ? `${failureData.title} (${count}x)` : failureData.title,
          description: failureData.description,
          severity,
          details,
          timestamp: now,
          errorStack,
          recoveryActions: failureData.recoveryActions
        })
        
        if (success) {
          failureRecord.lastNotified = now
          this.recentFailures.set(failureKey, failureRecord)
          console.log(`[FAILURE_NOTIFICATION] ✅ Notification sent successfully`)
        } else {
          console.log(`[FAILURE_NOTIFICATION] ❌ Failed to send notification`)
        }
        
        return success
      } else {
        console.log(`[FAILURE_NOTIFICATION] Notification throttled for ${failureData.type} (last sent: ${failureRecord.lastNotified})`)
        return true // Consider throttled as success
      }
      
    } catch (error) {
      console.error('[FAILURE_NOTIFICATION] Error reporting failure:', error)
      return false
    }
  }

  /**
   * Calculate failure severity based on type and frequency
   */
  private calculateSeverity(type: string, count: number): 'low' | 'medium' | 'high' | 'critical' {
    const thresholds = this.ESCALATION_THRESHOLDS[type as keyof typeof this.ESCALATION_THRESHOLDS] || 
                      this.ESCALATION_THRESHOLDS.sync_failure
    
    if (count >= thresholds.critical) return 'critical'
    if (count >= thresholds.high) return 'high'
    if (count >= thresholds.medium) return 'medium'
    return 'low'
  }

  /**
   * Determine if notification should be sent based on throttling rules
   */
  private shouldSendNotification(failureRecord: FailureRecord): boolean {
    if (!failureRecord.lastNotified) {
      return true // Always send first notification
    }
    
    const timeSinceLastNotification = Date.now() - new Date(failureRecord.lastNotified).getTime()
    const throttleWindow = this.THROTTLE_WINDOWS[failureRecord.severity]
    
    return timeSinceLastNotification >= throttleWindow
  }

  /**
   * Clean up old failure records (run periodically)
   */
  private cleanupOldFailures(): void {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours
    
    for (const [key, record] of this.recentFailures.entries()) {
      const age = now - new Date(record.timestamp).getTime()
      if (age > maxAge) {
        this.recentFailures.delete(key)
      }
    }
  }

  /**
   * Get current failure status for monitoring
   */
  getFailureStatus(): {
    totalFailures: number
    recentFailures: Array<{
      type: string
      count: number
      severity: string
      lastOccurrence: string
    }>
    criticalFailures: number
  } {
    this.cleanupOldFailures()
    
    const failures = Array.from(this.recentFailures.values())
    const criticalFailures = failures.filter(f => f.severity === 'critical').length
    
    return {
      totalFailures: failures.length,
      recentFailures: failures.map(f => ({
        type: f.type,
        count: f.count,
        severity: f.severity,
        lastOccurrence: f.timestamp
      })),
      criticalFailures
    }
  }

  /**
   * Send a test notification to verify email functionality
   */
  async sendTestNotification(): Promise<boolean> {
    console.log('[FAILURE_NOTIFICATION] Sending test notification...')
    
    return await emailService.sendFailureNotification({
      type: 'critical_error',
      title: 'Test Notification - Email System Verification',
      description: 'This is a test notification to verify that the admin failure notification system is working correctly. If you receive this email, the notification system is functional.',
      severity: 'low',
      details: {
        testType: 'email_system_verification',
        timestamp: EasternTimeManager.getCurrentEasternISO(),
        systemStatus: 'operational'
      },
      recoveryActions: ['Test completed successfully', 'No action required']
    })
  }

  /**
   * Report sync failures with smart categorization
   */
  async reportSyncFailure(error: any, context: {
    syncType: 'daily' | 'webhook' | 'manual'
    step?: string
    duration?: number
    recordsProcessed?: number
  }): Promise<boolean> {
    const title = `${context.syncType.charAt(0).toUpperCase() + context.syncType.slice(1)} Sync Failed`
    const description = context.step 
      ? `Sync failed during ${context.step} step`
      : 'Sync operation failed to complete successfully'

    return await this.reportFailure({
      type: 'sync_failure',
      title,
      description,
      error,
      context: {
        ...context,
        easternTime: EasternTimeManager.formatEasternDateTimeForDisplay()
      },
      recoveryActions: [
        'Sync will be retried automatically',
        'Check AppFolio API status',
        'Verify database connectivity'
      ]
    })
  }

  /**
   * Report stuck sync recovery with details
   */
  async reportStuckSyncRecovery(stuckInfo: {
    lockId: string
    hoursStuck: number
    syncType: string
    recoveryMethod: string
  }): Promise<boolean> {
    return await this.reportFailure({
      type: 'stuck_sync_recovery',
      title: 'Stuck Sync Auto-Recovery Performed',
      description: `A ${stuckInfo.syncType} sync was stuck for ${stuckInfo.hoursStuck.toFixed(1)} hours and has been automatically recovered using ${stuckInfo.recoveryMethod}.`,
      context: stuckInfo,
      recoveryActions: [
        `Used ${stuckInfo.recoveryMethod} recovery method`,
        'Cleaned up stuck checkpoints',
        'Reset sync locks',
        'System ready for next sync'
      ]
    })
  }

  /**
   * Report database connectivity issues
   */
  async reportDatabaseError(error: any, operation: string): Promise<boolean> {
    return await this.reportFailure({
      type: 'database_error',
      title: 'Database Operation Failed',
      description: `Database operation "${operation}" failed. This may indicate connectivity issues or database overload.`,
      error,
      context: {
        operation,
        timestamp: EasternTimeManager.getCurrentEasternISO()
      },
      recoveryActions: [
        'Automatic retry with exponential backoff',
        'Check database connection pool',
        'Monitor database performance metrics'
      ]
    })
  }

  /**
   * Report API failures with rate limiting context
   */
  async reportAPIFailure(error: any, context: {
    endpoint: string
    method: string
    statusCode?: number
    retryCount?: number
  }): Promise<boolean> {
    const title = `API Call Failed: ${context.method} ${context.endpoint}`
    const description = context.statusCode 
      ? `API call returned status ${context.statusCode}`
      : 'API call failed due to network or server error'

    return await this.reportFailure({
      type: 'api_failure',
      title,
      description,
      error,
      context,
      recoveryActions: [
        'Automatic retry with exponential backoff',
        'Check rate limiting status',
        'Verify API endpoint availability'
      ]
    })
  }
}

// Export singleton for easy access
export const failureNotificationManager = FailureNotificationManager.getInstance()