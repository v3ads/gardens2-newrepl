import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { MasterCSVSync } from '@/lib/master-csv-sync'

export const dynamic = 'force-dynamic'

/**
 * Admin-only endpoint for triggering ONLY master CSV sync
 * This catches up on missed CSV data without running the full 6-step sync
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[MASTER_CSV_ONLY] Master CSV only sync request received')
    
    // Get current authenticated user
    const user = await getCurrentUser()
    
    // Check if user is authenticated and authorized
    if (!user || !user.email) {
      console.log('[MASTER_CSV_ONLY] Unauthorized - no authenticated user')
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }
    
    if (user.email !== 'vipaymanshalaby@gmail.com') {
      console.log('[MASTER_CSV_ONLY] Unauthorized - user not in allowlist:', user.email)
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions'
      }, { status: 403 })
    }
    
    console.log('[MASTER_CSV_ONLY] Authorization successful for:', user.email)
    console.log('[MASTER_CSV_ONLY] Starting targeted master CSV sync (skipping other steps)...')
    
    const startTime = Date.now()
    
    // Run ONLY the master CSV sync step
    const csvSyncResult = await MasterCSVSync.syncMasterCSV()
    
    const duration = Date.now() - startTime
    
    if (csvSyncResult.success) {
      console.log('[MASTER_CSV_ONLY] Master CSV sync completed successfully')
      return NextResponse.json({
        success: true,
        message: 'Master CSV sync completed successfully! Dashboard data updated.',
        step_completed: 'master_csv_only',
        records_processed: csvSyncResult.recordsProcessed || 0,
        duration_ms: duration,
        sync_result: csvSyncResult,
        timestamp: new Date().toISOString()
      })
    } else {
      console.error('[MASTER_CSV_ONLY] Master CSV sync failed:', csvSyncResult.error)
      return NextResponse.json({
        success: false,
        message: 'Master CSV sync failed',
        error: csvSyncResult.error,
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }
    
  } catch (error) {
    console.error('[MASTER_CSV_ONLY] Failed to run master CSV sync:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to run master CSV sync',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Only allow POST method for this endpoint
export async function GET() {
  return NextResponse.json({
    success: false,
    error: 'Method not allowed - use POST',
    description: 'This endpoint runs only the master CSV sync step (not the full 6-step pipeline)'
  }, { status: 405 })
}