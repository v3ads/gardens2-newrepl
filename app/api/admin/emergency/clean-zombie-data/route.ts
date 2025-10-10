import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Allow either session auth OR secret key for emergency access
    const authHeader = request.headers.get('authorization')
    const secretKey = authHeader?.replace('Bearer ', '')
    const validSecret = process.env.CRON_SECRET || process.env.WEBHOOK_SECRET_KEY
    
    // Check secret key first (for emergency API access)
    const hasValidSecret = secretKey && validSecret && secretKey === validSecret
    
    // If no valid secret, require session authentication
    if (!hasValidSecret) {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Require ADMIN role
      if (session.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { date, confirm } = body

    if (!date) {
      return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 })
    }

    if (confirm !== true) {
      return NextResponse.json({ 
        error: 'Missing confirmation - set confirm: true to proceed',
        warning: 'This will delete all analytics data for the specified date'
      }, { status: 400 })
    }

    // Convert date string to Date object for Prisma
    const dateObj = new Date(date)
    
    // Check if data exists
    const count = await prisma.analyticsMaster.count({
      where: { snapshotDate: dateObj }
    })

    if (count === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No data found for this date',
        recordsDeleted: 0,
        date
      })
    }

    // Delete the zombie data
    const result = await prisma.analyticsMaster.deleteMany({
      where: { snapshotDate: dateObj }
    })

    // Also clean up sync status
    await prisma.dailySyncStatus.updateMany({
      where: { lastSyncDate: dateObj },
      data: {
        lastSyncSuccess: false,
        errorMessage: `Zombie data cleaned (${result.count} records removed) - ready for fresh sync`,
        totalRecords: 0
      }
    })

    return NextResponse.json({
      success: true,
      message: `Successfully deleted zombie data for ${date}`,
      recordsDeleted: result.count,
      date
    })

  } catch (error) {
    console.error('Error cleaning zombie data:', error)
    return NextResponse.json(
      { 
        error: 'Failed to clean zombie data', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
