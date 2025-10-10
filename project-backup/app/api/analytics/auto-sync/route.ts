import { NextRequest, NextResponse } from 'next/server'
import { DailySyncManager } from '@/lib/daily-sync-manager'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[AUTO_SYNC] Auto sync check triggered')

    const syncManager = DailySyncManager.getInstance()
    const needsSync = await syncManager.needsDailySync()
    
    if (needsSync) {
      const result = await syncManager.forceDailySync()
      return NextResponse.json({
        success: true,
        message: 'Auto sync completed successfully',
        data: result,
        needs_sync: false,
        sync_in_progress: false
      })
    } else {
      return NextResponse.json({
        success: true,
        message: 'No sync needed',
        data: { message: 'Data is up to date' },
        needs_sync: false,
        sync_in_progress: false
      })
    }

  } catch (error) {
    console.error('[AUTO_SYNC] Auto sync check failed:', error)
    return NextResponse.json({
      success: false,
      message: 'Auto sync check failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[AUTO_SYNC] Manual sync triggered')

    const syncManager = DailySyncManager.getInstance()
    const result = await syncManager.forceDailySync()

    console.log('[AUTO_SYNC] Manual sync completed:', result)

    const response = NextResponse.json({
      success: true,
      message: 'Manual sync completed successfully',
      data: result
    })

    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response

  } catch (error) {
    console.error('[AUTO_SYNC] Manual sync failed:', error)
    return NextResponse.json({
      success: false,
      message: 'Manual sync failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}