
import { prisma } from '../lib/prisma'

async function quickTest() {
  try {
    console.log('🔍 Testing database connection...')
    
    // Test basic connection
    await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Database connected')
    
    // Check analytics_master table
    const analyticsMasterCount = await prisma.analyticsMaster.count()
    console.log(`✅ analytics_master: ${analyticsMasterCount} rows`)
    
    // Get latest snapshot date
    const latestSnapshot = await prisma.analyticsMaster.findFirst({
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true }
    })
    console.log(`📅 Latest snapshot: ${latestSnapshot?.snapshotDate || 'None'}`)
    
    // Check occupancy KPIs
    const kpiCount = await prisma.occupancyDailyKPI.count()
    console.log(`✅ occupancy_daily_kpi: ${kpiCount} rows`)
    
    // Sample data from analytics_master
    const sample = await prisma.analyticsMaster.findFirst({
      select: {
        snapshotDate: true,
        unitCode: true,
        isOccupied: true,
        mrr: true
      }
    })
    console.log('📊 Sample record:', sample)
    
    console.log('🎉 Test complete!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

quickTest()
