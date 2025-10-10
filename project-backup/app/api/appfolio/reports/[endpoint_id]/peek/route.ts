import { NextRequest, NextResponse } from 'next/server'

const VALID_REPORT_IDS = [
  'rent_roll',
  'unit_directory', 
  'lease_history',
  'unit_vacancy',
  'lease_expiration_detail'
]

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ endpoint_id: string }> }
) {
  const resolvedParams = await params
  const reportId = resolvedParams.endpoint_id
  
  try {
    
    if (!VALID_REPORT_IDS.includes(reportId)) {
      return NextResponse.json({
        success: false,
        error: `Invalid report ID. Must be one of: ${VALID_REPORT_IDS.join(', ')}`
      }, { status: 400 })
    }

    console.log(`[APPFOLIO_PEEK] Fetching field peek for ${reportId}...`)

    const clientId = process.env.APPFOLIO_CLIENT_ID
    const clientSecret = process.env.APPFOLIO_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      return NextResponse.json({
        success: false,
        error: 'AppFolio credentials not configured'
      }, { status: 400 })
    }

    // Get OAuth token
    const authResponse = await fetch('https://api.appfolio.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      })
    })

    if (!authResponse.ok) {
      return NextResponse.json({
        success: false,
        error: 'Failed to authenticate with AppFolio'
      }, { status: 401 })
    }

    const authData = await authResponse.json()
    const accessToken = authData.access_token

    // Determine tenant domain from client ID (extract domain part)
    let tenantDomain = 'cynthiagardens' // Default fallback
    try {
      // Extract tenant from client ID pattern if possible
      const match = clientId.match(/^([a-z0-9]+)_/)
      if (match) {
        tenantDomain = match[1]
      }
    } catch (error) {
      console.warn('[APPFOLIO_PEEK] Could not extract tenant from client ID, using default')
    }

    // Fetch one page of the report
    const reportUrl = `https://${tenantDomain}.appfolio.com/api/v1/reports/${reportId}.json?page=1&per_page=5`
    
    const reportResponse = await fetch(reportUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!reportResponse.ok) {
      const errorText = await reportResponse.text()
      return NextResponse.json({
        success: false,
        error: `Failed to fetch ${reportId} report: ${reportResponse.status} ${errorText}`
      }, { status: 500 })
    }

    const reportData = await reportResponse.json()
    
    // Extract keys and sample data
    const results = reportData.results || []
    const keys: string[] = []
    let sampleRow: { [key: string]: string } = {}

    if (results.length > 0) {
      const firstRow = results[0]
      keys.push(...Object.keys(firstRow).sort())
      
      // Create redacted sample (replace values with [REDACTED] for PII protection)
      for (const key of keys) {
        const value = firstRow[key]
        if (value === null || value === undefined || value === '') {
          sampleRow[key] = value
        } else {
          // Redact actual values for privacy
          sampleRow[key] = '[REDACTED]'
        }
      }
    }

    console.log(`[APPFOLIO_PEEK] ✅ Peek for ${reportId}: ${keys.length} columns, ${results.length} sample rows`)

    return NextResponse.json({
      success: true,
      data: {
        report_id: reportId,
        keys,
        sample: sampleRow,
        total_records: reportData.total_count || 0,
        fetched_at: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error(`[APPFOLIO_PEEK] Error peeking ${resolvedParams.endpoint_id}:`, error)
    return NextResponse.json({
      success: false,
      error: 'Failed to peek report fields',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}