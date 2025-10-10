import { NextRequest, NextResponse } from 'next/server'
import { jobQueueService } from '@/lib/job-queue-service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Check authentication and admin access  
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const jobId = searchParams.get('jobId')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (jobId) {
      // Get specific job details
      const job = await jobQueueService.getRecentJobs(100).then(jobs => 
        jobs.find(j => j.id === jobId)
      )
      
      if (!job) {
        return NextResponse.json({
          success: false,
          error: 'Job not found'
        }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        job,
        timestamp: new Date().toISOString()
      })
    } else {
      // Get queue status and recent jobs
      const [queueStatus, recentJobs] = await Promise.all([
        jobQueueService.getQueueStatus(),
        jobQueueService.getRecentJobs(limit)
      ])

      return NextResponse.json({
        success: true,
        queueStatus,
        recentJobs: recentJobs.map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          runAt: job.runAt,
          lastError: job.lastError,
          jobRuns: job.jobRuns.map((run: any) => ({
            id: run.id,
            workerId: run.workerId,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            success: run.success,
            durationMs: run.durationMs,
            heartbeatAt: run.heartbeatAt,
            error: run.error
          }))
        })),
        timestamp: new Date().toISOString()
      })
    }

  } catch (error: any) {
    console.error('[JOB_STATUS_API] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication and admin access
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const jobId = searchParams.get('jobId')
    const action = searchParams.get('action')

    if (!jobId) {
      return NextResponse.json({
        success: false,
        error: 'jobId parameter required'
      }, { status: 400 })
    }

    switch (action) {
      case 'cancel':
        await jobQueueService.cancelJob(jobId)
        return NextResponse.json({
          success: true,
          message: `Job ${jobId} cancelled successfully`,
          timestamp: new Date().toISOString()
        })

      case 'cleanup':
        // For old jobs cleanup
        const olderThanDays = parseInt(searchParams.get('olderThanDays') || '7')
        const cleanedCount = await jobQueueService.cleanupOldJobs(olderThanDays)
        return NextResponse.json({
          success: true,
          cleanedCount,
          message: `Cleaned up ${cleanedCount} old jobs`,
          timestamp: new Date().toISOString()
        })

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: cancel, cleanup',
          availableActions: ['cancel', 'cleanup']
        }, { status: 400 })
    }

  } catch (error: any) {
    console.error('[JOB_STATUS_API] DELETE Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}