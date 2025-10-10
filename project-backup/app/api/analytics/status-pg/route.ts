import { NextResponse } from 'next/server'
import { hasAnalyticsData } from '@/lib/occupancy-analytics'
import { pgAnalyticsDb, directQueries } from '@/lib/analytics-store'

export async function GET() {
  try {
    console.log('[ANALYTICS_STATUS_PG] Testing PostgreSQL analytics store...')
    
    // Check if analytics data is available (this checks the analytics_master table)
    const hasData = await hasAnalyticsData()
    console.log('[ANALYTICS_STATUS_PG] hasAnalyticsData:', hasData)

    // Test the PostgreSQL analytics store using direct Prisma queries
    console.log('[ANALYTICS_STATUS_PG] Using direct Prisma queries...')
    const checkpoints = await directQueries.getReportCheckpoints()
    console.log('[ANALYTICS_STATUS_PG] Direct Prisma query returned:', checkpoints.length, 'records')

    const ingestionStatus = checkpoints.map((cp: any) => ({
      report_id: cp.reportId,
      status: cp.status === 'completed' ? 'success' : cp.status,
      last_successful_run: cp.lastSuccessfulRun?.toISOString() || null,
      total_records_ingested: cp.totalRecordsIngested,
      error_message: cp.lastError,
      last_ingested_at: cp.lastIngestedAt?.toISOString() || null
    }))

    // Test additional PostgreSQL store features
    const masterCount = await directQueries.getAnalyticsMasterCount()
    const latestSnapshot = await directQueries.getLatestSnapshotDate()
    
    console.log('[ANALYTICS_STATUS_PG] Analytics master count:', masterCount)
    console.log('[ANALYTICS_STATUS_PG] Latest snapshot date:', latestSnapshot)

    const response = NextResponse.json({
      success: true,
      hasData,
      message: hasData ? 'Analytics data available (PostgreSQL)' : 'No analytics data found (PostgreSQL)',
      ingestion_status: ingestionStatus,
      postgresql_stats: {
        analytics_master_count: masterCount,
        latest_snapshot_date: latestSnapshot?.toISOString().split('T')[0] || null,
        test_method: ingestionStatus.length > 0 ? 'sqlite-compatible' : 'direct-prisma'
      }
    })

    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response

  } catch (error) {
    console.error('[ANALYTICS_STATUS_PG] Error checking PostgreSQL analytics status:', error)
    return NextResponse.json({
      success: false,
      hasData: false,
      error: 'Failed to check PostgreSQL analytics status',
      error_details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}