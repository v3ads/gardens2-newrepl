import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    console.log('[TEST_PRISMA] Testing Prisma connection...')
    console.log('[TEST_PRISMA] Prisma client:', !!prisma)
    
    if (!prisma) {
      return NextResponse.json({
        success: false,
        error: 'Prisma client is undefined'
      }, { status: 500 })
    }

    // Test basic Prisma operations
    const userCount = await prisma.user.count()
    console.log('[TEST_PRISMA] User count:', userCount)
    
    // Test if PostgreSQL analytics models exist
    const reportCount = await prisma.reportCheckpoint.count()
    console.log('[TEST_PRISMA] Report checkpoint count:', reportCount)

    const integrationCount = await prisma.integrationState.count()
    console.log('[TEST_PRISMA] Integration state count:', integrationCount)

    return NextResponse.json({
      success: true,
      message: 'Prisma client working',
      stats: {
        user_count: userCount,
        report_checkpoint_count: reportCount,
        integration_state_count: integrationCount
      }
    })

  } catch (error) {
    console.error('[TEST_PRISMA] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}