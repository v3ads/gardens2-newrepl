import { NextRequest, NextResponse } from 'next/server'
import { jobMonitoringService } from '@/lib/job-monitoring-service'
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

    // Check if user has admin role
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action')

    switch (action) {
      case 'health-check':
        const healthCheck = await jobMonitoringService.performHealthCheck()
        return NextResponse.json({
          success: true,
          ...healthCheck,
          timestamp: new Date().toISOString()
        })

      case 'cleanup-stuck':
        const cleanedCount = await jobMonitoringService.cleanupStuckJobs()
        return NextResponse.json({
          success: true,
          cleanedStuckJobs: cleanedCount,
          message: `Cleaned up ${cleanedCount} stuck jobs`,
          timestamp: new Date().toISOString()
        })

      case 'metrics':
      default:
        const metrics = await jobMonitoringService.getMonitoringMetrics()
        return NextResponse.json({
          success: true,
          metrics,
          timestamp: new Date().toISOString()
        })
    }

  } catch (error: any) {
    console.error('[JOB_MONITOR_API] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication and admin access
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { action, ...body } = await request.json()

    switch (action) {
      case 'send-test-alert':
        // Send test alert to verify email delivery
        const testAlert = {
          type: 'failure' as const,
          severity: 'critical' as const,
          title: 'Test Alert',
          message: 'This is a test alert to verify email delivery functionality.',
          metadata: {
            triggeredBy: session.user.email,
            timestamp: new Date().toISOString()
          }
        }

        await jobMonitoringService.sendCriticalAlerts([testAlert])
        
        return NextResponse.json({
          success: true,
          message: 'Test alert sent successfully',
          timestamp: new Date().toISOString()
        })

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action',
          availableActions: ['send-test-alert']
        }, { status: 400 })
    }

  } catch (error: any) {
    console.error('[JOB_MONITOR_API] POST Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}