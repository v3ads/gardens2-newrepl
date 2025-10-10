import { NextRequest, NextResponse } from 'next/server'
import { jobQueueService } from '@/lib/job-queue-service'

export async function GET(req: NextRequest) {
  try {
    console.log('[MONITOR] 🔍 Running automated job monitoring and healing...')
    
    // Use same timeout as sync worker (configurable via SYNC_TIMEOUT_MINUTES env var)
    const timeoutMinutes = parseInt(process.env.SYNC_TIMEOUT_MINUTES || '180', 10)
    const stuckJobTimeoutMs = timeoutMinutes * 60 * 1000
    
    console.log(`[MONITOR] ⏱️  Using ${timeoutMinutes} minute timeout for stuck job detection`)
    
    // Clear stuck jobs older than configured timeout (default: 180 minutes)
    const clearedStuckJobs = await jobQueueService.clearStuckJobs(stuckJobTimeoutMs)
    
    // Get current status
    const { prisma } = await import('@/lib/prisma')
    
    const totalJobs = await prisma.jobQueue.count()
    const queuedJobs = await prisma.jobQueue.count({ where: { status: 'QUEUED' } })
    const runningJobs = await prisma.jobQueue.count({ where: { status: 'RUNNING' } })
    const completedJobs = await prisma.jobQueue.count({ where: { status: 'SUCCEEDED' } })
    const failedJobs = await prisma.jobQueue.count({ where: { status: 'FAILED' } })
    
    // Check for potential issues
    const warnings = []
    if (runningJobs > 5) warnings.push(`${runningJobs} running jobs (potential stuck jobs)`)
    if (failedJobs > completedJobs) warnings.push(`More failed (${failedJobs}) than completed (${completedJobs})`)
    if (queuedJobs === 0 && runningJobs === 0) warnings.push('No active jobs - system may be idle')
    
    console.log(`[MONITOR] ✅ Monitoring complete: cleared ${clearedStuckJobs} stuck jobs`)
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      clearedStuckJobs,
      status: {
        total: totalJobs,
        queued: queuedJobs,
        running: runningJobs,
        completed: completedJobs,
        failed: failedJobs
      },
      warnings,
      health: warnings.length === 0 ? 'HEALTHY' : 'ATTENTION_NEEDED'
    })
    
  } catch (error) {
    console.error('[MONITOR] ❌ Monitoring failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}