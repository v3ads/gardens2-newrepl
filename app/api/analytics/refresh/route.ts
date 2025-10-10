import { NextResponse } from 'next/server'
import { buildAllAnalytics } from '@/lib/analytics-builder'

export async function POST() {
  try {
    console.log('[ANALYTICS_REFRESH] Starting manual analytics refresh...')
    const startTime = Date.now()

    // Run the complete analytics build pipeline
    const result = await buildAllAnalytics()
    
    const duration = Date.now() - startTime
    console.log(`[ANALYTICS_REFRESH] Manual refresh completed in ${duration}ms`)

    const response = NextResponse.json({
      success: result.success,
      summary: {
        total_duration_ms: result.totalDuration,
        total_records_processed: result.totalRecordsProcessed,
        step_results: result.stepResults
      },
      message: result.success 
        ? 'Analytics data refreshed successfully'
        : 'Analytics refresh completed with some errors'
    })

    // Add cache control headers to prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response

  } catch (error) {
    console.error('[ANALYTICS_REFRESH] Manual refresh failed:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return NextResponse.json({
      success: false,
      error: 'Analytics refresh failed',
      details: errorMessage
    }, { status: 500 })
  }
}