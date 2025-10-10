import { NextResponse } from 'next/server'
import { hasAnalyticsData } from '@/lib/occupancy-analytics'
import { analyticsDb } from '@/lib/analytics-db-pg'

export async function GET() {
  try {
    // Check if analytics data is available (this checks the analytics_master table)
    const hasData = await hasAnalyticsData()

    // Get AppFolio ingestion status from report_checkpoints
    const reportsStmt = analyticsDb.prepare(`
      SELECT 
        report_id,
        status,
        last_successful_run,
        total_records_ingested,
        last_error,
        last_ingested_at
      FROM report_checkpoints
      ORDER BY last_ingested_at DESC
    `)
    const reports = reportsStmt.all() as Array<{
      report_id: string
      status: string
      last_successful_run: string | null
      total_records_ingested: number
      last_error: string | null
      last_ingested_at: string | null
    }>

    // Create ingestion status for the UI
    const ingestionStatus = reports.map(report => ({
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
      message: hasData ? 'Analytics data available' : 'No analytics data found',
      ingestion_status: ingestionStatus
    })

    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response

  } catch (error) {
    console.error('[ANALYTICS_STATUS] Error checking analytics status:', error)
    return NextResponse.json({
      success: false,
      hasData: false,
      error: 'Failed to check analytics status'
    }, { status: 500 })
  }
}