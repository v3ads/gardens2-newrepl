import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    console.log('[EMERGENCY_CLEAR_LOCKS] Request received')
    
    // Get current authenticated user
    const user = await getCurrentUser()
    
    // Check if user is authenticated
    if (!user || !user.email) {
      console.log('[EMERGENCY_CLEAR_LOCKS] Unauthorized - no authenticated user')
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }
    
    // Only allow Ayman to clear locks
    if (user.email !== 'vipaymanshalaby@gmail.com') {
      console.log('[EMERGENCY_CLEAR_LOCKS] Unauthorized - user not authorized:', user.email)
      return NextResponse.json({ 
        success: false,
        error: 'Only authorized admin can clear locks' 
      }, { status: 403 })
    }

    console.log('[EMERGENCY_CLEAR_LOCKS] Emergency lock clearing requested by admin:', user.email)
    
    const clearedItems: string[] = []
    
    // 1. Clear sync_locks table (stuck sync locks)
    try {
      const result = await prisma.$executeRaw`DELETE FROM sync_locks WHERE id = 'daily_sync_lock'`
      if (result > 0) {
        clearedItems.push(`Cleared ${result} sync lock(s) from sync_locks table`)
        console.log('[EMERGENCY_CLEAR_LOCKS] ✅ Cleared sync_locks:', result)
      }
    } catch (error) {
      console.error('[EMERGENCY_CLEAR_LOCKS] Error clearing sync_locks:', error)
      clearedItems.push(`Error clearing sync_locks: ${error instanceof Error ? error.message : 'Unknown'}`)
    }
    
    // 2. Release any PostgreSQL advisory locks
    try {
      await prisma.$executeRaw`SELECT pg_advisory_unlock_all()`
      clearedItems.push('Released all PostgreSQL advisory locks')
      console.log('[EMERGENCY_CLEAR_LOCKS] ✅ Released advisory locks')
    } catch (error) {
      console.error('[EMERGENCY_CLEAR_LOCKS] Error releasing advisory locks:', error)
      clearedItems.push(`Error releasing advisory locks: ${error instanceof Error ? error.message : 'Unknown'}`)
    }
    
    // 3. Cancel any stuck running jobs
    try {
      const result = await prisma.$executeRaw`
        UPDATE "job_queue" 
        SET status = 'CANCELLED', 
            "updated_at" = CURRENT_TIMESTAMP 
        WHERE status = 'RUNNING'
      `
      if (result > 0) {
        clearedItems.push(`Cancelled ${result} stuck running job(s)`)
        console.log('[EMERGENCY_CLEAR_LOCKS] ✅ Cancelled stuck jobs:', result)
      }
    } catch (error) {
      console.error('[EMERGENCY_CLEAR_LOCKS] Error cancelling jobs:', error)
      clearedItems.push(`Error cancelling jobs: ${error instanceof Error ? error.message : 'Unknown'}`)
    }
    
    // 4. Reset sync status error message
    try {
      await prisma.dailySyncStatus.update({
        where: { id: 'sync_status_singleton' },
        data: {
          errorMessage: null
        }
      })
      clearedItems.push('Cleared sync status error message')
      console.log('[EMERGENCY_CLEAR_LOCKS] ✅ Cleared error message')
    } catch (error) {
      console.error('[EMERGENCY_CLEAR_LOCKS] Error clearing error message:', error)
    }

    console.log('[EMERGENCY_CLEAR_LOCKS] ✅ Emergency lock clearing complete')
    return NextResponse.json({
      success: true,
      message: 'All locks and stuck processes cleared successfully',
      cleared_by: user.email,
      timestamp: new Date().toISOString(),
      actions_taken: clearedItems
    })
    
  } catch (error) {
    console.error('[EMERGENCY_CLEAR_LOCKS] Error clearing locks:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error while clearing locks',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
