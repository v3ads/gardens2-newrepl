import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Headers to prevent caching issues
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Vary': 'Accept-Encoding',
    'Last-Modified': new Date().toUTCString(),
  }
  
  try {
    console.log('[OCCUPANCY_KPIS_V3] Getting occupancy KPIs from unified analytics (master CSV)...')
    
    // Check if sync is in progress for informational purposes
    const { DailySyncManager } = await import('@/lib/daily-sync-manager')
    const syncManager = DailySyncManager.getInstance()
    const isSyncing = syncManager.isSyncInProgress()
    
    // Use unified analytics service for consistent data
    const { UnifiedAnalytics } = await import('@/lib/unified-analytics')
    const metrics = await UnifiedAnalytics.getOccupancyMetrics()
    
    // Get additional unit data for move-ins and move-outs (if available)
    let moveInsUnits: string[] = []
    let moveOutsUnits: string[] = []
    
    try {
      const { getMoveInsMTD, getMoveOutsMTD } = await import('@/lib/occupancy-analytics')
      
      const [moveInsData, moveOutsData] = await Promise.all([
        getMoveInsMTD(metrics.snapshotDate).catch(e => null),
        getMoveOutsMTD(metrics.snapshotDate).catch(e => null)
      ])
      
      moveInsUnits = moveInsData?.units || []
      moveOutsUnits = moveOutsData?.units || []
      
      console.log(`[OCCUPANCY_KPIS_V3] Added unit data: move-ins=${moveInsUnits.length}, move-outs=${moveOutsUnits.length}`)
    } catch (error) {
      console.warn('[OCCUPANCY_KPIS_V3] Failed to get unit data:', error)
    }

    // Convert unified analytics to API format expected by frontend
    const response = {
      snapshot_date: metrics.snapshotDate,
      occupancy_rate_pct: Math.round(metrics.occupancyRate),
      occupancy_student: Math.round(metrics.occupancyStudent),
      occupancy_non_student: Math.round(metrics.occupancyNonStudent),
      occupied_units: metrics.occupiedUnits,
      total_units: metrics.totalUnits,
      vacant_units: metrics.vacantUnits,
      avg_vacancy_days: metrics.avgVacancyDays,
      move_ins_mtd: metrics.moveInsMTD,
      move_outs_mtd: metrics.moveOutsMTD,
      move_ins_units: moveInsUnits,
      move_outs_units: moveOutsUnits,
      expirations_30: 0, // TODO: Add lease expirations to unified analytics if needed
      expirations_60: 0,
      expirations_90: 0,
      sync_in_progress: isSyncing,
      stale: false, // Unified analytics uses real-time master CSV data
      computed_at: new Date().toISOString(),
      data_source: 'master_csv' // Indicate data source for debugging
    }
    
    console.log(`[OCCUPANCY_KPIS_V3] ✅ Returning unified analytics KPIs:`, {
      date: response.snapshot_date,
      occupancy: `${response.occupancy_rate_pct}%`,
      occupied: response.occupied_units,
      vacant: response.vacant_units,
      total: response.total_units,
      dataSource: response.data_source
    })
    
    return NextResponse.json(response, { headers })
    
  } catch (error) {
    console.error('[OCCUPANCY_KPIS_V3] Error getting occupancy KPIs from unified analytics:', error)
    
    // Fallback: return basic structure to prevent frontend crashes
    return NextResponse.json(
      {
        snapshot_date: new Date().toISOString().split('T')[0],
        occupancy_rate_pct: 0,
        occupancy_student: 0,
        occupancy_non_student: 0,
        occupied_units: 0,
        total_units: 0,
        vacant_units: 0,
        avg_vacancy_days: 0,
        move_ins_mtd: 0,
        move_outs_mtd: 0,
        move_ins_units: [],
        move_outs_units: [],
        expirations_30: 0,
        expirations_60: 0,
        expirations_90: 0,
        sync_in_progress: false,
        stale: true,
        computed_at: new Date().toISOString(),
        error: 'unified_analytics_error',
        data_source: 'fallback'
      },
      { status: 500, headers }
    )
  }
}