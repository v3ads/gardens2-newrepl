import { NextResponse } from 'next/server'
import { RentIQAnalytics } from '@/lib/rentiq-analytics'
import { RentIQSheetsSync } from '@/lib/rentiq-sheets-sync'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    console.log('[RENTIQ_UPDATE_SHEET] Starting RentIQ recalculation and sheet update...')
    
    // Calculate latest RentIQ data
    const rentiqAnalytics = RentIQAnalytics.getInstance()
    const results = await rentiqAnalytics.calculateRentIQ()
    
    console.log(`[RENTIQ_UPDATE_SHEET] RentIQ calculated: ${results.rentiq_pool_count} units in pool`)
    
    // Update Google Sheets
    await RentIQSheetsSync.updateRentIQSheet(results)
    
    console.log('[RENTIQ_UPDATE_SHEET] ✅ Google Sheet successfully updated')
    
    return NextResponse.json({
      success: true,
      message: 'Google Sheet updated successfully',
      data: {
        pool_count: results.rentiq_pool_count,
        occupancy: results.current_occupancy,
        total_units: results.total_units,
        occupied_units: results.occupied_units,
        top_units: results.rentiq_units.slice(0, 5).map(u => ({
          unit: u.unit,
          days_vacant: u.days_vacant,
          suggested_rent: u.suggested_new_rent
        }))
      }
    })
    
  } catch (error: any) {
    console.error('[RENTIQ_UPDATE_SHEET] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update Google Sheet'
    }, { status: 500 })
  }
}
