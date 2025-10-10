import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [syncLock, runningJobs] = await Promise.all([
      prisma.$queryRaw<Array<{
        id: string
        sync_type: string
        current_step: number
        total_steps: number
        current_progress: string
        updated_at: Date
      }>>`
        SELECT id, sync_type, current_step, total_steps, current_progress, updated_at
        FROM sync_locks
        WHERE id = 'daily_sync_lock'
        LIMIT 1
      `,
      prisma.jobQueue.findMany({
        where: { status: 'RUNNING' },
        select: {
          id: true,
          type: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          lastError: true
        },
        orderBy: { updatedAt: 'desc' }
      })
    ])

    if (syncLock.length === 0 && runningJobs.length === 0) {
      return NextResponse.json({
        status: 'idle',
        message: 'No sync currently running',
        timestamp: new Date().toISOString()
      })
    }

    const lock = syncLock[0]
    const job = runningJobs[0]
    
    const now = new Date()
    const lastUpdate = lock ? new Date(lock.updated_at) : (job ? new Date(job.updatedAt) : now)
    const secondsSinceUpdate = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000)
    const isStuck = secondsSinceUpdate > 120 // No update in 2+ minutes = potentially stuck

    const elapsedTime = job ? Math.floor((now.getTime() - new Date(job.createdAt).getTime()) / 1000) : 0
    const elapsedMinutes = Math.floor(elapsedTime / 60)
    const elapsedSeconds = elapsedTime % 60

    return NextResponse.json({
      status: 'running',
      sync: lock ? {
        type: lock.sync_type,
        step: `${lock.current_step}/${lock.total_steps}`,
        progress: lock.current_progress,
        lastUpdate: lastUpdate.toISOString(),
        secondsSinceUpdate,
        isStuck
      } : null,
      job: job ? {
        id: job.id,
        type: job.type,
        elapsed: `${elapsedMinutes}m ${elapsedSeconds}s`,
        elapsedSeconds: elapsedTime,
        lastError: job.lastError
      } : null,
      warning: isStuck ? '⚠️ No progress update in 2+ minutes - sync may be stuck' : null,
      timestamp: now.toISOString()
    })
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
