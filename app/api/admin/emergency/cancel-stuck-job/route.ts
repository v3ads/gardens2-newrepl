import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Allow secret-based auth for emergency access
    const authHeader = request.headers.get('authorization')
    const secretKey = authHeader?.replace('Bearer ', '')
    const validSecret = process.env.CRON_SECRET || process.env.WEBHOOK_SECRET_KEY
    
    if (!secretKey || !validSecret || secretKey !== validSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { jobId } = body

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 })
    }

    // Mark the job as FAILED to cancel it
    const job = await prisma.jobQueue.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        lastError: 'Manually cancelled - stuck job cleanup'
      }
    })
    
    // Also update the job run if it exists
    await prisma.jobRun.updateMany({
      where: { 
        jobId: jobId,
        finishedAt: null
      },
      data: {
        finishedAt: new Date(),
        success: false
      }
    })

    // Also clear any sync locks
    await prisma.syncLock.deleteMany({})

    return NextResponse.json({
      success: true,
      message: `Successfully cancelled job ${jobId}`,
      job
    })

  } catch (error) {
    console.error('Error cancelling job:', error)
    return NextResponse.json(
      { 
        error: 'Failed to cancel job', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
