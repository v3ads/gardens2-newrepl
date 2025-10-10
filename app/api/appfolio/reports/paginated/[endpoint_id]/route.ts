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
  // GL-specific parameters
  last_edited_from_date?: string
  last_edited_to_date?: string
}

async function fetchAllPages(
  baseUrl: string, 
  headers: Record<string, string>,
  initialParams: AppFolioReportParams
): Promise<{
  allData: any[]
  totalPages: number
  totalRecords: number
}> {
  const allData: any[] = []
  let currentUrl = baseUrl
  let totalPages = 0
  let totalRecords = 0
  let pageNumber = 1
  
  // Build initial query string
  const validParams = Object.entries(initialParams)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`)
  
  // Add pagination enabled
  validParams.push('paginate_results=true')
  const queryString = validParams.length > 0 ? `?${validParams.join('&')}` : '?paginate_results=true'
  
  if (!currentUrl.includes('?')) {
    currentUrl = `${baseUrl}${queryString}`
  }

  console.log(`[APPFOLIO] Starting paginated fetch from: ${currentUrl}`)

  while (currentUrl && pageNumber <= 100) { // Safety limit to prevent infinite loops
    try {
      console.log(`[APPFOLIO] Fetching page ${pageNumber}: ${currentUrl}`)
      
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[APPFOLIO] Page ${pageNumber} error ${response.status}:`, errorText)
        break
      }

      const responseText = await response.text()
      const pageData = JSON.parse(responseText)
      
      // Handle different response structures
      if (Array.isArray(pageData)) {
        // Simple array response - no pagination metadata
        allData.push(...pageData)
        break
      } else if (pageData.data && Array.isArray(pageData.data)) {
        // Paginated response with metadata
        allData.push(...pageData.data)
        
        if (pageData.meta) {
          totalPages = pageData.meta.total_pages || 0
          totalRecords = pageData.meta.total_count || 0
          currentUrl = pageData.meta.next_page_url || null
        } else {
          break
        }
      } else {
        // Single object or unknown structure
        allData.push(pageData)
        break
      }
      
      pageNumber++
      
      // Brief delay between requests to avoid rate limiting
      if (currentUrl) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
    } catch (error) {
      console.error(`[APPFOLIO] Error fetching page ${pageNumber}:`, error)
      break
    }
  }
  
  return {
    allData,
    totalPages: totalPages || 1,
    totalRecords: totalRecords || allData.length
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
      last_edited_from_date: searchParams.get('last_edited_from_date') || undefined,
      last_edited_to_date: searchParams.get('last_edited_to_date') || undefined,
    }

    const resolvedParams = await params
    const baseUrl = `https://${tenantDomain}/api/v1/reports/${resolvedParams.endpoint_id}.json`
    const headers = {
      'Authorization': `Basic ${basicAuth}`,
      'Accept': 'application/json',
      'User-Agent': 'CynthiaGardens-CommandCenter/1.0'
    }
    
    console.log(`[APPFOLIO] Starting paginated fetch for report: ${resolvedParams.endpoint_id}`)
    
    const startTime = Date.now()
    const { allData, totalPages, totalRecords } = await fetchAllPages(baseUrl, headers, queryParams)
    const fetchDuration = Date.now() - startTime
    
    console.log(`[APPFOLIO] Completed paginated fetch: ${allData.length} records from ${totalPages} pages in ${fetchDuration}ms`)

    return NextResponse.json({
      success: true,
      endpoint_id: resolvedParams.endpoint_id,
      pagination: {
        total_records: totalRecords,
        total_pages: totalPages,
        fetched_records: allData.length,
        fetch_duration_ms: fetchDuration
      },
      data: allData,
      query_params: queryParams
    })
    
  } catch (error) {
    console.error('[APPFOLIO] Paginated report fetch error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch paginated AppFolio report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}