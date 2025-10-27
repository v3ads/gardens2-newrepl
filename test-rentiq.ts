import { RentIQAnalytics } from './lib/rentiq-analytics'

async function main() {
  console.log('Testing RentIQ with smart row selection...\n')
  
  const rentiq = RentIQAnalytics.getInstance()
  const results = await rentiq.calculateRentIQ()
  
  console.log('=== RENTIQ OCCUPANCY METRICS ===')
  console.log(`Total Units: ${results.total_units}`)
  console.log(`Occupied Units: ${results.occupied_units}`)
  console.log(`Current Occupancy: ${results.current_occupancy.toFixed(2)}%`)
  console.log(`Vacant Units: ${results.total_units - results.occupied_units}`)
  
  console.log('\n=== EXPECTED RESULTS ===')
  console.log('Occupied Units should be 145 (not 142)')
  console.log('Current Occupancy should be 79.67% (145/182)')
  console.log('Units 312, 510, 608, 902 should count as occupied (have Future/Notice tenants)')
  
  process.exit(0)
}

main().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})
