import { NextRequest, NextResponse } from 'next/server'
import { buildUnitsLeasingMaster } from '@/lib/occupancy-analytics'
import { analyticsDb } from '@/lib/analytics-db-pg'
import { OccupancyIngestor } from '@/lib/occupancy-ingestor'
import { getCrosswalkStats, clearCrosswalkCache } from '@/lib/unit-crosswalk'
import { requireAdminAuth } from '@/lib/auth-middleware'

export async function POST(request: NextRequest) {
  // Require admin authentication
  const authResult = await requireAdminAuth(request)
  if (!authResult.authorized) {
    return authResult.response!
  }
  
  try {
    console.log('[OCCUPANCY_REBUILD] Starting comprehensive rebuild process...')

    // Step 1: Clear crosswalk cache for fresh rebuild
    clearCrosswalkCache()
    console.log('[OCCUPANCY_REBUILD] Cleared unit crosswalk cache')

    // Step 2: Re-sniff columns for all reports (skip for now - will be done during build)
    console.log('[OCCUPANCY_REBUILD] Column mapping will be refreshed during build process')

    // Step 3: Rebuild analytics_master
    const asOfDate = new Date().toISOString().split('T')[0]
    const buildResult = await buildUnitsLeasingMaster(asOfDate)
    
    if (!buildResult.success) {
      return NextResponse.json({
        success: false,
        message: `Rebuild failed: ${buildResult.error}`,
        data: buildResult
      })
    }

    // Step 4: Get comprehensive quality metrics
    let unitCodeNull = 0
    let occDistribution: {[key: string]: number} = {}
    let studentSplit: {[key: string]: number} = {}
    let sourceDistribution: {[key: string]: number} = {}

    try {
      // Count null unit codes
      const nullResult = analyticsDb.prepare(`
        SELECT COUNT(*) as count 
        FROM analytics_master 
        WHERE unit_code IS NULL OR unit_code = ''
      `).get() as any
      unitCodeNull = nullResult?.count || 0

      // Get occupancy distribution
      const occResults = analyticsDb.prepare(`
        SELECT 
          CASE WHEN is_occupied = 1 THEN 'occupied' ELSE 'vacant' END as status,
          COUNT(*) as count 
        FROM analytics_master 
        GROUP BY is_occupied
      `).all() as any[]
      
      for (const result of occResults) {
        occDistribution[result.status] = result.count
      }

      // Get student split
      const studentResults = analyticsDb.prepare(`
        SELECT 
          CASE WHEN student_flag = 1 THEN 'student' ELSE 'non_student' END as type,
          COUNT(*) as count 
        FROM analytics_master 
        GROUP BY student_flag
      `).all() as any[]
      
      for (const result of studentResults) {
        studentSplit[result.type] = result.count
      }

      // Get occupancy source distribution
      const sourceResults = analyticsDb.prepare(`
        SELECT occupancy_source, COUNT(*) as count 
        FROM analytics_master 
        GROUP BY occupancy_source
      `).all() as any[]
      
      for (const result of sourceResults) {
        sourceDistribution[result.occupancy_source || 'unknown'] = result.count
      }

    } catch (error) {
      console.warn('[OCCUPANCY_REBUILD] Error getting quality metrics:', error)
    }

    // Step 5: Get crosswalk statistics
    const crosswalkStats = getCrosswalkStats()

    console.log(`[OCCUPANCY_REBUILD] ✅ Comprehensive rebuild completed: ${buildResult.master_rows} rows`)
    
    return NextResponse.json({
      success: true,
      message: 'Analytics master rebuilt successfully with enhanced crosswalk',
      data: {
        snapshot_date: buildResult.snapshot_date,
        master_rows: buildResult.master_rows,
        occ_distribution: occDistribution,
        sources: sourceDistribution,
        student_split: studentSplit,
        crosswalk_stats: crosswalkStats,
        unit_code_null: unitCodeNull,
        build_result: buildResult
      }
    })
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[OCCUPANCY_REBUILD] ❌ Comprehensive rebuild failed:', error)
    
    return NextResponse.json({
      success: false,
      message: `Rebuild failed: ${errorMessage}`,
      error: errorMessage
    }, { status: 500 })
  }
}