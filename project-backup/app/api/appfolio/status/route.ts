import { NextResponse } from 'next/server'
import { analyticsDb } from '@/lib/analytics-db-pg'

export async function GET() {
  try {
    // Check if required secrets exist (server-side only)
    const hasClientId = !!process.env.APPFOLIO_CLIENT_ID
    const hasClientSecret = !!process.env.APPFOLIO_CLIENT_SECRET
    const hasSecrets = hasClientId && hasClientSecret
    
    // Get environment variables
    const tenantDomain = process.env.APPFOLIO_TENANT_DOMAIN || 'cynthiagardens.appfolio.com'
    const apiBaseUrl = `https://${tenantDomain}/api/v1`
    
    // Get actual connection status from report_checkpoints
    const statusQuery = analyticsDb.prepare(`
      SELECT 
        MAX(last_ingested_at) as lastSync,
        COUNT(*) as totalReports,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successfulReports
      FROM report_checkpoints
    `)
    const statusResult = statusQuery.get() as {
      lastSync: string | null
      totalReports: number
      successfulReports: number
    }
    
    const isConnected = hasSecrets && (statusResult?.successfulReports > 0)
    const lastSync = statusResult?.lastSync || null
    
    return NextResponse.json({
      hasSecrets,
      isConnected,
      lastSync,
      config: {
        tenantDomain,
        apiBaseUrl,
        authMethod: 'HTTP Basic'
      }
    })
    
  } catch (error) {
    console.error('[APPFOLIO] Status check error:', error)
    return NextResponse.json({ 
      error: 'Unable to check AppFolio status'
    }, { status: 500 })
  }
}