import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    // Allow secret-based auth for emergency access
    const authHeader = request.headers.get('authorization')
    const secretKey = authHeader?.replace('Bearer ', '')
    const validSecret = process.env.CRON_SECRET || process.env.WEBHOOK_SECRET_KEY
    
    if (!secretKey || !validSecret || secretKey !== validSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get distinct dates from analyticsMaster
    const dates = await prisma.analyticsMaster.findMany({
      select: { snapshotDate: true },
      distinct: ['snapshotDate'],
      orderBy: { snapshotDate: 'desc' },
      take: 10
    })

    // Get count for today's date variations
    const today = new Date('2025-10-10')
    const todayUTC = new Date('2025-10-10T00:00:00.000Z')
    const todayET = new Date('2025-10-10T04:00:00.000Z') // 00:00 ET = 04:00 UTC

    const [countToday, countTodayUTC, countTodayET] = await Promise.all([
      prisma.analyticsMaster.count({ where: { snapshotDate: today } }),
      prisma.analyticsMaster.count({ where: { snapshotDate: todayUTC } }),
      prisma.analyticsMaster.count({ where: { snapshotDate: todayET } }),
    ])

    return NextResponse.json({
      distinctDates: dates.map(d => ({
        date: d.snapshotDate,
        iso: d.snapshotDate.toISOString(),
        count: null // We'll add counts if needed
      })),
      testCounts: {
        'new Date("2025-10-10")': countToday,
        'new Date("2025-10-10T00:00:00.000Z")': countTodayUTC,
        'new Date("2025-10-10T04:00:00.000Z")': countTodayET
      }
    })

  } catch (error) {
    console.error('Error checking dates:', error)
    return NextResponse.json(
      { 
        error: 'Failed to check dates', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
