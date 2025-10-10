import { RentIQAnalytics } from './lib/rentiq-analytics'

async function testRentIQ() {
  try {
    const rentiq = RentIQAnalytics.getInstance()
    const results = await rentiq.calculateRentIQ('2025-10-10')
    console.log('✅ RentIQ Results:')
    console.log(`- Pool count: ${results.rentiq_pool_count}`)
    console.log(`- Vacant units: ${182 - results.occupied_units}`)
    console.log(`- Units in pool: ${results.rentiq_units.length}`)
    console.log(`- Active: ${results.rentiq_active}`)
  } catch (error) {
    console.error('❌ RentIQ Error:', error)
  }
}

testRentIQ()
