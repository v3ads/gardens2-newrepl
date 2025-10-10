import { NextRequest, NextResponse } from 'next/server'
import { DataPreloader } from '@/lib/data-preloader'

export const dynamic = 'force-dynamic'

// Endpoint to trigger background preloading
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { route, type } = body

    console.log('[PRELOAD_API] Triggering preload for:', { route, type })

    if (type === 'smart' && route) {
      // Smart preloading based on current route
      DataPreloader.preloadBasedOnRoute(route)
      
      return NextResponse.json({
        success: true,
        message: `Smart preload initiated for route: ${route}`,
        timestamp: Date.now()
      })
    } else {
      // Full preload
      DataPreloader.preloadAllCriticalData()
      
      return NextResponse.json({
        success: true,
        message: 'Full data preload initiated',
        timestamp: Date.now()
      })
    }

  } catch (error) {
    console.error('[PRELOAD_API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    }, { status: 500 })
  }
}

// Get preload status
export async function GET() {
  try {
    const status = DataPreloader.getStatus()
    
    return NextResponse.json({
      success: true,
      status,
      timestamp: Date.now()
    })

  } catch (error) {
    console.error('[PRELOAD_API] Status error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    }, { status: 500 })
  }
}