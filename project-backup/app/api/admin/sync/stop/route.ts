import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { DailySyncManager } from '@/lib/daily-sync-manager'
import { JobQueueService } from '@/lib/job-queue-service'

export async function POST(request: NextRequest) {
  try {
    console.log('[STOP_SYNC_API] Admin sync stop request received')
    
    // Get current authenticated user
    const user = await getCurrentUser()
    
    // Check if user is authenticated
    if (!user || !user.email) {
      console.log('[STOP_SYNC_API] Unauthorized - no authenticated user')
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }
    
    // Only allow Ayman to stop sync
    if (user.email !== 'vipaymanshalaby@gmail.com') {
      console.log('[STOP_SYNC_API] Unauthorized - user not authorized:', user.email)
      return NextResponse.json({ 
        success: false,
        error: 'Only authorized admin can stop sync operations' 
      }, { status: 403 })
    }

    console.log('[STOP_SYNC_API] Sync stop requested by admin:', user.email)
    
    // Check both old sync system and new job queue system
    const syncManager = DailySyncManager.getInstance()
    const jobQueueService = JobQueueService.getInstance()
    
    // Get current status
    const queueStatus = await jobQueueService.getQueueStatus()
    const isOldSyncRunning = await syncManager.isSyncInProgress()
    
    let stoppedSomething = false
    let messages = []
    
    // Stop old sync system if running
    if (isOldSyncRunning) {
      const result = await syncManager.stopCurrentSync()
      if (result.success) {
        messages.push(`Stopped legacy sync: ${result.message}`)
        stoppedSomething = true
      } else {
        messages.push(`Legacy sync stop failed: ${result.message}`)
      }
    }
    
    // Stop job queue jobs if running
    if (queueStatus.runningJobs > 0) {
      try {
        // Cancel all running jobs
        const recentJobs = await jobQueueService.getRecentJobs(20)
        const runningJobs = recentJobs.filter(job => job.status === 'RUNNING')
        
        for (const job of runningJobs) {
          await jobQueueService.cancelJob(job.id)
          console.log(`[STOP_SYNC_API] Cancelled job ${job.id}`)
        }
        
        messages.push(`Cancelled ${runningJobs.length} webhook job${runningJobs.length !== 1 ? 's' : ''}`)
        stoppedSomething = true
      } catch (error) {
        console.error('[STOP_SYNC_API] Error cancelling jobs:', error)
        messages.push('Failed to cancel some webhook jobs')
      }
    }
    
    if (stoppedSomething) {
      console.log('[STOP_SYNC_API] ✅ Sync operations stopped:', messages)
      return NextResponse.json({
        success: true,
        message: messages.join('; '),
        stopped_by: user.email,
        timestamp: new Date().toISOString(),
        details: {
          oldSyncStopped: isOldSyncRunning,
          jobsCancelled: queueStatus.runningJobs
        }
      })
    } else {
      console.log('[STOP_SYNC_API] ⚠️ No sync operations to stop')
      return NextResponse.json({
        success: false,
        error: 'No sync operations are currently running'
      }, { status: 409 })
    }
  } catch (error) {
    console.error('[STOP_SYNC_API] Error stopping sync:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error while stopping sync'
    }, { status: 500 })
  }
}