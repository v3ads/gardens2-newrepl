import { NextRequest, NextResponse } from 'next/server'
import { analyticsDb } from '@/lib/analytics-db-pg'

export async function GET(request: NextRequest) {
  try {
    console.log('[OCCUPANCY_AUDIT] Getting occupancy data audit...')

    // Row counts for each table
    const rowCounts: { [tableName: string]: number } = {}
    
    const tables = [
      'raw_report_rent_roll',
      'raw_report_unit_vacancy', 
      'raw_report_lease_history',
      'raw_report_lease_expiration_detail',
      'raw_report_unit_directory',
      'analytics_master'
    ]

    for (const table of tables) {
      try {
        const result = analyticsDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any
        rowCounts[table] = result?.count || 0
      } catch (error) {
        rowCounts[table] = 0 // Table doesn't exist
      }
    }

    // Null checks
    const nullChecks: { [key: string]: any } = {}
    
    try {
      // Check for null/empty unit codes in analytics_master
      const unitCodeNulls = analyticsDb.prepare(`
        SELECT COUNT(*) as count 
        FROM analytics_master 
        WHERE unit_code IS NULL OR unit_code = ''
      `).get() as any
      nullChecks.master_unit_code_null = unitCodeNulls?.count || 0

      // Check is_occupied data types and values
      const occupiedTypes = analyticsDb.prepare(`
        SELECT typeof(is_occupied) as t, is_occupied as v, COUNT(*) as c 
        FROM analytics_master 
        GROUP BY typeof(is_occupied), is_occupied
      `).all() as any[]
      nullChecks.master_bad_occupied = occupiedTypes

      // Check student_flag data types and values  
      const studentTypes = analyticsDb.prepare(`
        SELECT typeof(student_flag) as t, student_flag as v, COUNT(*) as c 
        FROM analytics_master 
        GROUP BY typeof(student_flag), student_flag
      `).all() as any[]
      nullChecks.master_bad_student = studentTypes

    } catch (error) {
      console.warn('[OCCUPANCY_AUDIT] Error running null checks:', error)
      nullChecks.error = 'Failed to run null checks - analytics_master may not exist'
    }

    // Detailed processing audit
    const processing: any = {}
    try {
      // Raw vs processed unit counts
      const rawRentRoll = analyticsDb.prepare('SELECT COUNT(*) as count FROM raw_report_rent_roll').get() as any
      const rawTenantDir = analyticsDb.prepare('SELECT COUNT(*) as count FROM raw_report_tenant_directory').get() as any
      const masterUnits = analyticsDb.prepare('SELECT COUNT(*) as count FROM analytics_master').get() as any
      
      processing.raw_rent_roll_count = rawRentRoll?.count || 0
      processing.raw_tenant_directory_count = rawTenantDir?.count || 0
      processing.analytics_master_count = masterUnits?.count || 0
      
      // Check for duplicate unit codes in raw data
      const duplicateUnits = analyticsDb.prepare(`
        SELECT json_extract(payload_json, '$.Unit') as unit_code, COUNT(*) as count
        FROM raw_report_rent_roll 
        GROUP BY json_extract(payload_json, '$.Unit')
        HAVING COUNT(*) > 1
      `).all() as any[]
      
      processing.duplicate_units_in_raw = duplicateUnits
      
      // Check occupancy status distribution in raw vs processed
      const rawOccupied = analyticsDb.prepare(`
        SELECT 
          json_extract(payload_json, '$.Status') as status,
          COUNT(*) as count
        FROM raw_report_rent_roll 
        GROUP BY json_extract(payload_json, '$.Status')
      `).all() as any[]
      
      const masterOccupied = analyticsDb.prepare(`
        SELECT is_occupied, COUNT(*) as count
        FROM analytics_master 
        GROUP BY is_occupied
      `).all() as any[]
      
      processing.raw_status_distribution = rawOccupied
      processing.master_occupancy_distribution = masterOccupied
      
    } catch (error) {
      console.warn('[OCCUPANCY_AUDIT] Error in processing audit:', error)
      processing.error = 'Failed to run processing audit'
    }

    // Sample data from analytics_master
    const samples: any[] = []
    try {
      const sampleResult = analyticsDb.prepare(`
        SELECT 
          unit_code,
          unit_code_norm,
          is_occupied,
          student_flag,
          occupancy_source,
          lease_start,
          lease_end
        FROM analytics_master 
        ORDER BY unit_code
        LIMIT 15
      `).all() as any[]

      samples.push(...sampleResult)
    } catch (error) {
      console.warn('[OCCUPANCY_AUDIT] Error getting samples:', error)
    }

    const response = NextResponse.json({
      success: true,
      data: {
        row_counts: rowCounts,
        nulls: nullChecks,
        processing: processing,
        samples: samples
      }
    })

    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response

  } catch (error) {
    console.error('[OCCUPANCY_AUDIT] Error getting audit data:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get occupancy audit data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}