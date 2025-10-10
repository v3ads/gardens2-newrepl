import { NextResponse } from 'next/server'
import { DailySyncManager } from '@/lib/daily-sync-manager'
import { requireAdminAuth } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Require admin authentication
  const authResult = await requireAdminAuth(request as any)
  if (!authResult.authorized) {
    return authResult.response!
  }
  
  try {
    const { syncType = 'manual' } = await request.json().catch(() => ({}))
    
    if (!['daily', 'webhook', 'manual'].includes(syncType)) {
      return NextResponse.json({ 
        error: 'Invalid sync type. Must be: daily, webhook, or manual' 
      }, { status: 400 })
    }

    console.log(`[SYNC_TRIGGER] Triggering ${syncType} sync...`)
    
    const syncManager = DailySyncManager.getInstance()
    
    // Check if sync is already running
    if (await syncManager.isSyncInProgress()) {
      return NextResponse.json({ 
        error: 'Sync already in progress',
        currentProgress: await syncManager.getCurrentProgress(),
        syncType: await syncManager.getCurrentSyncType()
      }, { status: 409 })
    }

    // Start the sync (don't wait for completion)
    syncManager.performSync(syncType as 'daily' | 'webhook' | 'manual')
      .then(result => {
        console.log(`[SYNC_TRIGGER] ${syncType} sync completed:`, result)
      })
      .catch(error => {
        console.error(`[SYNC_TRIGGER] ${syncType} sync failed:`, error)
      })

    return NextResponse.json({
      success: true,
      message: `${syncType.charAt(0).toUpperCase() + syncType.slice(1)} sync started`,
      syncType
    })

  } catch (error) {
    console.error('[SYNC_TRIGGER] Error triggering sync:', error)
    return NextResponse.json({ 
      error: 'Failed to trigger sync',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}