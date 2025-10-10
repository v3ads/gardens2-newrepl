import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const asOf = searchParams.get('asOf') || 'latest'
    
    console.log(`[AVG_VACANCY_DAYS_API] Getting average vacancy days for: ${asOf}`)
    
    let result = null
    try {
      const { getAvgVacancyDays } = await import('@/lib/occupancy-analytics')
      result = await getAvgVacancyDays(asOf)
    } catch (importError) {
      console.warn('[AVG_VACANCY_DAYS_API] Import or function failed:', importError)
    }
    
    if (!result) {
      return NextResponse.json({ 
        error: 'No vacancy days data available' 
      }, { status: 404 })
    }
    
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    
  } catch (error) {
    console.error('[AVG_VACANCY_DAYS_API] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to get average vacancy days data' 
    }, { status: 500 })
  }
}