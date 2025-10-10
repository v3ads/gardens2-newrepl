import { NextRequest, NextResponse } from 'next/server'
import { DailySyncManager } from '@/lib/daily-sync-manager'

export const dynamic = 'force-dynamic'

/**
 * Client-safe auto-sync endpoint that doesn't expose CRON_SECRET
 * This endpoint uses server-side authentication and bypasses user sessions
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[AUTO_SYNC_ENDPOINT] Client auto-sync request received')
    
    const syncManager = DailySyncManager.getInstance()
    
    // Check if sync already completed today
    const today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'}) // YYYY-MM-DD
    const status = await syncManager.getSyncStatus()

    if (status.last_sync_date === today && status.last_sync_success) {
      console.log('[AUTO_SYNC_ENDPOINT] Sync already completed today, skipping')
      return NextResponse.json({
        success: true,
        message: 'Sync already completed today - skipping duplicate request',
        last_sync_date: status.last_sync_date,
        timestamp: new Date().toISOString()
      })
    }

    // Check if sync is currently in progress
    if (await syncManager.isSyncInProgress()) {
      console.log('[AUTO_SYNC_ENDPOINT] Sync already in progress, skipping')
      return NextResponse.json({
        success: true,
        message: 'Sync already in progress - skipping duplicate request',
        sync_in_progress: true,
        timestamp: new Date().toISOString()
      })
    }

    console.log('[AUTO_SYNC_ENDPOINT] Starting background sync for today...')

    // Run sync asynchronously in background
    syncManager.forceDailySync()
      .then((result) => {
        console.log('[AUTO_SYNC_ENDPOINT] Background sync completed successfully:', result)
      })
      .catch((error) => {
        console.error('[AUTO_SYNC_ENDPOINT] Background sync failed:', error)
      })

    return NextResponse.json({
      success: true,
      message: 'Auto-sync request received and started in background',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[AUTO_SYNC_ENDPOINT] Failed to start auto-sync:', error)
    
    return NextResponse.json({
      success: false,
      message: 'Failed to start auto-sync',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}