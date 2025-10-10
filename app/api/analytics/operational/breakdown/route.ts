/**
 * Operational Efficiency Breakdown API
 * 
 * Provides detailed breakdowns of operational metrics:
 * - Work order details by category, priority, status
 * - Turn cycle breakdowns with cost analysis  
 * - Lease-up performance by unit type/category
 * - Maintenance efficiency trends
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering for this route due to searchParams usage
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[OPERATIONAL_BREAKDOWN_API] Getting operational breakdowns...')
    
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category') || 'all' // workorders, turns, leaseup, maintenance
    const asOfDate = searchParams.get('asOf') || undefined
    
    const { db } = await import('@/server/db')
    const { workOrder, unitTurnDetail, unitVacancy, generalLedger } = await import('@/shared/schema')
    const { eq, and, gte, lte, sql, desc } = await import('drizzle-orm')
    
    let breakdownData: any = {}
    
    // Work Order Breakdown
    if (category === 'all' || category === 'workorders') {
      const woByStatus = await db
        .select({
          status: workOrder.status,
          count: sql<number>`count(*)`,
          avgDays: sql<number>`avg(CASE 
            WHEN ${workOrder.status} = 'Open' THEN DATE_PART('day', NOW() - ${workOrder.openedAt})
            ELSE ${workOrder.actualDays}
          END)`
        })
        .from(workOrder)
        .groupBy(workOrder.status)
        .orderBy(desc(sql`count(*)`))

      const woByCategory = await db
        .select({
          category: workOrder.category,
          count: sql<number>`count(*)`,
          avgCost: sql<number>`avg(${workOrder.totalCost})`,
          avgDays: sql<number>`avg(${workOrder.actualDays})`
        })
        .from(workOrder)
        .where(workOrder.status ? eq(workOrder.status, 'Completed') : sql`true`)
        .groupBy(workOrder.category)
        .orderBy(desc(sql`count(*)`))

      breakdownData.workOrders = {
        byStatus: woByStatus,
        byCategory: woByCategory
      }
    }

    // Turn Cycle Breakdown  
    if (category === 'all' || category === 'turns') {
      const turnBreakdown = await db
        .select({
          avgMakeReadyDays: sql<number>`avg(${unitTurnDetail.totalMakeReadyDays})`,
          avgTotalDownDays: sql<number>`avg(${unitTurnDetail.totalDownDays})`,
          avgTurnCost: sql<number>`avg(${unitTurnDetail.turnCost})`,
          completedTurns: sql<number>`count(*)`,
          minCost: sql<number>`min(${unitTurnDetail.turnCost})`,
          maxCost: sql<number>`max(${unitTurnDetail.turnCost})`
        })
        .from(unitTurnDetail)
        .where(
          and(
            sql`${unitTurnDetail.totalMakeReadyDays} IS NOT NULL`,
            sql`${unitTurnDetail.turnCost} IS NOT NULL`
          )
        )

      breakdownData.turns = turnBreakdown[0] || {}
    }

    // Lease-Up Performance Breakdown
    if (category === 'all' || category === 'leaseup') {
      const leaseUpBreakdown = await db
        .select({
          avgDaysToLease: sql<number>`avg(${unitVacancy.daysToLease})`,
          totalLeased: sql<number>`count(*)`,
          avgMarketRent: sql<number>`avg(${unitVacancy.marketRent})`,
          avgFinalRent: sql<number>`avg(${unitVacancy.finalRent})`,
          rentConcessionPct: sql<number>`
            avg(CASE 
              WHEN ${unitVacancy.marketRent} > 0 
              THEN ((${unitVacancy.marketRent} - ${unitVacancy.finalRent}) / ${unitVacancy.marketRent}) * 100
              ELSE 0 
            END)
          `
        })
        .from(unitVacancy)
        .where(
          and(
            sql`${unitVacancy.daysToLease} IS NOT NULL`,
            sql`${unitVacancy.leaseStartDate} IS NOT NULL`
          )
        )

      breakdownData.leaseUp = leaseUpBreakdown[0] || {}
    }

    // Maintenance Cost Breakdown
    if (category === 'all' || category === 'maintenance') {
      const maintenanceCosts = await db
        .select({
          category: generalLedger.category,
          totalCost: sql<number>`sum(${generalLedger.amount})`,
          avgCost: sql<number>`avg(${generalLedger.amount})`,
          transactionCount: sql<number>`count(*)`
        })
        .from(generalLedger)
        .where(
          and(
            sql`${generalLedger.category} ILIKE '%maintenance%' OR ${generalLedger.category} ILIKE '%repair%' OR ${generalLedger.category} ILIKE '%make-ready%'`,
            sql`${generalLedger.amount} IS NOT NULL`
          )
        )
        .groupBy(generalLedger.category)
        .orderBy(desc(sql`sum(${generalLedger.amount})`))

      breakdownData.maintenance = {
        byCategory: maintenanceCosts
      }
    }

    console.log('[OPERATIONAL_BREAKDOWN_API] ✅ Breakdown data computed for category:', category)

    return NextResponse.json({
      success: true,
      data: breakdownData,
      meta: {
        category,
        asOfDate: asOfDate || new Date().toISOString().split('T')[0],
        computedAt: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[OPERATIONAL_BREAKDOWN_API] ❌ Error getting operational breakdowns:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to compute operational breakdowns',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}