import { NextResponse } from 'next/server'

// Force dynamic rendering to prevent build-time database access
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma')
    
    // Test basic connection
    await prisma.$queryRaw`SELECT 1`
    
    // Check key tables
    const masterDataCount = await prisma.masterCsvData.count()
    const kpiCount = await prisma.occupancyDailyKPI.count()
    
    // Check if analytics tables exist
    const analyticsMasterExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'analytics_master'
      )
    ` as Array<{ exists: boolean }>
    
    return NextResponse.json({
      success: true,
      database: {
        connected: true,
        tables: {
          masterCsvData: masterDataCount,
          occupancyDailyKPI: kpiCount,
          analyticsMaster: analyticsMasterExists[0]?.exists ? 'EXISTS' : 'MISSING'
        }
      },
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Database health check failed:', error)
    
    return NextResponse.json({
      success: false,
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
