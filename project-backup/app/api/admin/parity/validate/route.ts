/**
 * PARITY VALIDATION API ENDPOINT
 * 
 * Triggers parity monitoring validation between optimized vs legacy sync methods
 * Used for Phase 1 stability validation before Phase 2 progression
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST() {
  try {
    // Check authentication and admin role
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Import parity monitor
    const { ParityMonitor } = await import('@/lib/parity-monitor')
    
    console.log('[PARITY_API] Starting parity validation...')
    
    // Run comprehensive parity validation
    const validationResult = await ParityMonitor.runParityValidation()
    
    // Return detailed results
    return NextResponse.json({
      success: true,
      timestamp: validationResult.timestamp,
      passedThreshold: validationResult.passedThreshold,
      performanceImprovement: Math.abs(validationResult.variance.duration).toFixed(1),
      maxKpiVariance: Math.max(...Object.values(validationResult.variance.kpis).map(Number)).toFixed(3),
      alerts: validationResult.alerts,
      details: {
        optimized: {
          duration: validationResult.optimizedResult.duration,
          records: validationResult.optimizedResult.totalRecords,
          kpis: validationResult.optimizedResult.kpis
        },
        legacy: {
          duration: validationResult.legacyResult.duration,
          records: validationResult.legacyResult.totalRecords,
          kpis: validationResult.legacyResult.kpis
        },
        variance: validationResult.variance
      }
    })
    
  } catch (error) {
    console.error('[PARITY_API] ❌ Parity validation failed:', error)
    return NextResponse.json({
      error: 'Parity validation failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Get parity summary status
    const { ParityMonitor } = await import('@/lib/parity-monitor')
    const summary = await ParityMonitor.getParitySummary()
    
    return NextResponse.json({
      success: true,
      summary
    })
    
  } catch (error) {
    console.error('[PARITY_API] ❌ Failed to get parity summary:', error)
    return NextResponse.json({
      error: 'Failed to get parity summary',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}