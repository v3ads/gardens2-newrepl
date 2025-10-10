import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { jobQueueService } from '@/lib/job-queue-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Health Check Endpoint
 * 
 * This endpoint returns environment and database information to help verify
 * which deployment/environment webhooks are hitting. Useful for debugging
 * database mismatch issues.
 */
export async function GET(request: NextRequest) {
  try {
    // Extract database host from DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL || ''
    const databaseHost = databaseUrl.match(/@([^/]+)/)?.[1] || 'unknown'
    const databaseName = databaseUrl.match(/\/([^?]+)/)?.[1] || 'unknown'
    
    // Get deployment/environment info
    const deploymentId = process.env.REPLIT_DEPLOYMENT_ID || 'local'
    const nodeEnv = process.env.NODE_ENV || 'development'
    const replitEnv = process.env.REPL_SLUG || 'unknown'
    
    // Get queue status to verify database connectivity
    let queueStatus
    let databaseConnected = false
    try {
      queueStatus = await jobQueueService.getQueueStatus()
      databaseConnected = true
    } catch (error) {
      queueStatus = { error: 'Failed to connect to database' }
      databaseConnected = false
    }
    
    // Build response with environment fingerprint
    const healthData = {
      status: databaseConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: {
        deploymentId,
        nodeEnv,
        replitEnv,
        processId: process.pid,
        uptime: process.uptime()
      },
      database: {
        host: databaseHost,
        database: databaseName,
        connected: databaseConnected,
        // Fingerprint: First and last 4 chars of host for verification
        hostFingerprint: databaseHost.length > 8 
          ? `${databaseHost.substring(0, 4)}...${databaseHost.substring(databaseHost.length - 4)}`
          : databaseHost
      },
      queue: queueStatus,
      request: {
        host: request.headers.get('host'),
        userAgent: request.headers.get('user-agent'),
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      }
    }
    
    return NextResponse.json(healthData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Deployment-ID': deploymentId,
        'X-Database-Host': databaseHost.substring(0, 20) // First 20 chars only
      }
    })
    
  } catch (error) {
    console.error('[HEALTH] Health check failed:', error)
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
