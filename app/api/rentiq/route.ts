import { NextResponse } from 'next/server'
import { rentiqAdvancedAnalytics } from '../../../lib/rentiq-analytics-advanced'
import { cache } from '../../../lib/cache'

// Request deduplication to prevent multiple simultaneous calculations
const activeRequests = new Map<string, Promise<any>>()

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const recalculate = searchParams.get('recalculate') === 'true'
    
    const targetDate = date || undefined // Convert null to undefined for calculateRentIQ
    const cacheKey = `rentiq-data-${targetDate || 'latest'}`
    
    // Try cache first (unless recalculating)
    if (!recalculate) {
      const cached = cache.get(cacheKey)
      if (cached) {
        console.log(`[RENTIQ_API] 🎯 Cache HIT: ${cacheKey}`)
        return NextResponse.json({
          status: 'success',
          data: cached,
          source: 'cache'
        })
      }
      
      // Check if calculation is already in progress (request deduplication)
      const activeRequest = activeRequests.get(cacheKey)
      if (activeRequest) {
        console.log(`[RENTIQ_API] ⏳ Waiting for ongoing calculation: ${cacheKey}`)
        const results = await activeRequest
        return NextResponse.json({
          status: 'success',
          data: results,
          source: 'deduped'
        })
      }
      
      console.log(`[RENTIQ_API] ❌ Cache MISS: ${cacheKey}`)
    }
    
    console.log(`[RENTIQ_API] ${recalculate ? 'Recalculating' : 'Computing fresh'} RentIQ for ${targetDate || 'latest available date'}`)
    
    // Start calculation and store promise for deduplication
    const calculationPromise = rentiqAdvancedAnalytics.calculateRentIQ(targetDate)
    activeRequests.set(cacheKey, calculationPromise)
    
    try {
      const results = await calculationPromise
      
      // Cache the results for 15 minutes (RentIQ data doesn't change frequently)
      cache.set(cacheKey, results, 15 * 60 * 1000)
      console.log(`[RENTIQ_API] 💾 Cached: ${cacheKey}`)
      
      return NextResponse.json({
        status: 'success',
        data: results,
        source: 'computed'
      })
    } finally {
      // Clean up active request
      activeRequests.delete(cacheKey)
    }
    
  } catch (error) {
    console.error('[RENTIQ_API] Error:', error)
    
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { date } = await request.json()
    const targetDate = date || new Date().toISOString().split('T')[0]
    
    const results = await rentiqAdvancedAnalytics.calculateRentIQ(targetDate)
    
    return NextResponse.json({
      status: 'success',
      message: `RentIQ calculated for ${targetDate}`,
      data: results
    })
    
  } catch (error) {
    console.error('[RENTIQ_API] Error calculating:', error)
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to calculate RentIQ'
    }, { status: 500 })
  }
}