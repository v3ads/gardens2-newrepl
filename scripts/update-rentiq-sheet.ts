#!/usr/bin/env tsx
/**
 * Manual script to update RentIQ Google Sheet with latest data
 */

import { RentIQAnalytics } from '../lib/rentiq-analytics'
import { RentIQSheetsSync } from '../lib/rentiq-sheets-sync'

async function updateRentIQSheet() {
  try {
    console.log('🔄 Calculating latest RentIQ data...')
    const rentiqAnalytics = RentIQAnalytics.getInstance()
    const results = await rentiqAnalytics.calculateRentIQ()
    
    console.log(`✅ RentIQ calculated:`)
    console.log(`   - Total units: ${results.total_units}`)
    console.log(`   - Occupied: ${results.occupied_units}`)
    console.log(`   - Vacant: ${results.total_units - results.occupied_units}`)
    console.log(`   - Occupancy: ${results.current_occupancy.toFixed(2)}%`)
    console.log(`   - Pool size: ${results.rentiq_pool_count} units`)
    
    console.log('\n📊 Updating Google Sheet...')
    await RentIQSheetsSync.updateRentIQSheet(results)
    
    console.log('\n✅ Google Sheet successfully updated!')
    console.log(`\nTop 5 units in RentIQ pool:`)
    results.rentiq_units.slice(0, 5).forEach((unit, i) => {
      console.log(`   ${i+1}. Unit ${unit.unit}: ${unit.days_vacant} days vacant → $${unit.suggested_new_rent} (was $${unit.market_rent})`)
    })
    
    process.exit(0)
  } catch (error: any) {
    console.error('\n❌ Error updating Google Sheet:', error.message)
    process.exit(1)
  }
}

updateRentIQSheet()
