import { NextRequest, NextResponse } from 'next/server'
import { FinancialAnalytics } from '@/lib/financial-analytics'
import { InstantUIManager } from '@/lib/instant-ui'
import { DatabaseHealthChecker } from '@/lib/database-health'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[FINANCIAL_API_FAST] Getting financial metrics...')
    
    // Check database health first (important for Replit PostgreSQL lifecycle)
    const isDbHealthy = await DatabaseHealthChecker.ensureAwake()
    if (!isDbHealthy) {
      console.warn('[FINANCIAL_API_FAST] Database health check failed, using fallback')
    }
    
    // Try instant UI first for immediate response
    let instantResult = null
    try {
      instantResult = InstantUIManager.getInstantData('financial')
      
      if (instantResult.hasData && instantResult.isToday) {
        console.log('[FINANCIAL_API_FAST] ⚡ Returning instant data')
        return NextResponse.json({
          success: true,
          metrics: instantResult.data,
          source: 'instant',
          timestamp: Date.now()
        })
      }
    } catch (instantError) {
      console.warn('[FINANCIAL_API_FAST] Instant data failed:', instantError)
    }
    
    // Fall back to cached computation with enhanced error handling
    console.log('[FINANCIAL_API_FAST] 🔄 Computing fresh data')
    let metrics = null
    
    try {
      metrics = await FinancialAnalytics.getFinancialMetrics()
      
      // Store for next instant access
      try {
        InstantUIManager.storeInstantData('financial', metrics)
      } catch (storeError) {
        console.warn('[FINANCIAL_API_FAST] Failed to store instant data:', storeError)
      }
      
      console.log('[FINANCIAL_API_FAST] ✅ Returning fresh financial metrics')
      return NextResponse.json({
        success: true,
        metrics,
        source: 'computed',
        timestamp: Date.now()
      })
      
    } catch (metricsError) {
      console.error('[FINANCIAL_API_FAST] Metrics calculation failed:', metricsError)
      
      // Try to return fallback data if available
      if (instantResult?.hasData) {
        console.log('[FINANCIAL_API_FAST] 🔄 Falling back to cached data')
        return NextResponse.json({
          success: true,
          metrics: instantResult.data,
          source: 'fallback_cache',
          warning: 'Using cached data due to calculation error',
          timestamp: Date.now()
        })
      }
      
      // If no fallback data, return default structure
      console.log('[FINANCIAL_API_FAST] 🔄 Returning default structure')
      return NextResponse.json({
        success: false,
        error: 'Unable to load financial data',
        message: 'Financial metrics are temporarily unavailable. Please try refreshing the page.',
        metrics: {
          actualMRR: 0,
          marketPotential: 0,
          vacancyLoss: 0,
          arpu: '0.00',
          guardrailsPass: false
        },
        source: 'default',
        timestamp: Date.now()
      }, { status: 503 })
    }

  } catch (error) {
    console.error('[FINANCIAL_API_FAST] ❌ Critical error:', error)
    
    // Always return JSON response, never let HTML error pages through
    const errorResponse = {
      success: false,
      error: 'server_error',
      message: 'Unable to load financial data. Please try refreshing the page.',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined,
      metrics: {
        actualMRR: 0,
        marketPotential: 0,
        vacancyLoss: 0,
        arpu: '0.00',
        guardrailsPass: false
      },
      timestamp: Date.now()
    }
    
    return NextResponse.json(errorResponse, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    })
  }
}