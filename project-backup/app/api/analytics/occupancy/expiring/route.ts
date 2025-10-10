import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[EXPIRING_API] Getting expiring leases')
    
    const searchParams = request.nextUrl.searchParams
    const asOf = searchParams.get('asOf') || 'latest'
    const windows = searchParams.get('windows') || 'separate'
    
    console.log('[EXPIRING_API] Getting expiring leases for:', asOf, 'windows:', windows)
    
    let result = null
    let fallbackUsed = ''
    
    // Strategy 1: Try main function with dynamic import
    try {
      const { getExpiringUnits } = await import('@/lib/occupancy-analytics')
      result = await getExpiringUnits(asOf, windows as 'separate' | 'cumulative')
      if (result) {
        console.log('[EXPIRING_API] ✅ Got data from main function')
      }
    } catch (mainError) {
      console.warn('[EXPIRING_API] Main function or import failed:', mainError)
    }
    
    // Strategy 2: Direct PostgreSQL fallback with basic lease expiration data
    if (!result) {
      try {
        console.log('[EXPIRING_API] Attempting direct PostgreSQL fallback...')
        const { prisma } = await import('@/lib/prisma')
        
        // Get latest snapshot date
        const latestSnapshot = await prisma.masterCsvData.aggregate({
          _max: { updatedAt: true }
        })
        
        if (latestSnapshot._max.updatedAt) {
          const snapshotDate = latestSnapshot._max.updatedAt.toISOString().split('T')[0]
          
          // Get lease expiration data from CSV data
          const now = new Date()
          const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
          const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
          const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
          
          const leaseData = await prisma.masterCsvData.findMany({
            where: {
              leaseEndDate: { not: null }
            },
            select: {
              unit: true,
              leaseEndDate: true
            }
          })
          
          const d30: string[] = []
          const d60: string[] = []
          const d90: string[] = []
          
          leaseData.forEach(lease => {
            if (lease.leaseEndDate) {
              const endDate = new Date(lease.leaseEndDate)
              if (endDate <= in30Days) {
                d30.push(lease.unit)
              } else if (endDate <= in60Days) {
                d60.push(lease.unit)
              } else if (endDate <= in90Days) {
                d90.push(lease.unit)
              }
            }
          })
          
          result = {
            snapshot_date: snapshotDate,
            units: { d30, d60, d90 },
            counts: { d30: d30.length, d60: d60.length, d90: d90.length },
            separate_windows: windows === 'separate'
          }
          
          fallbackUsed = 'direct_postgresql'
          console.log('[EXPIRING_API] ✅ Got data from direct PostgreSQL fallback')
        }
      } catch (fallbackError) {
        console.warn('[EXPIRING_API] Direct PostgreSQL fallback failed:', fallbackError)
      }
    }
    
    // Strategy 3: Cache fallback
    if (!result) {
      try {
        const { cache } = await import('@/lib/cache')
        const cacheKey = `expiring-units-${asOf}-${windows}`
        const cachedResult = cache.get(cacheKey)
        if (cachedResult) {
          result = cachedResult
          fallbackUsed = 'cache'
          console.log('[EXPIRING_API] ✅ Got data from cache fallback')
        }
      } catch (cacheError) {
        console.warn('[EXPIRING_API] Cache fallback failed:', cacheError)
      }
    }
    
    if (!result) {
      return NextResponse.json({ 
        error: 'no_data', 
        message: 'No expiring lease data available. This may be due to an ongoing sync operation. Please try again in a moment.',
        sync_in_progress: true
      }, { status: 503 })
    }
    
    // Add fallback indicator if used
    if (fallbackUsed && result) {
      (result as any)._fallback_used = fallbackUsed
    }
    
    // Cache successful response
    try {
      const { cache } = await import('@/lib/cache')
      const cacheKey = `expiring-units-${asOf}-${windows}`
      cache.set(cacheKey, result, 300000) // 5 minutes
    } catch (cacheError) {
      // Cache failure is not critical
    }
    
    console.log('[EXPIRING_API] ✅ Returning expiring leases data:', result)
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('[EXPIRING_API] ❌ Critical error:', error)
    
    // Always return JSON response, never let HTML error pages through
    const errorResponse = {
      error: 'server_error',
      message: 'Unable to load expiring lease data. Please try refreshing the page.',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined,
      sync_in_progress: true,
      timestamp: new Date().toISOString()
    }
    
    return NextResponse.json(errorResponse, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    })
  }
}