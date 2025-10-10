/**
 * EMAIL RETRY QUEUE MANAGEMENT API
 * 
 * Admin endpoint for monitoring and managing the email retry queue
 */

import { NextRequest, NextResponse } from 'next/server'
import { emailRetryQueue } from '../../../../lib/email-retry-queue'
import { emailQueueProcessor } from '../../../../lib/email-queue-processor'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    switch (action) {
      case 'stats':
        const stats = await emailRetryQueue.getQueueStats()
        return NextResponse.json({ success: true, stats })

      case 'status':
        const processorStatus = emailQueueProcessor.getStatus()
        const queueStats = await emailRetryQueue.getQueueStats()
        return NextResponse.json({ 
          success: true, 
          processor: processorStatus,
          queue: queueStats
        })

      default:
        return NextResponse.json({ 
          success: true, 
          message: 'Email queue management API',
          availableActions: ['stats', 'status']
        })
    }

  } catch (error) {
    console.error('[EMAIL_QUEUE_API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process request' }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()

    switch (action) {
      case 'process':
        await emailQueueProcessor.processOnce()
        return NextResponse.json({ 
          success: true, 
          message: 'Email queue processed successfully' 
        })

      case 'start':
        emailQueueProcessor.start(5) // 5 minute intervals
        return NextResponse.json({ 
          success: true, 
          message: 'Email queue processor started' 
        })

      case 'stop':
        emailQueueProcessor.stop()
        return NextResponse.json({ 
          success: true, 
          message: 'Email queue processor stopped' 
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' }, 
          { status: 400 }
        )
    }

  } catch (error) {
    console.error('[EMAIL_QUEUE_API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process request' }, 
      { status: 500 }
    )
  }
}