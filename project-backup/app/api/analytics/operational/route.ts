/**
 * Operational Efficiency API
 * 
 * Provides comprehensive operational metrics including:
 * - Turnover rates and lease-up performance
 * - Make-ready cycle times and efficiency
 * - Work order metrics and maintenance compliance
 * - Cost analysis and vacancy management
 */

import { NextRequest, NextResponse } from 'next/server'

// Force Node runtime to prevent WebSocket bundling issues
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    console.log('[OPERATIONAL_API] Getting operational efficiency metrics from AppFolio data...')
    
    const searchParams = request.nextUrl.searchParams
    const t = searchParams.get('t') // Cache-busting timestamp
    
    console.log('[OPERATIONAL_API] 🔄 Computing operational metrics from AppFolio data...')
    
    // Use AppFolio-based operational analytics for 100% real data
    const { AppFolioOperationalAnalytics } = await import('@/lib/appfolio-operational-analytics')
    
    try {
      const appfolioMetrics = await AppFolioOperationalAnalytics.getOperationalMetrics()
      
      console.log('[OPERATIONAL_API] ✅ AppFolio operational metrics computed successfully:', {
        totalUnits: appfolioMetrics.totalUnits,
        occupancyRate: `${appfolioMetrics.occupancyRate}%`,
        turnoverRate: `${appfolioMetrics.turnoverRate12Mo}%`,
        maintenanceCosts: `$${appfolioMetrics.totalMaintenanceCosts}`,
        snapshotDate: appfolioMetrics.snapshotDate
      })

      // Structure response with base metrics (available) and advanced metrics (not available yet)
      const structuredResponse = {
        // Base metrics from AppFolio (always available)
        base: {
          turnoverRate12Mo: appfolioMetrics.turnoverRate12Mo,
          avgDaysVacant: appfolioMetrics.avgDaysVacant,
          recentMoveIns30d: appfolioMetrics.recentMoveIns30d,
          recentMoveOuts30d: appfolioMetrics.recentMoveOuts30d,
          maintenanceCostPerUnit: appfolioMetrics.maintenanceCostPerUnit,
          totalUnits: appfolioMetrics.totalUnits,
          occupiedUnits: appfolioMetrics.occupiedUnits,
          vacantUnits: appfolioMetrics.vacantUnits,
          occupancyRate: appfolioMetrics.occupancyRate
        },
        // Advanced metrics (now calculated from AppFolio data)
        advanced: {
          avgMakeReadyDays: appfolioMetrics.avgMakeReadyDays > 0 ? appfolioMetrics.avgMakeReadyDays : null,
          avgLeaseUpDays: appfolioMetrics.avgLeaseUpDays > 0 ? appfolioMetrics.avgLeaseUpDays : null,
          workOrderBacklog: null, // Requires work_order report data
          avgWorkOrderAge: null, // Requires work_order report data
          slaCompliance: null, // Requires work_order report data
          firstPassFixRate: null, // Requires work_order report data
          preventiveMaintenanceCompliance: null, // Requires work_order report data
          avgTurnCostPerUnit: null, // Requires cost analysis implementation
          maintenanceLinkedVacancyDays: appfolioMetrics.avgMaintenanceLinkedVacancyDays > 0 ? appfolioMetrics.avgMaintenanceLinkedVacancyDays : null,
          workOrdersPerOccupiedUnit30d: null, // Requires work_order report data
          readyUnits: appfolioMetrics.readyUnits || 0, // Real-time AppFolio count
          notReadyUnits: appfolioMetrics.notReadyUnits || 0 // Real-time AppFolio count
        },
        // Metadata
        meta: {
          capabilities: ['turnover_analysis', 'vacancy_metrics', 'lease_up_analysis', 'make_ready_tracking', 'maintenance_costs'],
          dataQuality: 'Hybrid: Real AppFolio data for unit counts, data-informed estimates for time-based metrics',
          dataSourcesUsed: appfolioMetrics.dataSourcesUsed,
          advancedMetricsNote: 'Unit readiness counts from real-time AppFolio data. Time-based metrics use data-informed estimates due to PostgreSQL date parsing constraints. Work order metrics require work_order report ingestion.',
          calculatedMetrics: {
            avgLeaseUpDays: appfolioMetrics.avgLeaseUpDays > 0 ? `${appfolioMetrics.avgLeaseUpDays} days average time vacant units stay on market` : 'Insufficient data for calculation',
            avgMakeReadyDays: appfolioMetrics.avgMakeReadyDays > 0 ? `${appfolioMetrics.avgMakeReadyDays} days estimated time to prepare units` : 'Insufficient data for calculation',
            readyVsNotReady: `${appfolioMetrics.readyUnits} ready vs ${appfolioMetrics.notReadyUnits} not ready units`,
            maintenanceLinkedVacancyDays: appfolioMetrics.avgMaintenanceLinkedVacancyDays > 0 ? `${appfolioMetrics.avgMaintenanceLinkedVacancyDays} days average for units not rent-ready` : 'Insufficient data for calculation'
          }
        },
        snapshotDate: appfolioMetrics.snapshotDate,
        calculatedAt: appfolioMetrics.calculatedAt
      }

      return NextResponse.json({
        success: true,
        data: structuredResponse,
        meta: {
          computedAt: appfolioMetrics.calculatedAt,
          snapshotDate: appfolioMetrics.snapshotDate,
          dataSourcesUsed: appfolioMetrics.dataSourcesUsed,
          dataQuality: 'Hybrid: Real AppFolio data for unit counts, data-informed estimates for time-based metrics',
          capabilities: structuredResponse.meta.capabilities
        }
      })
      
    } catch (appfolioAnalyticsError) {
      console.error('[OPERATIONAL_API] ❌ AppFolio analytics failed:', appfolioAnalyticsError)
      
      return NextResponse.json({
        success: false,
        error: 'Failed to compute operational metrics from AppFolio data',
        details: appfolioAnalyticsError instanceof Error ? appfolioAnalyticsError.message : 'Unknown error'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('[OPERATIONAL_API] ❌ Error getting operational metrics:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to compute operational efficiency metrics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Additional endpoint for specific metric categories
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { metrics, asOfDate } = body
    
    console.log('[OPERATIONAL_API] Getting specific operational metrics:', metrics)
    
    // This could be expanded to allow selective metric calculation
    // For now, return error as POST method is not implemented with the new approach
    throw new Error('POST method not implemented with simplified operational metrics')

  } catch (error) {
    console.error('[OPERATIONAL_API] ❌ Error getting filtered operational metrics:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to compute filtered operational metrics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}