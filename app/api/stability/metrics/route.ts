import { NextResponse } from 'next/server'
import { StabilityManager } from '../../../../lib/stability-manager'

export async function GET() {
  try {
    const stabilityManager = StabilityManager.getInstance()
    const metrics = await stabilityManager.getStabilityMetrics()
    
    return NextResponse.json({
      status: 'success',
      metrics,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[STABILITY_API] Metrics collection failed:', error)
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}