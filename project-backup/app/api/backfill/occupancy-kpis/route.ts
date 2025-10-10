import { NextRequest, NextResponse } from 'next/server'
import { backfillSingleDate } from '@/lib/backfill-occupancy-kpis'

export async function POST(request: NextRequest) {
  // Simple authentication check for backfill endpoint security
  const authHeader = request.headers.get('authorization')
  if (!authHeader || authHeader !== `Bearer ${process.env.BACKFILL_SECRET || 'dev-only'}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const { date, days } = body
    
    if (date) {
      // Backfill single date
      console.log(`[BACKFILL_API] Backfilling single date: ${date}`)
      const success = await backfillSingleDate(date)
      
      return NextResponse.json({
        success,
        message: success 
          ? `Successfully backfilled KPIs for ${date}`
          : `No data available for ${date}`
      })
    }
    
    // For multiple days, import the full backfill function
    const daysToBackfill = days || 7
    const { backfillOccupancyKPIs } = await import('@/lib/backfill-occupancy-kpis')
    
    console.log(`[BACKFILL_API] Backfilling ${daysToBackfill} days`)
    await backfillOccupancyKPIs(daysToBackfill)
    
    return NextResponse.json({
      success: true,
      message: `Successfully backfilled KPIs for ${daysToBackfill} days`
    })
    
  } catch (error) {
    console.error('[BACKFILL_API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Only allow GET backfill in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }
  // Simple GET endpoint to backfill today
  const today = new Date().toISOString().split('T')[0]
  
  try {
    console.log(`[BACKFILL_API] Auto-backfilling today: ${today}`)
    const success = await backfillSingleDate(today)
    
    return NextResponse.json({
      success,
      date: today,
      message: success 
        ? `Successfully backfilled KPIs for ${today}`
        : `No data available for ${today}`
    })
  } catch (error) {
    console.error('[BACKFILL_API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        date: today,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}