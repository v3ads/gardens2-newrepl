import { NextRequest, NextResponse } from 'next/server'
import { DailySyncManager } from '@/lib/daily-sync-manager'
import { assertRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Server-only idempotent sync ensure endpoint
 * 
 * This endpoint safely ensures daily sync happens when needed.
 * It's safe to call multiple times and uses distributed locking
 * to prevent concurrent sync operations.
 * 
 * SECURITY: Admin-only endpoint - no client-side sync triggers allowed
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[SYNC_ENSURE] Server-only sync ensure endpoint called')
    
    // Only allow admin users to trigger sync operations
    try {
      await assertRole('ADMIN')
    } catch (authError) {
      console.log('[SYNC_ENSURE] Unauthorized access attempt blocked')
      return NextResponse.json(
        { 
          success: false,
          error: 'unauthorized',
          message: 'Admin access required for sync operations' 
        },
        { status: 403 }
      )
    }

    const syncManager = DailySyncManager.getInstance()
    
    // Check if sync is already in progress
    if (await syncManager.isSyncInProgress()) {
      console.log('[SYNC_ENSURE] Sync already in progress')
      return NextResponse.json({
        success: true,
        sync_in_progress: true,
        message: 'Sync operation already in progress',
        current_progress: await syncManager.getCurrentProgress(),
        sync_type: await syncManager.getCurrentSyncType()
      })
    }

    // Check if sync is needed today using server-side logic only
    const needsSync = await syncManager.needsDailySync()
    
    if (!needsSync) {
      console.log('[SYNC_ENSURE] Daily sync already completed - no action needed')
      const status = await syncManager.getSyncStatus()
      return NextResponse.json({
        success: true,
        sync_needed: false,
        message: 'Daily sync already completed for today',
        last_sync_date: status.last_sync_date,
        last_sync_success: status.last_sync_success
      })
    }

    // Trigger sync operation with distributed locking
    console.log('[SYNC_ENSURE] Starting idempotent sync operation...')
    const syncResult = await syncManager.performSync('manual')

    if (syncResult.success) {
      console.log('[SYNC_ENSURE] ✅ Sync completed successfully')
      return NextResponse.json({
        success: true,
        sync_triggered: true,
        message: 'Daily sync completed successfully',
        duration_ms: syncResult.duration,
        total_records: syncResult.totalRecords
      })
    } else {
      console.log('[SYNC_ENSURE] ❌ Sync failed:', syncResult.error)
      
      // If sync failed due to lock (another process), that's still a success scenario
      if (syncResult.error?.includes('Another process is currently performing sync')) {
        return NextResponse.json({
          success: true,
          sync_in_progress: true,
          message: 'Sync operation already running in another process'
        })
      }
      
      return NextResponse.json({
        success: false,
        error: 'sync_failed',
        message: syncResult.error || 'Sync operation failed',
        duration_ms: syncResult.duration
      }, { status: 500 })
    }

  } catch (error) {
    console.error('[SYNC_ENSURE] Critical error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: 'Failed to ensure sync operation',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    }, { status: 500 })
  }
}

// GET method returns sync status only - no triggering
export async function GET(request: NextRequest) {
  try {
    console.log('[SYNC_ENSURE] Sync status check requested')
    
    const syncManager = DailySyncManager.getInstance()
    const status = await syncManager.getSyncStatus()
    const needsSync = await syncManager.needsDailySync()
    const isSyncing = await syncManager.isSyncInProgress()

    return NextResponse.json({
      success: true,
      sync_needed: needsSync,
      sync_in_progress: isSyncing,
      last_sync_date: status.last_sync_date,
      last_sync_success: status.last_sync_success,
      last_sync_duration_ms: status.last_sync_duration_ms,
      total_records: status.total_records,
      error_message: status.error_message,
      current_progress: isSyncing ? await syncManager.getCurrentProgress() : null,
      current_sync_type: await syncManager.getCurrentSyncType()
    })

  } catch (error) {
    console.error('[SYNC_ENSURE] Status check error:', error)
    return NextResponse.json({
      success: false,
      error: 'status_check_failed',
      message: 'Unable to check sync status'
    }, { status: 500 })
  }
}