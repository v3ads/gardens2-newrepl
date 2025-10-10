import { NextRequest, NextResponse } from 'next/server'
import { ensureAnalyticsDbInitialized } from '@/lib/analytics-database'
import { MasterCSVSync } from '@/lib/master-csv-sync'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  console.log('[ANALYTICS_INIT] Initializing analytics for production deployment...')
  
  try {
    // Initialize the analytics database
    console.log('[ANALYTICS_INIT] Setting up database...')
    await ensureAnalyticsDbInitialized()
    
    // Sync master CSV data to bootstrap the system
    console.log('[ANALYTICS_INIT] Syncing master CSV data...')
    const csvResult = await MasterCSVSync.syncMasterCSV()
    
    if (!csvResult.success) {
      console.error('[ANALYTICS_INIT] Failed to sync master CSV:', csvResult.error)
      return NextResponse.json(
        { 
          error: 'csv_sync_failed', 
          message: 'Failed to initialize master data. Check Google Sheets access.',
          details: csvResult.error
        },
        { status: 500 }
      )
    }
    
    console.log('[ANALYTICS_INIT] ✅ Analytics initialization complete')
    
    return NextResponse.json({
      success: true,
      message: 'Analytics initialized successfully',
      master_records: csvResult.recordsProcessed,
      duration_ms: csvResult.duration
    })
    
  } catch (error) {
    console.error('[ANALYTICS_INIT] Initialization error:', error)
    return NextResponse.json(
      { 
        error: 'initialization_failed', 
        message: 'Failed to initialize analytics system',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}