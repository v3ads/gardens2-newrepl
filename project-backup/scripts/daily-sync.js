#!/usr/bin/env node

/**
 * Complete Daily Sync Script
 * 
 * This script runs the complete daily data refresh pipeline including:
 * - AppFolio data pulls
 * - Master CSV sync from Google Sheets
 * - Analytics rebuild (occupancy, financial, tenant demographics)
 * - Email notification with updated CSV
 * 
 * Designed to be executed by Replit's Scheduled Deployment at 7:00 AM Eastern.
 */

async function runCompleteDailySync() {
  console.log(`[SCHEDULED_SYNC] Starting complete daily sync at ${new Date().toISOString()}`)
  console.log('[SCHEDULED_SYNC] This includes: AppFolio data pulls + Master CSV + Analytics rebuild + Email notification')
  
  try {
    // Make HTTP request to the complete auto-sync endpoint
    const response = await fetch('http://localhost:3000/api/analytics/auto-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    if (result.success) {
      console.log(`[SCHEDULED_SYNC] ✅ Complete sync successful!`)
      console.log(`[SCHEDULED_SYNC] Duration: ${Math.round((result.sync_result?.duration || 0) / 1000)}s`)
      console.log(`[SCHEDULED_SYNC] Details:`, result.message)
      
      if (result.sync_result?.steps) {
        console.log('[SCHEDULED_SYNC] Pipeline steps completed:')
        result.sync_result.steps.forEach((step, index) => {
          console.log(`  ${index + 1}. ${step.name}: ${step.success ? '✅' : '❌'} (${step.duration}ms)`)
        })
      }
      
      // Email notification is included in the daily sync pipeline
      console.log('[SCHEDULED_SYNC] 📧 Email notification included in sync process')
      
    } else {
      console.error(`[SCHEDULED_SYNC] ❌ Sync failed: ${result.message}`)
      console.error('[SCHEDULED_SYNC] Error details:', result.error || 'No additional details')
      process.exit(1)
    }
    
  } catch (error) {
    console.error('[SCHEDULED_SYNC] ❌ Unexpected error:', error)
    process.exit(1)
  }
}

runCompleteDailySync()