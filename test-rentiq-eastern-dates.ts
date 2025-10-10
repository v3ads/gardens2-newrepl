/**
 * RentIQ Eastern Date Handling Test
 * 
 * Verifies that the date range query correctly handles Eastern timezone dates
 * stored in the database (e.g., 2025-10-10T04:00:00Z for 2025-10-10 Eastern).
 * 
 * Expected behavior:
 * - Query for '2025-10-10' should match records with snapshotDate between
 *   2025-10-10T00:00:00Z and 2025-10-10T23:59:59Z (inclusive)
 * - Should return 182 units for 2025-10-10
 * - Should calculate pool of 34 units (43 vacant - 9 allowed)
 */

import { RentIQAnalytics } from './lib/rentiq-analytics'

async function testEasternDateHandling() {
  console.log('Testing RentIQ Eastern Date Handling...\n')
  
  try {
    const rentiq = RentIQAnalytics.getInstance()
    const results = await rentiq.calculateRentIQ('2025-10-10')
    
    console.log('✅ Test Results:')
    console.log(`   Date: ${results.date}`)
    console.log(`   Total units: ${results.total_units} (expected: 182)`)
    console.log(`   Occupied: ${results.occupied_units}`)
    console.log(`   Vacant: ${results.total_units - results.occupied_units} (expected: 43)`)
    console.log(`   Pool count: ${results.rentiq_pool_count} (expected: 34)`)
    console.log(`   RentIQ active: ${results.rentiq_active}`)
    
    // Validate results
    if (results.total_units !== 182) {
      throw new Error(`Expected 182 units, got ${results.total_units}`)
    }
    if (results.rentiq_pool_count !== 34) {
      throw new Error(`Expected pool of 34, got ${results.rentiq_pool_count}`)
    }
    
    console.log('\n✅ All Eastern date handling tests passed!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

testEasternDateHandling()
