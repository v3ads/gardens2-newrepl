import { NextResponse } from 'next/server'
import { RentIQAnalytics } from '../../../../lib/rentiq-analytics'

const rentiqAnalytics = RentIQAnalytics.getInstance()

export async function GET() {
  try {
    const thresholds = await rentiqAnalytics.getThresholds()
    
    return NextResponse.json({
      success: true,
      thresholds: thresholds || {}
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('[RENTIQ_THRESHOLDS_API] Error getting thresholds:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get thresholds'
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { thresholds } = await request.json()
    
    if (!thresholds || typeof thresholds !== 'object') {
      return NextResponse.json({
        success: false,
        error: 'Thresholds must be an object'
      }, { status: 400 })
    }

    await rentiqAnalytics.updateThresholds(thresholds)
    
    return NextResponse.json({
      success: true,
      message: 'Thresholds updated successfully'
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('[RENTIQ_THRESHOLDS_API] Error updating thresholds:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update thresholds'
    }, { status: 500 })
  }
}