import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { jobQueueService } from '@/lib/job-queue-service'

export async function POST(req: NextRequest) {
  // Verify authentication
  const headersList = headers()
  const authorization = headersList.get('authorization')
  
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
  }
  
  const token = authorization.split(' ')[1]
  if (token !== process.env.WEBHOOK_SECRET_KEY) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  try {
    console.log('[CLEAR_STUCK_JOBS] 🧹 Clearing all stuck jobs...')
    
    // Use same timeout as sync worker (configurable via SYNC_TIMEOUT_MINUTES env var)
    const timeoutMinutes = parseInt(process.env.SYNC_TIMEOUT_MINUTES || '180', 10)
    const stuckJobTimeoutMs = timeoutMinutes * 60 * 1000
    
    console.log(`[CLEAR_STUCK_JOBS] ⏱️  Using ${timeoutMinutes} minute timeout for stuck job detection`)
    
    // Clear all stuck jobs older than configured timeout (default: 180 minutes)
    const clearedJobs = await jobQueueService.clearStuckJobs(stuckJobTimeoutMs)
    
    console.log(`[CLEAR_STUCK_JOBS] ✅ Cleared ${clearedJobs} stuck jobs`)
    
    return NextResponse.json({
      success: true,
      message: `Cleared ${clearedJobs} stuck jobs`,
      clearedJobs,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[CLEAR_STUCK_JOBS] ❌ Error clearing stuck jobs:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}