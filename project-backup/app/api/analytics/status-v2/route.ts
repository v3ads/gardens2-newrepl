import { NextResponse } from 'next/server'
import { hasAnalyticsData } from '@/lib/occupancy-analytics'
import { 
  getReportCheckpointsFromPG, 
  getAnalyticsMasterCountFromPG, 
  getLatestSnapshotDateFromPG,
  getAppfolioStateFromPG,
  ensurePGAnalyticsStoreInitialized
} from '@/lib/analytics-store-v2'

export async function GET() {
  try {
    console.log('[ANALYTICS_STATUS_V2] Testing simplified PostgreSQL analytics store...')
    
    // Initialize the PostgreSQL store
    await ensurePGAnalyticsStoreInitialized()
    
    // Check if analytics data is available using existing function (SQLite-based)
    const hasData = await hasAnalyticsData()
    
    // Test PostgreSQL-based functions
    const [checkpoints, masterCount, latestSnapshot, appfolioState] = await Promise.all([
      getReportCheckpointsFromPG(),
      getAnalyticsMasterCountFromPG(),
      getLatestSnapshotDateFromPG(),
      getAppfolioStateFromPG()
    ])

    console.log(`[ANALYTICS_STATUS_V2] PostgreSQL Results:`)
    console.log(`- Report checkpoints: ${checkpoints.length} records`)
    console.log(`- Analytics master count: ${masterCount}`)
    console.log(`- Latest snapshot: ${latestSnapshot?.toISOString().split('T')[0] || 'none'}`)
    console.log(`- AppFolio state exists: ${!!appfolioState}`)

    // Create ingestion status compatible with original format
    const ingestionStatus = checkpoints.map((report: any) => ({
      report_id: report.report_id,
      status: report.status === 'completed' ? 'success' : report.status,
      last_successful_run: report.last_successful_run,
      total_records_ingested: report.total_records_ingested,
      error_message: report.last_error,
      last_ingested_at: report.last_ingested_at
    }))

    const response = NextResponse.json({
      success: true,
      hasData,
      message: hasData ? 'Analytics data available (PostgreSQL v2)' : 'No analytics data found (PostgreSQL v2)',
      ingestion_status: ingestionStatus,
      postgresql_stats: {
        analytics_master_count: masterCount,
        latest_snapshot_date: latestSnapshot?.toISOString().split('T')[0] || null,
        appfolio_connected: (appfolioState as any)?.connected || false,
        test_method: 'direct-prisma-v2'
      },
      comparison: {
        sqlite_has_data: hasData,
        postgresql_checkpoints: checkpoints.length,
        postgresql_master_records: masterCount
      }
    })

    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response

  } catch (error) {
    console.error('[ANALYTICS_STATUS_V2] Error:', error)
    return NextResponse.json({
      success: false,
      hasData: false,
      error: 'Failed to check PostgreSQL v2 analytics status',
      error_details: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}