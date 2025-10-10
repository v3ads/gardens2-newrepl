import { NextResponse } from 'next/server'
import { getOccupancyKPIs } from '@/lib/occupancy-analytics'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const asOf = searchParams.get('asOf') || 'latest'

    console.log(`[OCCUPANCY_KPIS] Getting occupancy KPIs for: ${asOf}`)

    const kpis = await getOccupancyKPIs(asOf)

    if (!kpis) {
      return NextResponse.json({
        success: false,
        error: 'No occupancy data available',
        message: 'Run the data rebuild process first'
      }, { status: 404 })
    }

    const response = NextResponse.json({
      success: true,
      data: kpis
    })

    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response

  } catch (error) {
    console.error('[OCCUPANCY_KPIS] Error getting KPIs:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get occupancy KPIs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}