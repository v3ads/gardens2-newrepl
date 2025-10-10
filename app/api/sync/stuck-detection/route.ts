import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { stuckSyncDetector } from '@/lib/stuck-sync-detector'

export async function GET() {
  //Require ADMIN role for accessing stuck sync status (except in dev mode)
  const session = await getServerSession(authOptions)
  
  // Allow in dev mode or for admin users
  const isDev = process.env.NODE_ENV === 'development'
  const isAdmin = session?.user && (session.user as any).role === 'ADMIN'
  
  if (!isDev && !isAdmin) {
    return NextResponse.json({
      success: false,
      error: 'Unauthorized - Admin access required'
    }, { status: 401 })
  }
  
  try {
    // Get read-only status without triggering recovery
    const status = await stuckSyncDetector.getStuckSyncStatus()
    
    const response = NextResponse.json({
      success: true,
      ...status,
      timestamp: new Date().toISOString()
    })
    
    // Prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response
    
  } catch (error) {
    console.error('Failed to check stuck sync status:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

export async function POST() {
  // Require ADMIN role for triggering recovery
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({
      success: false,
      error: 'Unauthorized - Admin access required for recovery operations'
    }, { status: 401 })
  }

  try {
    console.log('[STUCK_SYNC_API] Manual recovery triggered via API')
    
    // Trigger manual recovery of all stuck syncs
    const status = await stuckSyncDetector.forceRecoverAllStuckSyncs()
    
    return NextResponse.json({
      success: true,
      message: 'Recovery operation completed',
      ...status,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Failed to recover stuck syncs:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}