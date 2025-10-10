import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface AppFolioReportParams {
  columns?: string
  from_date?: string
  to_date?: string
  status?: string
  properties?: string
  property_groups?: string
  owners?: string
  accounting_basis?: string
  paginate_results?: string
  // GL-specific parameters
  last_edited_from_date?: string
  last_edited_to_date?: string
}

interface PaginatedResponse {
  data: any[]
  meta: {
    total_count: number
    current_page: number
    per_page: number
    total_pages: number
    next_page_url?: string
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ endpoint_id: string }> }
) {
  try {
    // Check authentication
    const clientId = process.env.APPFOLIO_CLIENT_ID
    const clientSecret = process.env.APPFOLIO_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      return NextResponse.json({ 
        error: 'AppFolio credentials not configured'
      }, { status: 401 })
    }

    const tenantDomain = process.env.APPFOLIO_TENANT_DOMAIN || 'cynthiagardens.appfolio.com'
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    
    // Extract query parameters
    const searchParams = request.nextUrl.searchParams
    const queryParams: AppFolioReportParams = {
      columns: searchParams.get('columns') || undefined,
      from_date: searchParams.get('from_date') || undefined,
      to_date: searchParams.get('to_date') || undefined,
      status: searchParams.get('status') || undefined,
      properties: searchParams.get('properties') || undefined,
      property_groups: searchParams.get('property_groups') || undefined,
      owners: searchParams.get('owners') || undefined,
      accounting_basis: searchParams.get('accounting_basis') || undefined,
      paginate_results: searchParams.get('paginate_results') || 'true',
      last_edited_from_date: searchParams.get('last_edited_from_date') || undefined,
      last_edited_to_date: searchParams.get('last_edited_to_date') || undefined,
    }

    // Build query string
    const validParams = Object.entries(queryParams)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`)
      .join('&')
    
    const resolvedParams = await params
    const queryString = validParams ? `?${validParams}` : ''
    const apiUrl = `https://${tenantDomain}/api/v1/reports/${resolvedParams.endpoint_id}.json${queryString}`
    
    console.log(`[APPFOLIO] Fetching report: ${resolvedParams.endpoint_id}`)
    console.log(`[APPFOLIO] URL: ${apiUrl}`)
    
    // Make request to AppFolio API
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json',
        'User-Agent': 'CynthiaGardens-CommandCenter/1.0'
      }
    })

    const responseText = await response.text()
    
    if (!response.ok) {
      console.error(`[APPFOLIO] API Error ${response.status}:`, responseText)
      return NextResponse.json({ 
        error: 'AppFolio API request failed',
        status: response.status,
        details: responseText
      }, { status: response.status })
    }

    // Parse JSON response
    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('[APPFOLIO] JSON parse error:', parseError)
      return NextResponse.json({ 
        error: 'Invalid JSON response from AppFolio API'
      }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      endpoint_id: resolvedParams.endpoint_id,
      data: data,
      query_params: queryParams,
      api_url: apiUrl
    })
    
  } catch (error) {
    console.error('[APPFOLIO] Report fetch error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch AppFolio report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}