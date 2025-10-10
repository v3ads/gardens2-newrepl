import { NextRequest, NextResponse } from 'next/server'
import { MasterCSVSync } from '../../../../lib/master-csv-sync'
import { emailService } from '../../../../lib/email-service'

export async function POST(request: NextRequest) {
  try {
    console.log('[EMAIL_SYNC_TEST] Starting test email sync...')
    
    // Step 1: Trigger the master CSV sync 
    const result = await MasterCSVSync.syncMasterCSV()
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        message: `Sync failed: ${result.error}`,
        details: result
      }, { status: 500 })
    }

    // Step 2: Send email with current corrected metrics (using unified analytics)
    console.log('[EMAIL_SYNC_TEST] CSV sync completed, now sending email with CORRECTED metrics...')
    
    // Get current metrics from unified analytics (same as dashboard)
    const currentMetrics = await result.metrics
    
    console.log('[EMAIL_SYNC_TEST] Using CORRECTED financial numbers:', currentMetrics)

    const emailSent = await emailService.sendMasterCSVUpdate(result.csvFilePath!, currentMetrics)
    
    return NextResponse.json({
      success: result.success && emailSent,
      message: result.success && emailSent
        ? `✅ Sync completed and email sent! ${result.recordsProcessed} records processed.`
        : result.success 
          ? `⚠️ Sync completed but email failed. ${result.recordsProcessed} records processed.`
          : `❌ Sync failed: ${result.error}`,
      details: {
        ...result,
        emailSent,
        metrics: currentMetrics
      }
    })
    
  } catch (error) {
    console.error('[EMAIL_SYNC_TEST] ❌ Test failed:', error)
    
    return NextResponse.json({
      success: false,
      message: 'Test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}