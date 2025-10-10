import { NextResponse } from 'next/server'
import { analyticsDb } from '@/lib/analytics-db-pg'
import { getAllOverrides } from '@/lib/student-overrides'

export async function GET() {
  try {
    console.log('[STUDENT_DIAG] Getting student classification diagnostics...')

    // Get latest snapshot date
    const latestResult = analyticsDb.prepare(`
      SELECT snapshot_date FROM analytics_master 
      ORDER BY snapshot_date DESC LIMIT 1
    `).get() as { snapshot_date: string } | undefined

    if (!latestResult) {
      return NextResponse.json({
        success: false,
        error: 'No analytics data available'
      }, { status: 404 })
    }

    const snapshotDate = latestResult.snapshot_date

    // Get counts by student classification
    const countsResult = analyticsDb.prepare(`
      SELECT 
        SUM(CASE WHEN student_flag = 1 THEN 1 ELSE 0 END) as student_units,
        SUM(CASE WHEN student_flag = 0 THEN 1 ELSE 0 END) as non_student_units,
        COUNT(*) as total_units
      FROM analytics_master 
      WHERE snapshot_date = ?
    `).get(snapshotDate) as any

    // Get top 10 student unit samples
    const studentSamplesResult = analyticsDb.prepare(`
      SELECT 
        unit_code,
        unit_code_norm,
        bedspace_code,
        student_flag_source,
        property_id
      FROM analytics_master 
      WHERE snapshot_date = ? AND student_flag = 1
      ORDER BY unit_code_norm
      LIMIT 10
    `).all(snapshotDate) as any[]

    // Get top 10 non-student unit samples
    const nonStudentSamplesResult = analyticsDb.prepare(`
      SELECT 
        unit_code,
        unit_code_norm,
        bedspace_code,
        student_flag_source,
        property_id
      FROM analytics_master 
      WHERE snapshot_date = ? AND student_flag = 0
      ORDER BY unit_code_norm
      LIMIT 10
    `).all(snapshotDate) as any[]

    // Get all active overrides
    const overrides = getAllOverrides()

    // Get classification source breakdown
    const sourcesResult = analyticsDb.prepare(`
      SELECT 
        student_flag_source,
        COUNT(*) as count,
        SUM(student_flag) as student_count
      FROM analytics_master 
      WHERE snapshot_date = ?
      GROUP BY student_flag_source
    `).all(snapshotDate) as any[]

    const response = NextResponse.json({
      success: true,
      data: {
        snapshot_date: snapshotDate,
        counts: {
          student_units: countsResult.student_units || 0,
          non_student_units: countsResult.non_student_units || 0,
          total_units: countsResult.total_units || 0
        },
        student_samples: studentSamplesResult,
        non_student_samples: nonStudentSamplesResult,
        overrides: overrides,
        classification_sources: sourcesResult
      }
    })

    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response

  } catch (error) {
    console.error('[STUDENT_DIAG] Error getting diagnostics:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get student classification diagnostics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}