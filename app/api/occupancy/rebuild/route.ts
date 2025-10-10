import { NextResponse } from 'next/server'
import { OccupancyIngestor } from '@/lib/occupancy-ingestor'
import { buildUnitsLeasingMaster } from '@/lib/occupancy-analytics'

export async function POST() {
  try {
    console.log('[OCCUPANCY_REBUILD] Starting occupancy data rebuild...')

    // Check credentials
    const clientId = process.env.APPFOLIO_CLIENT_ID
    const clientSecret = process.env.APPFOLIO_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      return NextResponse.json({ 
        success: false,
        error: 'AppFolio credentials not configured' 
      }, { status: 401 })
    }

    const tenantDomain = process.env.APPFOLIO_TENANT_DOMAIN || 'cynthiagardens.appfolio.com'
    
    // Step 1: Ingest the 5 occupancy reports
    const ingestor = new OccupancyIngestor({
      clientId,
      clientSecret,
      tenantDomain
    })

    console.log('[OCCUPANCY_REBUILD] Ingesting occupancy reports...')
    const ingestionResult = await ingestor.ingestOccupancyReports()
    
    if (!ingestionResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Occupancy reports ingestion failed',
        details: ingestionResult
      }, { status: 500 })
    }

    // Step 2: Build analytics_master table
    console.log('[OCCUPANCY_REBUILD] Building analytics master table...')
    const analyticsResult = await buildUnitsLeasingMaster()
    
    if (!analyticsResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Analytics master build failed',
        details: analyticsResult
      }, { status: 500 })
    }

    console.log('[OCCUPANCY_REBUILD] ✅ Occupancy rebuild completed successfully')

    const response = NextResponse.json({
      success: true,
      message: 'Occupancy data rebuilt successfully',
      summary: {
        ingestion: {
          total_records: ingestionResult.totalRecords,
          successful_reports: ingestionResult.reports.filter(r => r.success).length,
          failed_reports: ingestionResult.reports.filter(r => !r.success).length
        },
        analytics: {
          records_processed: analyticsResult.recordsProcessed,
          duration_ms: analyticsResult.duration
        }
      }
    })

    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response

  } catch (error) {
    console.error('[OCCUPANCY_REBUILD] Rebuild failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Occupancy rebuild failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}