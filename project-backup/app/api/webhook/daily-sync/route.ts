import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { jobQueueService } from '@/lib/job-queue-service'
import { syncMaintenanceService } from '@/lib/sync-maintenance-service'
import { JobType } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // Force Node.js runtime for background execution

export async function POST(request: NextRequest) {
  try {
    console.log('[WEBHOOK] Daily sync webhook triggered by external scheduler')
    
    // Verify webhook authenticity with secret token (robust parsing)
    const authHeader = request.headers.get('authorization')
    const webhookSecretHeader = request.headers.get('x-webhook-secret')
    const expectedSecret = process.env.WEBHOOK_SECRET_KEY
    
    if (!expectedSecret) {
      console.error('[WEBHOOK] CRITICAL: WEBHOOK_SECRET_KEY not set in production! Sync cannot run.')
      return NextResponse.json({ 
        success: false, 
        error: 'Webhook authentication not configured - WEBHOOK_SECRET_KEY missing',
        message: 'Production webhook requires WEBHOOK_SECRET_KEY environment variable',
        timestamp: new Date().toISOString()
      }, { status: 503 })
    }
    
    // Extract token from Authorization header (Bearer scheme) or X-Webhook-Secret header
    let providedToken = null
    if (authHeader) {
      const parts = authHeader.trim().split(/\s+/)
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        providedToken = parts[1].trim()
      }
    }
    if (!providedToken && webhookSecretHeader) {
      providedToken = webhookSecretHeader.trim()
    }
    
    // Log diagnostic info (masked for security)
    const tokenMask = providedToken ? `${providedToken.substring(0, 4)}***${providedToken.substring(providedToken.length - 4)}` : 'none'
    const hostHeader = request.headers.get('host') || 'unknown'
    console.log(`[WEBHOOK] Auth check: token=${tokenMask}, host=${hostHeader}, expected_len=${expectedSecret.length}`)
    
    if (!providedToken || providedToken !== expectedSecret) {
      console.error('[WEBHOOK] Invalid webhook authorization - token mismatch')
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized webhook call' 
      }, { status: 401 })
    }
    
    // CRITICAL: Log environment info to detect deployment mismatches
    const databaseHost = process.env.DATABASE_URL?.match(/@([^/]+)/)?.[1] || 'unknown'
    const deploymentId = process.env.REPLIT_DEPLOYMENT_ID || 'local'
    console.log('[WEBHOOK] 🔍 Environment Check:', {
      deploymentId,
      databaseHost,
      hostname: request.headers.get('host'),
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent')
    })
    
    // CRITICAL: Perform pre-sync cleanup (release stuck locks and clear stuck jobs)
    console.log('[WEBHOOK] 🧹 Performing pre-sync cleanup before enqueueing new job...')
    try {
      const cleanupResult = await syncMaintenanceService.performPreSyncCleanup('webhook')
      console.log(`[WEBHOOK] ✅ Pre-sync cleanup complete - locks: ${cleanupResult.locksCleared}, jobs: ${cleanupResult.jobsCleared}`)
    } catch (cleanupError) {
      console.error('[WEBHOOK] ⚠️ Error during pre-sync cleanup (non-fatal):', cleanupError)
    }
    
    // Enqueue sync job to durable job queue (eliminates silent failures)
    try {
      const jobType = JobType.DAILY_SYNC
      console.log('[WEBHOOK] Enqueuing daily sync job to worker queue...')
      console.log('[WEBHOOK] DEBUG: jobType value =', jobType, 'typeof =', typeof jobType, 'JobType.DAILY_SYNC =', JobType.DAILY_SYNC)
      
      const jobId = await jobQueueService.enqueueJob(
        jobType, // JobType enum from Prisma client
        {
          syncType: 'webhook',
          triggeredBy: 'external-scheduler',
          timestamp: new Date().toISOString(),
          metadata: {
            webhookHost: request.headers.get('host'),
            userAgent: request.headers.get('user-agent'),
            requestId: crypto.randomUUID(),
            deploymentId,
            databaseHost
          }
        },
        {
          priority: 1, // High priority for webhook-triggered syncs
          maxAttempts: 3
          // NO DEDUPE - Always create fresh job for bulletproof testing!
        }
      )
      
      console.log(`[WEBHOOK] ✅ Sync job ${jobId} enqueued successfully`)
      
      // CRITICAL FIX: Verify job was actually persisted to database
      const verification = await jobQueueService.verifyJobExists(jobId)
      if (!verification.exists) {
        console.error('[WEBHOOK] 🚨 CRITICAL: Job created but not readable - DATABASE MISMATCH DETECTED!')
        console.error('[WEBHOOK] Job ID:', jobId)
        console.error('[WEBHOOK] Database:', databaseHost)
        console.error('[WEBHOOK] Deployment:', deploymentId)
        
        // Send critical alert email
        try {
          const { EmailService } = await import('@/lib/email-service')
          const emailService = new EmailService()
          await emailService.sendFailureNotification({
            type: 'critical_error',
            title: '🚨 CRITICAL: Webhook Database Mismatch Detected',
            description: `A webhook successfully created job ${jobId} but the job cannot be read back from the database. This indicates the webhook is hitting a deployment connected to a different database than production.`,
            severity: 'critical',
            details: {
              jobId,
              databaseHost,
              deploymentId,
              webhookHost: request.headers.get('host'),
              userAgent: request.headers.get('user-agent'),
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString(),
            recoveryActions: [
              'Verify Pabbly webhook is calling the correct production URL',
              'Check for stale deployments or preview environments',
              'Ensure all deployments use the same DATABASE_URL',
              'Review deployment routing and DNS configuration'
            ]
          })
        } catch (alertError) {
          console.error('[WEBHOOK] Failed to send database mismatch alert:', alertError)
        }
        
        return NextResponse.json({
          success: false,
          error: 'Database mismatch detected - job not persisted',
          jobId,
          warning: 'This webhook may be hitting a non-production environment',
          environment: { deploymentId, databaseHost },
          timestamp: new Date().toISOString()
        }, { status: 500 })
      }
      
      console.log(`[WEBHOOK] ✅ Job verification passed - job ${jobId} exists in database`)
      
      return NextResponse.json({
        success: true,
        message: 'Webhook received - sync job enqueued for background processing',
        jobId,
        verified: true,
        environment: { deploymentId, databaseHost },
        timestamp: new Date().toISOString(),
        type: 'daily-sync-webhook',
        architecture: 'job-queue-v2'
      })
      
    } catch (error) {
      console.error('[WEBHOOK] Error enqueuing sync job:', error)
      return NextResponse.json({
        success: false,
        error: 'Failed to enqueue sync job',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }

  } catch (error) {
    console.error('[WEBHOOK] Error processing webhook:', error)
    
    // Return failure for job queue errors (scheduler should retry)
    return NextResponse.json({
      success: false,
      message: 'Webhook processing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Handle GET requests for webhook verification/testing
export async function GET(request: NextRequest) {
  // Secure diagnostics endpoint - require same authentication as POST
  const authHeader = request.headers.get('authorization')
  const webhookSecretHeader = request.headers.get('x-webhook-secret')
  const expectedSecret = process.env.WEBHOOK_SECRET_KEY
  
  if (!expectedSecret) {
    return NextResponse.json({
      endpoint: 'daily-sync-webhook',
      methods: ['POST'],
      description: 'Webhook endpoint for daily sync jobs',
      status: 'configuration_error',
      timestamp: new Date().toISOString()
    }, { status: 503 })
  }
  
  // Extract and validate token (same logic as POST)
  let providedToken = null
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/)
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      providedToken = parts[1].trim()
    }
  }
  if (!providedToken && webhookSecretHeader) {
    providedToken = webhookSecretHeader.trim()
  }
  
  if (!providedToken || providedToken !== expectedSecret) {
    return NextResponse.json({
      endpoint: 'daily-sync-webhook',
      methods: ['POST'],
      description: 'Webhook endpoint for daily sync jobs',
      status: 'active',
      authentication: 'Bearer token required',
      timestamp: new Date().toISOString()
    })
  }
  
  // Authenticated request - show diagnostics
  try {
    const queueStatus = await jobQueueService.getQueueStatus()
    const recentJobs = await jobQueueService.getRecentJobs(5)
    
    return NextResponse.json({
      endpoint: 'daily-sync-webhook',
      methods: ['POST'],
      description: 'Enqueues daily sync jobs for background worker processing',
      status: 'active',
      architecture: 'job-queue-v2',
      scheduled_time: '5:45 AM Eastern daily',
      authentication: 'Bearer token required',
      queue_status: queueStatus,
      recent_jobs: recentJobs.map(job => ({
        id: job.id,
        type: job.type,
        status: job.status,
        createdAt: job.createdAt,
        attempts: job.attempts
      })),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      endpoint: 'daily-sync-webhook',
      status: 'error',
      error: 'Failed to get queue status',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}