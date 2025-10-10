import { NextResponse } from 'next/server'
import { analyticsDb } from '@/lib/analytics-db-pg'

export async function GET() {
  try {
    console.log('[OCCUPANCY_DIAG] Getting occupancy data diagnostics...')

    // Count rows in each raw table
    const rawCounts = {
      rent_roll: 0,
      unit_vacancy: 0,
      lease_history: 0,
      lease_expiration_detail: 0,
      unit_directory: 0
    }

    const reportIds = [
      { id: 'rent_roll', table: 'raw_occupancy_rent_roll' },
      { id: 'unit_vacancy', table: 'raw_occupancy_unit_vacancy' },
      { id: 'lease_history', table: 'raw_occupancy_lease_history' },
      { id: 'lease_expiration_detail', table: 'raw_occupancy_lease_expiration_detail' },
      { id: 'unit_directory', table: 'raw_occupancy_unit_directory' }
    ]

    const missingSources: string[] = []

    for (const report of reportIds) {
      try {
        const result = analyticsDb.prepare(`SELECT COUNT(*) as count FROM ${report.table}`).get() as { count: number }
        rawCounts[report.id as keyof typeof rawCounts] = result.count
        
        if (result.count === 0) {
          missingSources.push(report.id)
        }
      } catch (error) {
        console.warn(`[OCCUPANCY_DIAG] Table ${report.table} not found or error:`, error)
        rawCounts[report.id as keyof typeof rawCounts] = 0
        missingSources.push(report.id)
      }
    }

    // Count rows in analytics_master
    let analyticsMasterCount = 0
    try {
      const result = analyticsDb.prepare(`SELECT COUNT(*) as count FROM analytics_master`).get() as { count: number }
      analyticsMasterCount = result.count
    } catch (error) {
      console.warn('[OCCUPANCY_DIAG] analytics_master table error:', error)
    }

    // Get latest snapshot date
    let latestSnapshotDate: string | null = null
    try {
      const result = analyticsDb.prepare(`
        SELECT snapshot_date FROM analytics_master 
        ORDER BY snapshot_date DESC LIMIT 1
      `).get() as { snapshot_date: string } | undefined
      
      latestSnapshotDate = result?.snapshot_date || null
    } catch (error) {
      console.warn('[OCCUPANCY_DIAG] Error getting latest snapshot date:', error)
    }

    // Get 5 sample joined rows with PII redacted
    const samples: any[] = []
    if (latestSnapshotDate) {
      try {
        // Check what columns exist in analytics_master
        const tableInfo = analyticsDb.prepare(`PRAGMA table_info(analytics_master)`).all() as any[]
        const existingColumns = tableInfo.map(col => col.name)
        
        // Build query with only existing columns
        const baseColumns = ['unit_code', 'is_occupied', 'student_flag']
        const optionalColumns = ['unit_code_norm', 'bedspace_code', 'occupancy_source', 'student_flag_source', 'lease_start', 'lease_end', 'move_in', 'move_out', 'days_vacant', 'market_rent', 'mrr']
        
        const selectColumns = [
          ...baseColumns.filter(col => existingColumns.includes(col)),
          ...optionalColumns.filter(col => existingColumns.includes(col))
        ]
        
        if (selectColumns.length > 0) {
          const sampleResult = analyticsDb.prepare(`
            SELECT ${selectColumns.join(', ')}
            FROM analytics_master 
            WHERE snapshot_date = ?
            ORDER BY unit_code
            LIMIT 5
          `).all(latestSnapshotDate) as any[]

          // Redact PII and format for display
          for (const row of sampleResult) {
            const sample: any = {
              unit_code: row.unit_code,
              is_occupied: row.is_occupied === 1 ? 'Yes' : 'No',
              student_flag: row.student_flag === 1 ? 'Student' : 'Non-Student'
            }
            
            // Add optional fields if they exist
            if (row.unit_code_norm) sample.unit_code_norm = row.unit_code_norm
            if (row.bedspace_code) sample.bedspace_code = row.bedspace_code
            if (row.occupancy_source) sample.occupancy_source = row.occupancy_source
            if (row.student_flag_source) sample.student_flag_source = row.student_flag_source
            if (row.lease_start) sample.lease_start = row.lease_start
            if (row.lease_end) sample.lease_end = row.lease_end
            if (row.move_in) sample.move_in = row.move_in
            if (row.move_out) sample.move_out = row.move_out
            if (row.days_vacant) sample.days_vacant = row.days_vacant
            if (row.market_rent) sample.market_rent = `$${row.market_rent}`
            if (row.mrr) sample.mrr = `$${row.mrr}`
            
            samples.push(sample)
          }
        }
      } catch (error) {
        console.warn('[OCCUPANCY_DIAG] Error getting sample data:', error)
      }
    }

    // Check for column mapping issues
    let columnMappingInfo: any = {}
    try {
      const fs = require('fs')
      const path = require('path')
      const columnMapsPath = path.join(process.cwd(), 'data', 'column_maps.appfolio.json')
      
      if (fs.existsSync(columnMapsPath)) {
        const columnMaps: { [reportId: string]: any } = JSON.parse(fs.readFileSync(columnMapsPath, 'utf8'))
        
        // Extract unmapped canonicals from each report
        const unmappedCanonicals: { [reportId: string]: string[] } = {}
        
        for (const [reportId, mapping] of Object.entries(columnMaps)) {
          if (mapping && typeof mapping === 'object' && '_metadata' in mapping) {
            const metadata = (mapping as any)._metadata
            if (metadata?.unmapped_canonicals?.length > 0) {
              unmappedCanonicals[reportId] = metadata.unmapped_canonicals
            }
          }
        }
        
        // Find last sniffed date with proper type checking
        const lastSniffed = Object.values(columnMaps)
          .find((m: any) => m && typeof m === 'object' && m._metadata?.sniffed_at)
          ?._metadata?.sniffed_at ?? null
        
        columnMappingInfo = {
          column_maps_exists: true,
          ...(lastSniffed && { last_sniffed: lastSniffed }),
          ...(Object.keys(unmappedCanonicals).length > 0 && { unmapped_canonicals: unmappedCanonicals })
        }
      } else {
        columnMappingInfo = {
          column_maps_exists: false,
          message: 'Column maps not found - run sync to generate'
        }
      }
    } catch (error) {
      columnMappingInfo = {
        column_maps_exists: false,
        error: 'Failed to read column maps'
      }
    }

    const response = NextResponse.json({
      success: true,
      data: {
        counts: {
          raw_report_rent_roll: rawCounts.rent_roll,
          raw_report_unit_vacancy: rawCounts.unit_vacancy,
          raw_report_lease_history: rawCounts.lease_history,
          raw_report_lease_expiration_detail: rawCounts.lease_expiration_detail,
          raw_report_unit_directory: rawCounts.unit_directory,
          analytics_master: analyticsMasterCount
        },
        latestSnapshotDate,
        sample: samples,
        column_mapping: columnMappingInfo,
        ...(missingSources.length > 0 && { missingSources })
      }
    })

    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response

  } catch (error) {
    console.error('[OCCUPANCY_DIAG] Error getting diagnostics:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get occupancy diagnostics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}