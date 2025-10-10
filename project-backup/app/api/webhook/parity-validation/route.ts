/**
 * AUTOMATED PARITY VALIDATION WEBHOOK
 * 
 * Triggered daily to validate Phase 1 optimization parity between optimized and legacy sync methods.
 * Runs independently of the main sync process for continuous monitoring.
 * 
 * Scheduled to run: 6:30 AM Eastern (45 minutes after daily sync completion)
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    console.log('[PARITY_WEBHOOK] Daily parity validation webhook triggered')
    
    // Verify webhook authenticity with secret token
    const authHeader = request.headers.get('authorization')
    const webhookSecretHeader = request.headers.get('x-webhook-secret')
    const expectedSecret = process.env.WEBHOOK_SECRET_KEY
    
    if (!expectedSecret) {
      console.error('[PARITY_WEBHOOK] CRITICAL: Webhook secret not configured')
      return NextResponse.json({ 
        success: false, 
        error: 'Webhook authentication not configured',
        timestamp: new Date().toISOString()
      }, { status: 503 })
    }
    
    // Extract token from Authorization header or X-Webhook-Secret header
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
      console.error('[PARITY_WEBHOOK] Invalid webhook authorization')
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized webhook call' 
      }, { status: 401 })
    }
    
    console.log('[PARITY_WEBHOOK] ✅ Authorized webhook - starting parity validation...')
    
    // Start parity validation process
    try {
      const { ParityMonitor } = await import('@/lib/parity-monitor')
      
      // Run comprehensive parity validation
      const validationResult = await ParityMonitor.runParityValidation()
      
      const maxKpiVariance = Math.max(...Object.values(validationResult.variance.kpis).map(Number))
      // Calculate actual performance improvement multiplier
      const performanceImprovement = validationResult.legacyResult.duration / validationResult.optimizedResult.duration
      
      console.log(`[PARITY_WEBHOOK] ✅ Parity validation completed`)
      console.log(`[PARITY_WEBHOOK] Performance: ${performanceImprovement.toFixed(1)}x improvement`)
      console.log(`[PARITY_WEBHOOK] Max KPI variance: ${maxKpiVariance.toFixed(3)}%`)
      console.log(`[PARITY_WEBHOOK] Threshold passed: ${validationResult.passedThreshold ? 'YES' : 'NO'}`)
      
      if (validationResult.alerts.length > 0) {
        console.log(`[PARITY_WEBHOOK] Alerts: ${validationResult.alerts.join(', ')}`)
      }
      
      // Send email alert if critical variance detected
      if (!validationResult.passedThreshold) {
        console.error('[PARITY_WEBHOOK] 🚨 CRITICAL: Sending parity failure alert...')
        await sendParityAlert(validationResult)
      }
      
      return NextResponse.json({
        success: true,
        message: 'Parity validation completed successfully',
        timestamp: validationResult.timestamp,
        passedThreshold: validationResult.passedThreshold,
        performanceImprovement: performanceImprovement.toFixed(1),
        maxKpiVariance: maxKpiVariance.toFixed(3),
        alerts: validationResult.alerts,
        type: 'parity-validation-webhook'
      })
      
    } catch (error) {
      console.error('[PARITY_WEBHOOK] Error during parity validation:', error)
      
      // Send critical error alert
      await sendCriticalErrorAlert(error)
      
      return NextResponse.json({
        success: false,
        error: 'Parity validation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }

  } catch (error) {
    console.error('[PARITY_WEBHOOK] Error processing webhook:', error)
    
    return NextResponse.json({
      success: false, // Return failure so caller knows webhook failed
      message: 'Webhook processing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

/**
 * Send parity failure alert via email
 */
async function sendParityAlert(validationResult: any): Promise<void> {
  try {
    const { emailService } = await import('@/lib/email-service')
    
    const maxKpiVariance = Math.max(...Object.values(validationResult.variance.kpis).map(Number))
    const performanceImprovement = validationResult.legacyResult.duration / validationResult.optimizedResult.duration
    
    const alertSubject = `🚨 CRITICAL: Phase 1 Parity Validation Failed - ${maxKpiVariance.toFixed(3)}% Variance`
    
    const alertContent = `
CRITICAL ALERT: Phase 1 Delta Optimization Parity Validation Failed

⚠️ VARIANCE THRESHOLD EXCEEDED ⚠️

Validation Results:
• Max KPI Variance: ${maxKpiVariance.toFixed(3)}% (Threshold: 0.5%)
• Performance Improvement: ${performanceImprovement.toFixed(1)}x
• Timestamp: ${validationResult.timestamp}

Optimized Sync Results:
• Duration: ${validationResult.optimizedResult.duration}s
• Records: ${validationResult.optimizedResult.totalRecords}
• Occupancy Rate: ${validationResult.optimizedResult.kpis.occupancyRate}%

Legacy Sync (Estimated):
• Duration: ${validationResult.legacyResult.duration}s  
• Records: ${validationResult.legacyResult.totalRecords}
• Occupancy Rate: ${validationResult.legacyResult.kpis.occupancyRate}%

Alerts:
${validationResult.alerts.map((alert: string) => `• ${alert}`).join('\n')}

RECOMMENDED ACTIONS:
1. Review optimized sync configuration
2. Check for data drift or timing issues
3. Consider rollback to legacy sync if variance persists
4. Investigate root cause of KPI differences

This is an automated alert from Cynthia Gardens Command Center Phase 1 Validation System.
Generated at: ${new Date().toLocaleString()}
    `
    
    // Use basic email sending (simplified for now)
    console.log('[PARITY_WEBHOOK] 📧 Parity alert email would be sent:')
    console.log(alertSubject)
    console.log(alertContent)
    
  } catch (error) {
    console.error('[PARITY_WEBHOOK] Failed to send parity alert:', error)
  }
}

/**
 * Send critical error alert
 */
async function sendCriticalErrorAlert(error: any): Promise<void> {
  try {
    console.log('[PARITY_WEBHOOK] 📧 Critical error alert would be sent:')
    console.log(`Subject: 🚨 CRITICAL: Parity Validation System Error`)
    console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    console.log(`Timestamp: ${new Date().toISOString()}`)
    
  } catch (alertError) {
    console.error('[PARITY_WEBHOOK] Failed to send critical error alert:', alertError)
  }
}

// Handle GET requests for webhook verification/testing  
export async function GET() {
  return NextResponse.json({
    endpoint: 'parity-validation-webhook',
    methods: ['POST'],
    description: 'Automated daily parity validation for Phase 1 optimization',
    status: 'active',
    scheduled_time: '6:30 AM Eastern daily (45 minutes after sync)',
    authentication: 'Bearer token required',
    variance_threshold: '0.5%',
    alert_threshold: '0.1%',
    timestamp: new Date().toISOString()
  })
}