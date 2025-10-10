import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  console.log('[MOVE_OUTS_MTD_API] Getting move-outs MTD')
  
  try {
    const { searchParams } = new URL(request.url)
    const asOf = searchParams.get('asOf') || 'latest'
    
    console.log(`[MOVE_OUTS_MTD_API] Getting move-outs MTD for: ${asOf}`)
    
    let result = null
    try {
      const { getMoveOutsMTD } = await import('@/lib/occupancy-analytics')
      result = await getMoveOutsMTD(asOf)
    } catch (importError) {
      console.warn('[MOVE_OUTS_MTD_API] Import or function failed:', importError)
    }
    
    if (!result) {
      return NextResponse.json(
        { error: 'No move-outs data available' }, 
        { 
          status: 404,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }
    
    console.log('[MOVE_OUTS_MTD_API] ✅ Returning move-outs MTD data:', result)
    
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    
  } catch (error) {
    console.error('[MOVE_OUTS_MTD_API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get move-outs MTD data' },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  }
}