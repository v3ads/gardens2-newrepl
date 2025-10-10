import { NextResponse } from 'next/server'
import { AppFolioReportIngestor } from '@/lib/appfolioIngestor'
import { buildAllAnalytics } from '@/lib/analytics-builder'
import { requireAdminAuth } from '@/lib/auth-middleware'

export async function POST(request: Request) {
  // Require admin authentication
  const authResult = await requireAdminAuth(request as any)
  if (!authResult.authorized) {
    return authResult.response!
  }
  
  try {
    // Check if required secrets exist
    const clientId = process.env.APPFOLIO_CLIENT_ID
    const clientSecret = process.env.APPFOLIO_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      return NextResponse.json({ 
        error: 'AppFolio credentials not configured',
        details: 'APPFOLIO_CLIENT_ID or APPFOLIO_CLIENT_SECRET missing'
      }, { status: 401 })
    }

    const tenantDomain = process.env.APPFOLIO_TENANT_DOMAIN || 'cynthiagardens.appfolio.com'
    
    // Initialize ingestor with conservative settings to avoid rate limits
    const ingestor = new AppFolioReportIngestor({
      clientId,
      clientSecret,
      tenantDomain,
      concurrency: 1, // Process one at a time to avoid rate limits
      delayBetweenRequests: 3000 // 3 second delay between requests
    })

    console.log('[INGEST_API] Starting AppFolio report ingestion')
    const startTime = Date.now()
    
    // Run ingestion
    const results = await ingestor.ingestAllReports()
    
    const duration = Date.now() - startTime
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    const totalRecords = results.reduce((sum, r) => sum + r.recordsIngested, 0)

    console.log(`[INGEST_API] Ingestion completed in ${duration}ms`)

    // Run analytics build after successful ingestion
    if (successful.length > 0) {
      console.log('[INGEST_API] Starting analytics build pipeline...')
      try {
        const analyticsResult = await buildAllAnalytics()
        console.log(`[INGEST_API] Analytics build completed: ${analyticsResult.success ? 'SUCCESS' : 'WITH ERRORS'}`)
      } catch (error) {
        console.error('[INGEST_API] Analytics build failed:', error)
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total_reports: results.length,
        successful_reports: successful.length,
        failed_reports: failed.length,
        total_records_ingested: totalRecords,
        duration_ms: duration
      },
      results: results.map(r => ({
        report_id: r.reportId,
        success: r.success,
        records_ingested: r.recordsIngested,
        duration_ms: r.duration,
        error: r.error || null
      }))
    })
    
  } catch (error) {
    console.error('[INGEST_API] Ingestion error:', error)
    return NextResponse.json({ 
      error: 'Ingestion failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const clientId = process.env.APPFOLIO_CLIENT_ID
    const clientSecret = process.env.APPFOLIO_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      return NextResponse.json({ 
        error: 'AppFolio credentials not configured'
      }, { status: 401 })
    }

    const tenantDomain = process.env.APPFOLIO_TENANT_DOMAIN || 'cynthiagardens.appfolio.com'
    
    const ingestor = new AppFolioReportIngestor({
      clientId,
      clientSecret,
      tenantDomain
    })

    // Get current ingestion status
    const status = ingestor.getIngestionStatus()
    
    const response = NextResponse.json({
      success: true,
      ingestion_status: status
    })

    // Add cache control headers to prevent any caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response
    
  } catch (error) {
    console.error('[INGEST_API] Status check error:', error)
    return NextResponse.json({ 
      error: 'Failed to get ingestion status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}