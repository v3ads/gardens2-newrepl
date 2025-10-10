import { NextResponse } from 'next/server'
import { DailySyncManager } from '@/lib/daily-sync-manager'
import { syncReporter } from '@/lib/sync-reporter'
import { prisma } from '@/lib/prisma'
import { JobQueueService } from '@/lib/job-queue-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const syncManager = DailySyncManager.getInstance()
    const status = await syncManager.getSyncStatus()
    const isSyncing = await syncManager.isSyncInProgress()
    
    // Check new job queue system for active jobs
    const jobQueueService = JobQueueService.getInstance()
    const queueStatus = await jobQueueService.getQueueStatus()
    const recentJobs = await jobQueueService.getRecentJobs(5)
    
    // Determine if any system is syncing (old OR new)
    const isJobQueueSyncing = queueStatus.runningJobs > 0
    const isAnySyncing = isSyncing || isJobQueueSyncing
    
    // Get step information from database if syncing
    let currentStep = null
    let totalSteps = null
    if (isSyncing) {
      try {
        const lockId = 'daily_sync_lock'
        const stepResult = await prisma.$queryRaw<[{current_step: number | null, total_steps: number | null}]>`
          SELECT current_step, total_steps FROM sync_locks WHERE id = ${lockId} LIMIT 1
        `
        if (stepResult.length > 0) {
          currentStep = stepResult[0].current_step
          totalSteps = stepResult[0].total_steps
        }
      } catch (error) {
        console.error('[SYNC_STATUS] Error getting step info:', error)
      }
    }
    
    // Check optimization mode from environment variable
    const useOptimizedSync = process.env.USE_OPTIMIZED_SYNC === 'true'
    
    // Get detailed step-by-step reporting from SyncReporter
    const detailedReport = syncReporter.generateStatusReport()
    const currentStatus = syncReporter.getCurrentStatus()

    // Enhanced validation reporting
    const validationStatus = {
      passed: detailedReport.validationResults.filter(v => v.status === 'passed').length,
      failed: detailedReport.validationResults.filter(v => v.status === 'failed').length,
      details: detailedReport.validationResults.map(v => ({
        name: v.name,
        status: v.status,
        message: v.message,
        remediation: v.remediation,
        category: 'validation'
      }))
    }

    // Detailed step breakdown by category
    const stepsByCategory = {
      ingestion: detailedReport.detailedSteps.filter(s => s.category === 'ingestion'),
      processing: detailedReport.detailedSteps.filter(s => s.category === 'processing'), 
      validation: detailedReport.detailedSteps.filter(s => s.category === 'validation')
    }

    // Calculate success rates
    // IMPORTANT: If sync is active, use live progress from sync_locks instead of SyncReporter
    let completedSteps, failedSteps, totalDetailedSteps, runningSteps
    if (isSyncing && currentStep && totalSteps) {
      // Live sync in progress - use real-time data from sync_locks
      completedSteps = Math.max(currentStep - 1, 0)
      runningSteps = 1
      failedSteps = 0
      totalDetailedSteps = totalSteps
    } else {
      // Use SyncReporter for historical data
      completedSteps = detailedReport.detailedSteps.filter(s => s.status === 'completed').length
      failedSteps = detailedReport.detailedSteps.filter(s => s.status === 'failed').length
      totalDetailedSteps = detailedReport.detailedSteps.length
      runningSteps = detailedReport.detailedSteps.filter(s => s.status === 'running').length
    }

    const response = NextResponse.json({
      // Legacy compatibility - but now includes job queue status  
      isSyncing: isAnySyncing,
      progress: isSyncing ? await syncManager.getCurrentProgress() : null,
      syncType: isSyncing ? await syncManager.getCurrentSyncType() : (isJobQueueSyncing ? 'webhook-job' : null),
      currentStep,
      totalSteps,
      lastSyncTime: status.last_sync_date,
      lastSyncSuccess: status.last_sync_success, // camelCase for frontend
      last_sync_success: status.last_sync_success, // snake_case for legacy compatibility
      totalRecords: status.total_records,
      errorMessage: status.error_message || null, // Add error message for debugging
      optimizationMode: useOptimizedSync ? 'optimized' : 'legacy',
      useOptimizedSync: useOptimizedSync,

      // ENHANCED: Detailed step-by-step reporting (includes job queue activity)
      detailedSync: {
        // CRITICAL FIX: Only show active if there are actually RUNNING jobs in the queue
        // Don't trust SyncReporter's stale currentStatus.run.status
        isActive: isJobQueueSyncing,
        currentStepName: isJobQueueSyncing ? 'Processing webhook job' : currentStatus.summary.currentStep || null,
        runId: currentStatus.run?.id || null,
        stepsProgress: {
          completed: completedSteps,
          failed: failedSteps,
          total: totalDetailedSteps,
          running: runningSteps
        },
        lastRun: (() => {
          // Prioritize recent job queue data over SyncReporter for webhooks
          const recentSuccessfulJob = recentJobs.find(job => job.status === 'SUCCEEDED')
          if (recentSuccessfulJob && recentSuccessfulJob.jobRuns?.[0]) {
            const run = recentSuccessfulJob.jobRuns[0]
            return {
              status: run.success ? 'completed' : 'failed',
              date: run.finishedAt || run.startedAt,
              duration: run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : '0s',
              recordsProcessed: status.total_records || 0, // From main DB status
              stepsCompleted: run.success ? 6 : 0,
              stepsFailed: run.success ? 0 : 1
            }
          }
          // Fallback to SyncReporter data
          return {
            status: detailedReport.lastSync.status,
            date: detailedReport.lastSync.date,
            duration: detailedReport.lastSync.duration,
            recordsProcessed: detailedReport.lastSync.recordsProcessed,
            stepsCompleted: detailedReport.lastSync.stepsCompleted,
            stepsFailed: detailedReport.lastSync.stepsFailed
          }
        })(),
        currentRun: detailedReport.currentSync || null,
        validation: validationStatus,
        stepsByCategory: stepsByCategory,
        allSteps: detailedReport.detailedSteps.map(step => ({
          name: step.name,
          category: step.category,
          status: step.status,
          duration: step.duration,
          recordsProcessed: step.recordsProcessed,
          error: step.error ? {
            code: step.error.code,
            message: step.error.message,
            remediation: step.error.remediation
          } : null
        }))
      },

      // ENHANCED: Specific data consistency reporting  
      dataConsistency: {
        status: validationStatus.failed > 0 ? 'INCONSISTENT' : 'CONSISTENT',
        summary: validationStatus.failed > 0 
          ? `${validationStatus.failed} validation check${validationStatus.failed > 1 ? 's' : ''} failed`
          : `All ${validationStatus.passed} validation checks passed`,
        failedChecks: validationStatus.details.filter(v => v.status === 'failed'),
        passedChecks: validationStatus.details.filter(v => v.status === 'passed'),
        recommendations: validationStatus.details
          .filter(v => v.status === 'failed' && v.remediation)
          .map(v => ({ check: v.name, action: v.remediation }))
      },

      // NEW: Job Queue System Status
      jobQueueStatus: {
        queuedJobs: queueStatus.queuedJobs,
        runningJobs: queueStatus.runningJobs,
        failedJobs: queueStatus.failedJobs,
        completedJobs: queueStatus.completedJobs,
        oldestQueuedJob: queueStatus.oldestQueuedJob,
        recentJobs: recentJobs.map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          attempts: job.attempts,
          lastError: job.lastError,
          lastRun: job.jobRuns?.[0] ? {
            startedAt: job.jobRuns[0].startedAt,
            finishedAt: job.jobRuns[0].finishedAt,
            success: job.jobRuns[0].success,
            durationMs: job.jobRuns[0].durationMs
          } : null
        }))
      }
    })
    
    // Add explicit cache control headers to prevent caching in production
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response
  } catch (error) {
    console.error('Error getting sync status:', error)
    const errorResponse = NextResponse.json({ 
      error: 'Failed to get sync status' 
    }, { status: 500 })
    
    // Add explicit cache control headers to prevent caching even on error
    errorResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    errorResponse.headers.set('Pragma', 'no-cache')
    errorResponse.headers.set('Expires', '0')
    
    return errorResponse
  }
}