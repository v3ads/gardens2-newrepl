import { UnifiedAnalytics } from './lib/unified-analytics'

async function main() {
  console.log('Testing analytics with new smart row selection...\n')
  
  const metrics = await UnifiedAnalytics.getAnalyticsMetrics()
  
  console.log('=== OCCUPANCY METRICS ===')
  console.log(`Total Units: ${metrics.totalUnits}`)
  console.log(`Occupied Units: ${metrics.occupiedUnits}`)
  console.log(`Vacant Units: ${metrics.vacantUnits}`)
  console.log(`Occupancy Rate: ${metrics.occupancyRate}%`)
  
  console.log('\n=== FINANCIAL METRICS ===')
  console.log(`Actual MRR: $${metrics.actualMRR.toLocaleString()}`)
  console.log(`Market Potential: $${metrics.marketPotential.toLocaleString()}`)
  console.log(`Vacancy Loss: $${metrics.vacancyLoss.toLocaleString()}`)
  console.log(`ARPU: $${metrics.arpu.toLocaleString()}`)
  
  console.log('\n=== EXPECTED RESULTS ===')
  console.log('Vacant Units should be 37 (down from 40)')
  console.log('Units 312, 510, 608 should be excluded (have Future/Notice tenants)')
  
  process.exit(0)
}

main().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})
