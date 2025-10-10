import { NextResponse } from 'next/server'
import { jobQueueService } from '@/lib/job-queue-service'

// Force Node.js runtime for VM deployment
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin endpoint for manual sync - routes through job queue for consistency
export async function POST() {
  try {
    console.log('[ADMIN_SYNC] Manual sync triggered by admin - enqueueing job')
    
    // Enqueue manual sync job through job queue for consistency with webhook path
    const jobId = await jobQueueService.enqueueJob(
      'MANUAL_SYNC',
      {
        triggeredBy: 'admin_manual',
        syncType: 'manual',
        timestamp: new Date().toISOString()
      },
      {
        priority: 1, // High priority for admin requests
        dedupeKey: 'manual-sync-admin' // Prevent duplicate manual syncs
      }
    )

    const response = NextResponse.json({
      success: true,
      message: 'Manual sync job enqueued successfully - processing by background worker',
      jobId,
      note: 'Job will be processed by the background worker. Monitor job status via admin dashboard.'
    })

    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response

  } catch (error) {
    console.error('[ADMIN_SYNC] Failed to enqueue manual sync job:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to enqueue manual sync job',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}