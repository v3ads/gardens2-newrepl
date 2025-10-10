import { NextResponse } from 'next/server'
import { MasterCSVSync } from '@/lib/master-csv-sync'
import { requireAdminAuth } from '@/lib/auth-middleware'

export async function POST(request: Request) {
  // Require admin authentication
  const authResult = await requireAdminAuth(request as any)
  if (!authResult.authorized) {
    return authResult.response!
  }
  
  try {
    console.log('[MASTER_CSV_API] Starting master CSV sync...')
    const result = await MasterCSVSync.syncMasterCSV()
    
    const response = {
      success: result.success,
      message: result.success 
        ? `Master CSV sync completed: ${result.recordsProcessed} records in ${Math.round(result.duration / 1000)}s`
        : `Master CSV sync failed: ${result.error}`,
      records_processed: result.recordsProcessed,
      duration_ms: result.duration,
      error: result.error || null
    }

    console.log('[MASTER_CSV_API] Sync result:', response)
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('[MASTER_CSV_API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      message: 'Master CSV sync failed with unexpected error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Stats functionality temporarily unavailable after PostgreSQL migration
    return NextResponse.json({
      success: true,
      message: 'Master CSV stats are not currently available after database migration',
      stats: {
        totalRows: 0,
        occupiedUnits: 0,
        vacantUnits: 0,
        totalMRR: 0,
        lastSyncDate: null
      }
    })
    
  } catch (error) {
    console.error('[MASTER_CSV_API] Error getting stats:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}