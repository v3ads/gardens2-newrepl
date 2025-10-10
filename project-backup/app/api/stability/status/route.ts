import { NextResponse } from 'next/server'
import { StabilityManager } from '../../../../lib/stability-manager'

export async function GET() {
  try {
    const stabilityManager = StabilityManager.getInstance()
    
    // Get both health report and metrics
    const [healthReport, metrics] = await Promise.all([
      stabilityManager.performHealthCheck(),
      stabilityManager.getStabilityMetrics()
    ])
    
    return NextResponse.json({
      status: 'success',
      health: {
        overall_status: healthReport.overall_status,
        data_consistency: healthReport.data_consistency,
        sync_health: healthReport.sync_health,
        database_health: healthReport.database_health,
        issues_count: healthReport.issues.length,
        critical_issues: healthReport.issues.filter(issue => issue.includes('CRITICAL')).length
      },
      metrics,
      last_updated: new Date().toISOString(),
      quick_summary: {
        system_stable: healthReport.overall_status === 'stable',
        data_fresh: metrics.data_age_hours < 24,
        sync_working: metrics.sync_success_rate > 90,
        database_ok: healthReport.database_health
      }
    })
  } catch (error) {
    console.error('[STABILITY_API] Status check failed:', error)
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      health: { overall_status: 'critical' }
    }, { status: 500 })
  }
}