#!/usr/bin/env node

/**
 * Automated Daily Parity Validation Script
 * 
 * This script validates Phase 1 delta optimization parity by comparing optimized vs legacy sync results.
 * Designed to be executed by external scheduler at 6:30 AM Eastern (45 minutes after daily sync).
 * 
 * Key Features:
 * - <0.5% KPI variance threshold validation
 * - Performance improvement verification (~87x expected)
 * - Critical alerting for variance threshold breaches
 * - Historical tracking for trend analysis
 */

async function runParityValidation() {
  console.log(`[PARITY_SCRIPT] Starting automated parity validation at ${new Date().toISOString()}`)
  console.log('[PARITY_SCRIPT] Validating Phase 1 optimization: Optimized vs Legacy sync comparison')
  
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET_KEY
    
    if (!webhookSecret) {
      console.error('[PARITY_SCRIPT] ❌ CRITICAL: No webhook secret configured')
      console.error('[PARITY_SCRIPT] Set WEBHOOK_SECRET_KEY environment variable')
      process.exit(1)
    }

    // Determine the correct host based on environment
    const host = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : 'http://localhost:5000'
    
    console.log(`[PARITY_SCRIPT] Making request to: ${host}/api/webhook/parity-validation`)
    
    // Make HTTP request to the parity validation webhook
    const response = await fetch(`${host}/api/webhook/parity-validation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${webhookSecret}`,
        'X-Webhook-Secret': webhookSecret
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    
    if (result.success) {
      console.log(`[PARITY_SCRIPT] ✅ Parity validation completed successfully!`)
      console.log(`[PARITY_SCRIPT] Performance improvement: ${result.performanceImprovement}x`)
      console.log(`[PARITY_SCRIPT] Max KPI variance: ${result.maxKpiVariance}%`)
      console.log(`[PARITY_SCRIPT] Threshold passed: ${result.passedThreshold ? 'YES' : 'NO'}`)
      
      if (result.alerts && result.alerts.length > 0) {
        console.log(`[PARITY_SCRIPT] Alerts: ${result.alerts.join(', ')}`)
      }
      
      // Critical threshold check
      if (!result.passedThreshold) {
        console.error('[PARITY_SCRIPT] 🚨 CRITICAL: Parity validation failed - variance exceeds 0.5% threshold')
        console.error('[PARITY_SCRIPT] RECOMMENDED ACTIONS:')
        console.error('[PARITY_SCRIPT] 1. Review optimized sync configuration')
        console.error('[PARITY_SCRIPT] 2. Check for data drift or timing issues') 
        console.error('[PARITY_SCRIPT] 3. Consider rollback to legacy sync if variance persists')
        process.exit(1)
      }
      
      // Performance degradation check
      const performanceNum = parseFloat(result.performanceImprovement)
      if (performanceNum < 50) {
        console.warn('[PARITY_SCRIPT] ⚠️ WARNING: Performance improvement below expected')
        console.warn(`[PARITY_SCRIPT] Current: ${performanceNum}x, Expected: ~87x`)
      }
      
      console.log('[PARITY_SCRIPT] 🎯 Phase 1 optimization validated successfully - ready for Phase 2 consideration')
      
    } else {
      console.error(`[PARITY_SCRIPT] ❌ Parity validation failed: ${result.message || result.error}`)
      console.error('[PARITY_SCRIPT] This may indicate issues with Phase 1 optimization')
      process.exit(1)
    }
    
  } catch (error) {
    console.error('[PARITY_SCRIPT] ❌ Unexpected error during parity validation:', error)
    console.error('[PARITY_SCRIPT] This is a critical system issue requiring immediate attention')
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[PARITY_SCRIPT] Received SIGINT, shutting down gracefully')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[PARITY_SCRIPT] Received SIGTERM, shutting down gracefully')
  process.exit(0)
})

runParityValidation()