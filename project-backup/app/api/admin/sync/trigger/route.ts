import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { DailySyncManager } from '@/lib/daily-sync-manager'
import { jobQueueService } from '@/lib/job-queue-service'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

/**
 * Admin-only endpoint for triggering full sync via job queue
 * Protected by NextAuth session and email allowlist
 * Only accessible to vipaymanshalaby@gmail.com
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[ADMIN_SYNC_TRIGGER] Admin sync request received')
    
    // DEBUG: Log all cookies to diagnose session issue
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    console.log('[ADMIN_SYNC_TRIGGER] Cookies received:', allCookies.map(c => c.name))
    
    // Get current authenticated user - must pass request context to read session cookies
    const session = await getServerSession(authOptions)
    const user = session?.user
    
    console.log('[ADMIN_SYNC_TRIGGER] Session check:', { 
      hasSession: !!session, 
      hasUser: !!user, 
      email: user?.email,
      sessionKeys: session ? Object.keys(session) : []
    })
    
    // Check if user is authenticated
    if (!user || !user.email) {
      console.log('[ADMIN_SYNC_TRIGGER] Unauthorized - no authenticated user')
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }
    
    // Check if user is specifically authorized (vipaymanshalaby@gmail.com)
    if (user.email !== 'vipaymanshalaby@gmail.com') {
      console.log('[ADMIN_SYNC_TRIGGER] Unauthorized - user not in allowlist:', user.email)
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions'
      }, { status: 403 })
    }
    
    // CSRF Protection: Validate Origin/Referer headers (relaxed in development)
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')
    const host = request.headers.get('host')
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    if (!isDevelopment && !origin && !referer) {
      console.log('[ADMIN_SYNC_TRIGGER] CSRF protection - no origin or referer header')
      return NextResponse.json({
        success: false,
        error: 'Invalid request origin'
      }, { status: 403 })
    }
    
    if (!isDevelopment) {
      // Validate request origin matches our host
      const validOrigins = [
        `https://${host}`,
        `http://${host}`, // For development
        'https://gardencommand.com' // Production domain
      ]
      
      const requestOrigin = origin || new URL(referer!).origin
      if (!validOrigins.includes(requestOrigin)) {
        console.log('[ADMIN_SYNC_TRIGGER] CSRF protection - invalid origin:', requestOrigin)
        return NextResponse.json({
          success: false,
          error: 'Invalid request origin'
        }, { status: 403 })
      }
    } else {
      console.log('[ADMIN_SYNC_TRIGGER] Development mode - CSRF protection relaxed')
    }
    
    console.log('[ADMIN_SYNC_TRIGGER] Authorization successful for:', user.email)
    
    const syncManager = DailySyncManager.getInstance()
    
    // Check if sync is currently in progress
    if (await syncManager.isSyncInProgress()) {
      console.log('[ADMIN_SYNC_TRIGGER] Sync already in progress')
      return NextResponse.json({
        success: false,
        message: 'Sync already in progress',
        sync_in_progress: true
      }, { status: 409 })
    }
    
    // Check if sync already completed today (optional - admin might want to force)
    const today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'})
    const status = await syncManager.getSyncStatus()
    
    if (status.last_sync_date === today && status.last_sync_success) {
      console.log('[ADMIN_SYNC_TRIGGER] Sync already completed today - admin forcing re-sync')
      // Don't block admin from re-running sync if needed
    }
    
    console.log('[ADMIN_SYNC_TRIGGER] Enqueueing manual sync job via job queue...')
    
    // Enqueue manual sync job through job queue for processing by background worker
    const jobId = await jobQueueService.enqueueJob(
      'MANUAL_SYNC',
      {
        triggeredBy: user.email,
        syncType: 'manual',
        timestamp: new Date().toISOString()
      },
      {
        priority: 1, // High priority for admin requests
        dedupeKey: `manual_sync_${today}` // Prevent duplicate manual syncs on same day
      }
    )
    
    console.log('[ADMIN_SYNC_TRIGGER] Manual sync job enqueued successfully:', jobId)
    
    // Return 202 Accepted - sync will be processed by background worker
    const response = NextResponse.json({
      success: true,
      message: 'Full sync started successfully',
      job_id: jobId,
      status_endpoint: '/api/sync/status',
      timestamp: new Date().toISOString()
    }, { status: 202 })
    
    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response
    
  } catch (error) {
    console.error('[ADMIN_SYNC_TRIGGER] Failed to start admin sync:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to start sync operation',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Only allow POST method for this endpoint
export async function GET() {
  return NextResponse.json({
    success: false,
    error: 'Method not allowed - use POST'
  }, { status: 405 })
}
