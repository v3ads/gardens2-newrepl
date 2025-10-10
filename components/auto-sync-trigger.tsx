'use client'

import { useEffect } from 'react'

/**
 * Auto-sync trigger component - DISABLED
 * Autosync now happens via external scheduler at 5:30 AM Eastern daily
 * 
 * This component is now disabled because the user requested:
 * - No client-side "AppFolio ingestion flashing text" visible to users
 * - Daily sync at 5:30 AM Eastern via external scheduler only
 * - Users should not see sync activity in the UI
 */
export function AutoSyncTrigger() {
  useEffect(() => {
    // Disabled - sync now handled by external scheduler only
    console.log('[AUTO_SYNC_TRIGGER] Client-side auto-sync disabled - external scheduler active')
    return

    const checkAndTriggerAutoSync = async () => {
      try {
        // Check current server sync status first
        const statusResponse = await fetch('/api/sync/status', { cache: 'no-cache' })
        const serverStatus = await statusResponse.json()
        
        const now = new Date()
        const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
        const today = easternTime.toLocaleDateString('en-CA') // YYYY-MM-DD format
        
        // Check if sync already completed today
        if (serverStatus.lastSyncTime === today && serverStatus.lastSyncSuccess === true) {
          console.log('[AUTO_SYNC_TRIGGER] ✅ Daily sync already completed today:', today)
          return
        }
        
        // Check if sync is already in progress
        if (serverStatus.isSyncing === true) {
          console.log('[AUTO_SYNC_TRIGGER] 🔄 Sync already in progress...')
          return
        }
        
        // Check sessionStorage to prevent multiple triggers from same session
        const lastRun = sessionStorage.getItem('auto_sync_last_run')
        if (lastRun === today) {
          console.log('[AUTO_SYNC_TRIGGER] Already attempted sync today in this session')
          return
        }
        
        // Determine if we should trigger sync based on user's policy
        let shouldSync = false
        let syncReason = ''
        
        // Policy 1: 7:30 AM Eastern daily trigger (with 15-minute window)
        const currentHour = easternTime.getHours()
        const currentMinute = easternTime.getMinutes()
        const timeInMinutes = currentHour * 60 + currentMinute
        const targetTime = 7 * 60 + 30 // 7:30 AM in minutes
        const window = 15 // 15-minute window
        
        if (timeInMinutes >= targetTime && timeInMinutes <= targetTime + window) {
          shouldSync = true
          syncReason = 'daily_730am_eastern'
        }
        
        // Policy 2: First login of the day fallback (if past 8:00 AM and no successful sync today)
        if (!shouldSync && currentHour >= 8 && (serverStatus.lastSyncTime !== today || serverStatus.lastSyncSuccess !== true)) {
          shouldSync = true
          syncReason = 'first_login_fallback'
        }
        
        if (shouldSync) {
          console.log(`[AUTO_SYNC_TRIGGER] Triggering sync - Reason: ${syncReason}`)
          
          // Mark this session to prevent duplicate attempts
          sessionStorage.setItem('auto_sync_last_run', today)
          
          // Trigger the sync using client-safe auto-sync endpoint (no auth required)
          const syncResponse = await fetch('/api/cron-secret', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          })
          
          if (syncResponse.ok) {
            const syncResult = await syncResponse.json()
            console.log('[AUTO_SYNC_TRIGGER] ✅ Sync triggered successfully:', syncResult)
          } else {
            const errorData = await syncResponse.json().catch(() => ({ message: 'Unknown error' }))
            console.log('[AUTO_SYNC_TRIGGER] ❌ Sync trigger failed:', errorData.message)
          }
        } else {
          console.log(`[AUTO_SYNC_TRIGGER] No sync needed - Time: ${easternTime.toLocaleTimeString()}, Last sync: ${serverStatus.lastSyncTime}`)
        }
        
      } catch (error) {
        console.error('[AUTO_SYNC_TRIGGER] Error in auto-sync check:', error)
      }
    }

    // Run the auto-sync check
    checkAndTriggerAutoSync()
  }, [])

  // This component doesn't render anything - it's just for the side effect
  return null
}