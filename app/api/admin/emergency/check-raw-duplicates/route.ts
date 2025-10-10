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

    // Check for duplicate rent roll records (the source of analytics data)
    // Extract unit_code and bedspace_code from JSON payload
    const duplicates = await prisma.$queryRaw<any[]>`
      SELECT 
        payload_json->>'unit_code' as unit_code,
        payload_json->>'bedspace_code' as bedspace_code,
        COUNT(*) as count
      FROM raw_appfolio_rent_roll
      WHERE ingested_at >= NOW() - INTERVAL '1 day'
      GROUP BY payload_json->>'unit_code', payload_json->>'bedspace_code'
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 20
    `

    // Check total rent roll records from last 24 hours
    const recentCount = await prisma.rawAppfolioRentRoll.count({
      where: {
        ingestedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    })

    // Check if there are multiple ingestion timestamps
    const ingestionTimes = await prisma.rawAppfolioRentRoll.findMany({
      where: {
        ingestedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      select: { ingestedAt: true },
      distinct: ['ingestedAt'],
      orderBy: { ingestedAt: 'desc' },
      take: 10
    })

    return NextResponse.json({
      duplicateRecords: duplicates,
      totalDuplicates: duplicates.length,
      recentRawRecords: recentCount,
      distinctIngestionTimes: ingestionTimes.map(t => t.ingestedAt.toISOString()),
      analysis: duplicates.length > 0 
        ? `Found ${duplicates.length} duplicate unit/bedspace combinations in raw data. This will cause unique constraint failures during analytics build.`
        : 'No duplicates found in recent raw data.'
    })

  } catch (error) {
    console.error('Error checking duplicates:', error)
    return NextResponse.json(
      { 
        error: 'Failed to check duplicates', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
