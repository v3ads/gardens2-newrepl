import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('[OCCUPANCY_REMAP] Starting column re-mapping and rebuild...')

    // Step 1: Re-sniff columns (this will be done during ETL)
    console.log('[OCCUPANCY_REMAP] Column sniffing will be done during ETL rebuild...')
    
    // Step 2: Rebuild analytics_master (this will re-sniff columns automatically)
    console.log('[OCCUPANCY_REMAP] Rebuilding analytics master...')
    const asOfDate = new Date().toISOString().split('T')[0] // Today's date in YYYY-MM-DD format
    
    let buildResult = null
    try {
      const { buildUnitsLeasingMaster } = await import('@/lib/occupancy-analytics')
      buildResult = await buildUnitsLeasingMaster(asOfDate)
    } catch (importError) {
      console.warn('[OCCUPANCY_REMAP] Import or function failed:', importError)
      buildResult = { success: false, error: 'Import failed' }
    }
    
    if (buildResult.success) {
      console.log(`[OCCUPANCY_REMAP] ✅ Successfully remapped and rebuilt: ${(buildResult as any).master_rows || buildResult.recordsProcessed} rows`)
      
      return NextResponse.json({
        success: true,
        message: `Successfully remapped columns and rebuilt analytics master`,
        data: {
          build_result: buildResult
        }
      })
    } else {
      console.error('[OCCUPANCY_REMAP] ❌ Rebuild failed:', buildResult.error)
      
      return NextResponse.json({
        success: false,
        message: `Rebuild failed: ${buildResult.error}`,
        data: {
          build_result: buildResult
        }
      })
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[OCCUPANCY_REMAP] ❌ Remap and rebuild failed:', error)
    
    return NextResponse.json({
      success: false,
      message: `Remap and rebuild failed: ${errorMessage}`,
      error: errorMessage
    }, { status: 500 })
  }
}