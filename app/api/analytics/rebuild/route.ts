import { NextRequest, NextResponse } from 'next/server'
import { FinancialAnalytics } from '@/lib/financial-analytics'
import { buildTenantMart } from '@/lib/tenant-etl'
import { requireAdminAuth } from '@/lib/auth-middleware'

export async function POST(request: NextRequest) {
  // Require admin authentication
  const authResult = await requireAdminAuth(request)
  if (!authResult.authorized) {
    return authResult.response!
  }
  
  console.log('[ANALYTICS_REBUILD] Starting analytics rebuild...')
  
  try {
    const body = await request.json().catch(() => ({}))
    const { categories } = body
    
    const results: Record<string, any> = {}
    
    // Handle specific categories or default to both
    const categoriesToBuild = categories || ['financial', 'tenants']
    
    for (const category of categoriesToBuild) {
      if (category === 'financial') {
        console.log('[ANALYTICS_REBUILD] Rebuilding financial analytics...')
        results.financial = await FinancialAnalytics.getFinancialMetrics()
        console.log('[ANALYTICS_REBUILD] Financial mart rebuilt:', results.financial)
      }
      
      if (category === 'tenants') {
        console.log('[ANALYTICS_REBUILD] Rebuilding tenant analytics...')
        results.tenants = await buildTenantMart()
        console.log('[ANALYTICS_REBUILD] Tenant mart rebuilt:', results.tenants)
      }
    }
    
    return NextResponse.json({
      success: true,
      scope: categories ? 'categories' : 'all',
      results
    })
    
  } catch (error) {
    console.error('[ANALYTICS_REBUILD] Error:', error)
    return NextResponse.json(
      { error: 'rebuild_failed', message: 'Analytics rebuild failed' },
      { status: 500 }
    )
  }
}