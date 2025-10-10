import { NextResponse } from 'next/server'
import { StabilityManager } from '../../../../lib/stability-manager'

export async function GET() {
  try {
    const stabilityManager = StabilityManager.getInstance()
    const healthReport = await stabilityManager.performHealthCheck()
    
    return NextResponse.json({
      status: 'success',
      ...healthReport
    })
  } catch (error) {
    console.error('[STABILITY_API] Health check failed:', error)
    return NextResponse.json({
      status: 'error',
      overall_status: 'critical',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST() {
  try {
    const stabilityManager = StabilityManager.getInstance()
    
    // Perform health check first
    const healthReport = await stabilityManager.performHealthCheck()
    
    // If unstable or critical, attempt auto-repair
    if (healthReport.overall_status !== 'stable') {
      const repairResult = await stabilityManager.performAutoRepair()
      
      // Re-check health after repair
      const updatedReport = await stabilityManager.performHealthCheck()
      
      return NextResponse.json({
        status: 'success',
        initial_health: healthReport,
        repair_performed: true,
        repair_result: repairResult,
        final_health: updatedReport
      })
    }
    
    return NextResponse.json({
      status: 'success',
      health: healthReport,
      repair_performed: false,
      message: 'System is stable, no repairs needed'
    })
    
  } catch (error) {
    console.error('[STABILITY_API] Auto-repair failed:', error)
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}