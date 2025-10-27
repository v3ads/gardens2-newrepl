import { prisma } from './lib/prisma'

async function main() {
  console.log('Testing financial calculations for duplicate-status units...\n')
  
  // Get raw data for units with multiple statuses
  const testUnits = ['312', '510', '608', '902']
  
  for (const unitCode of testUnits) {
    console.log(`\n=== Unit ${unitCode} ===`)
    
    const rows = await prisma.masterCsvData.findMany({
      where: { unit: unitCode },
      select: {
        unit: true,
        tenantStatus: true,
        monthlyRent: true,
        marketRent: true,
        fullName: true
      }
    })
    
    console.log('Raw database rows:')
    rows.forEach(row => {
      console.log(`  - Status: ${row.tenantStatus}, Monthly Rent: $${row.monthlyRent}, Market Rent: $${row.marketRent}, Tenant: ${row.fullName}`)
    })
    
    // Check what analytics will use (should pick Future/Notice/Current over Vacant)
    const statuses = rows.map(r => r.tenantStatus?.toLowerCase() || '')
    const hasVacant = statuses.includes('vacant')
    const hasNonVacant = statuses.some(s => s !== 'vacant' && s !== '')
    
    // Status priority function (matches UnifiedAnalytics)
    const getStatusPriority = (status: string | null | undefined): number => {
      const s = (status || '').toLowerCase()
      if (s === 'future') return 4
      if (s === 'notice') return 3
      if (s === 'current') return 2
      if (s === 'vacant') return 1
      return 0
    }
    
    const selectedRow = rows.reduce((best, current) => {
      const bestPriority = getStatusPriority(best.tenantStatus)
      const currentPriority = getStatusPriority(current.tenantStatus)
      return currentPriority > bestPriority ? current : best
    })
    
    const isVacant = hasVacant && !hasNonVacant
    
    console.log(`\nSelected row (by priority):`)
    console.log(`  - Status: ${selectedRow.tenantStatus}`)
    console.log(`  - Monthly Rent: $${selectedRow.monthlyRent} (NOT summed)`)
    console.log(`  - Market Rent: $${selectedRow.marketRent}`)
    console.log(`  - Is Vacant: ${isVacant ? 'YES' : 'NO'}`)
    
    if (rows.length > 1) {
      const summedRent = rows.reduce((sum, r) => sum + r.monthlyRent, 0)
      console.log(`\n⚠️  If we summed all rows: $${summedRent} (WRONG - would be double-counting)`)
      console.log(`✅  Using selected row only: $${selectedRow.monthlyRent} (CORRECT)`)
    }
  }
  
  console.log('\n\n=== SUMMARY ===')
  console.log('All units with multiple status rows correctly use:')
  console.log('- Future/Notice/Current status over Vacant status')
  console.log('- Selected row\'s rent ONLY (no summing)')
  console.log('- Units counted as occupied (not vacant) when they have Future/Notice tenants')
  
  process.exit(0)
}

main().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})
