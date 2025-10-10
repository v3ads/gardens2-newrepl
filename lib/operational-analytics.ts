/**
 * Operational Efficiency Analytics Engine
 * 
 * Calculates key operational metrics from property management data:
 * - Turnover rates and make-ready cycles
 * - Lease-up performance and vacancy analysis  
 * - Maintenance efficiency and work order metrics
 * - Cost analysis and preventive maintenance compliance
 */

import { eq, and, gte, lte, like, isNull, desc, asc, sql, between, or, isNotNull } from 'drizzle-orm'

// Types for operational metrics
interface OperationalMetrics {
  // Turnover & Leasing
  turnoverRate12Mo: number
  avgMakeReadyDays: number
  avgLeaseUpDays: number
  
  // Maintenance & Work Orders
  workOrderBacklog: number
  avgWorkOrderAge: number
  slaCompliance: number
  firstPassFixRate: number
  preventiveMaintenanceCompliance: number
  maintenanceLinkedVacancyDays: number
  
  // Financial
  avgTurnCostPerUnit: number
  workOrdersPerOccupiedUnit30d: number
  
  // Metadata
  snapshotDate: string
  totalOccupiedUnits: number
  calculatedAt: string
}

interface TurnoverData {
  moveOuts12Mo: number
  avgOccupiedUnits: number
  turnoverRate: number
}

interface MakeReadyData {
  avgDays: number
  completedTurns: number
  minDays: number
  maxDays: number
}

interface LeaseUpData {
  avgDays: number
  completedLeases: number
  minDays: number
  maxDays: number
}

interface WorkOrderMetrics {
  backlog: number
  avgAge: number
  slaCompliance: number
  firstPassRate: number
  preventiveCompliance: number
  totalOpen: number
  totalCompleted: number
}

export class OperationalAnalytics {
  
  /**
   * Get comprehensive operational efficiency metrics
   */
  public static async getOperationalMetrics(asOfDate?: string): Promise<OperationalMetrics> {
    const targetDate = asOfDate || new Date().toISOString().split('T')[0]
    
    try {
      console.log('[OPERATIONAL_ANALYTICS] Computing operational efficiency metrics...')
      
      // Validate data availability first
      const occupiedUnits = await this.getOccupiedUnitCount(targetDate)
      if (occupiedUnits === 0 || occupiedUnits === 141) {
        console.warn('[OPERATIONAL_ANALYTICS] ⚠️  Limited data available - metrics may be estimates')
      }
      
      // Calculate metrics sequentially to avoid overwhelming database connections
      console.log('[OPERATIONAL_ANALYTICS] 🔄 Calculating turnover rate...')
      const turnoverData = await this.calculateTurnoverRate(targetDate)
      
      console.log('[OPERATIONAL_ANALYTICS] 🔄 Calculating make-ready cycle...')
      const makeReadyData = await this.calculateMakeReadyCycle(targetDate)
      
      console.log('[OPERATIONAL_ANALYTICS] 🔄 Calculating lease-up time...')
      const leaseUpData = await this.calculateLeaseUpTime(targetDate)
      
      console.log('[OPERATIONAL_ANALYTICS] 🔄 Calculating work order metrics...')
      const workOrderMetrics = await this.calculateWorkOrderMetrics(targetDate)
      
      console.log('[OPERATIONAL_ANALYTICS] 🔄 Calculating turn costs...')
      const turnCostData = await this.calculateTurnCosts(targetDate)
      
      console.log('[OPERATIONAL_ANALYTICS] 🔄 Calculating vacancy data...')
      const vacancyData = await this.calculateMaintenanceLinkedVacancy(targetDate)

      console.log('[OPERATIONAL_ANALYTICS] 🔄 Using previously fetched occupied unit count...')
      
      const metrics: OperationalMetrics = {
        // Turnover & Leasing
        turnoverRate12Mo: turnoverData.turnoverRate,
        avgMakeReadyDays: makeReadyData.avgDays,
        avgLeaseUpDays: leaseUpData.avgDays,
        
        // Maintenance & Work Orders
        workOrderBacklog: workOrderMetrics.backlog,
        avgWorkOrderAge: workOrderMetrics.avgAge,
        slaCompliance: workOrderMetrics.slaCompliance,
        firstPassFixRate: workOrderMetrics.firstPassRate,
        preventiveMaintenanceCompliance: workOrderMetrics.preventiveCompliance,
        maintenanceLinkedVacancyDays: vacancyData.avgDaysPerUnit,
        
        // Financial
        avgTurnCostPerUnit: turnCostData.avgCostPerTurn,
        workOrdersPerOccupiedUnit30d: await this.calculateWOsPerOccupiedUnit(targetDate),
        
        // Metadata
        snapshotDate: targetDate,
        totalOccupiedUnits: occupiedUnits,
        calculatedAt: new Date().toISOString()
      }

      console.log('[OPERATIONAL_ANALYTICS] ✅ Metrics calculated successfully:', {
        turnoverRate: `${metrics.turnoverRate12Mo}%`,
        makeReadyDays: metrics.avgMakeReadyDays,
        leaseUpDays: metrics.avgLeaseUpDays,
        workOrderBacklog: metrics.workOrderBacklog
      })

      return metrics

    } catch (error) {
      console.error('[OPERATIONAL_ANALYTICS] ❌ Error calculating operational metrics:', error)
      throw error
    }
  }

  /**
   * Calculate 12-month turnover rate using available master data
   * Formula: (Estimated annual turnover / Current occupied units) * 100
   */
  private static async calculateTurnoverRate(asOfDate: string): Promise<TurnoverData> {
    try {
      const { db } = await import('../server/db')
      const { leaseHistory, occupancyDailyKPI } = await import('../shared/schema')

      // Try to get actual turnover data from lease history first
      const oneYearAgo = new Date(asOfDate)
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      
      const actualMoveOuts = await db
        .select({
          moveOuts: sql<number>`count(*)`
        })
        .from(leaseHistory)
        .where(
          and(
            gte(leaseHistory.moveOutDate, oneYearAgo.toISOString().split('T')[0]),
            lte(leaseHistory.moveOutDate, asOfDate),
            isNotNull(leaseHistory.moveOutDate)
          )
        )

      // Get current occupancy from KPI table
      const occupancyData = await db
        .select()
        .from(occupancyDailyKPI)
        .where(eq(occupancyDailyKPI.snapshotDate, asOfDate))
        .limit(1)

      const actualMoveOutCount = Number(actualMoveOuts[0]?.moveOuts || 0)
      const occupiedUnits = occupancyData[0]?.occupiedUnits || 200 // Fallback estimate

      if (actualMoveOutCount > 0 && occupiedUnits > 0) {
        // Use real data if available
        const turnoverRate = (actualMoveOutCount / occupiedUnits) * 100

        console.log(`[OPERATIONAL_ANALYTICS] Using REAL turnover data: ${actualMoveOutCount} actual move-outs / ${occupiedUnits} occupied units = ${turnoverRate.toFixed(1)}%`)

        return {
          moveOuts12Mo: actualMoveOutCount,
          avgOccupiedUnits: occupiedUnits,
          turnoverRate: Math.round(turnoverRate * 100) / 100
        }
      }

      // Fallback to industry estimate if no real data
      console.log('[OPERATIONAL_ANALYTICS] No real turnover data available, using industry estimate')
      const estimatedAnnualTurnover = Math.round(occupiedUnits * 0.20) // 20% industry average
      const turnoverRate = 20.0

      return {
        moveOuts12Mo: estimatedAnnualTurnover,
        avgOccupiedUnits: occupiedUnits,
        turnoverRate: turnoverRate
      }

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] ⚠️  Error calculating turnover from master data:', (error as any)?.message || 'Unknown error')
      return { moveOuts12Mo: 0, avgOccupiedUnits: 0, turnoverRate: 0 }
    }
  }

  /**
   * Calculate average make-ready cycle time
   * Primary: UnitTurnDetail.totalMakeReadyDays
   * Fallback: LeaseHistory (moveOut to next moveIn)
   */
  private static async calculateMakeReadyCycle(asOfDate: string): Promise<MakeReadyData> {
    try {
      const { db } = await import('../server/db')
      const { unitTurnDetail, leaseHistory } = await import('../shared/schema')

      // Try primary source: UnitTurnDetail
      const turnDetailResult = await db
        .select({
          avgDays: sql<number>`avg(${unitTurnDetail.totalMakeReadyDays})`,
          minDays: sql<number>`min(${unitTurnDetail.totalMakeReadyDays})`,
          maxDays: sql<number>`max(${unitTurnDetail.totalMakeReadyDays})`,
          count: sql<number>`count(*)`
        })
        .from(unitTurnDetail)
        .where(
          and(
            lte(unitTurnDetail.turnStartDate, asOfDate),
            isNotNull(unitTurnDetail.totalMakeReadyDays)
          )
        )

      const primaryData = turnDetailResult[0]
      if (primaryData && Number(primaryData.count) > 0) {
        return {
          avgDays: Math.round(Number(primaryData.avgDays || 0) * 10) / 10,
          minDays: Number(primaryData.minDays || 0),
          maxDays: Number(primaryData.maxDays || 0),
          completedTurns: Number(primaryData.count)
        }
      }

      // Fallback: Calculate from lease history
      console.log('[OPERATIONAL_ANALYTICS] Using lease history fallback for make-ready cycle')
      const fallbackResult = await this.calculateMakeReadyFromLeaseHistory(asOfDate)
      return fallbackResult

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] ⚠️  Make-ready data unavailable (likely empty tables):', (error as any)?.message || 'Unknown error')
      return { avgDays: 0, completedTurns: 0, minDays: 0, maxDays: 0 }
    }
  }

  /**
   * Fallback method: Calculate make-ready from lease history
   */
  private static async calculateMakeReadyFromLeaseHistory(asOfDate: string): Promise<MakeReadyData> {
    try {
      const { db } = await import('../server/db')
      const { leaseHistory } = await import('../shared/schema')

      // Get move-out to next move-in cycles
      const cycles = await db
        .select({
          unit: leaseHistory.unit,
          moveOutDate: leaseHistory.moveOutDate,
          nextMoveIn: sql<string>`
            (SELECT MIN("moveInDate") 
             FROM "LeaseHistory" lh2 
             WHERE lh2.unit = ${leaseHistory.unit}
               AND lh2."moveInDate" > ${leaseHistory.moveOutDate}
               AND lh2."moveInDate" <= ${asOfDate})
          `
        })
        .from(leaseHistory)
        .where(
          and(
            lte(leaseHistory.moveOutDate, asOfDate),
            isNotNull(leaseHistory.moveOutDate)
          )
        )

      // Calculate days between move-out and next move-in
      const validCycles = cycles
        .filter((cycle: any) => cycle.moveOutDate && cycle.nextMoveIn)
        .map((cycle: any) => {
          const moveOut = new Date(cycle.moveOutDate!)
          const moveIn = new Date(cycle.nextMoveIn!)
          const days = Math.ceil((moveIn.getTime() - moveOut.getTime()) / (1000 * 60 * 60 * 24))
          return days > 0 && days < 365 ? days : null // Filter out unrealistic values
        })
        .filter((days: number | null) => days !== null) as number[]

      if (validCycles.length === 0) {
        return { avgDays: 0, completedTurns: 0, minDays: 0, maxDays: 0 }
      }

      return {
        avgDays: Math.round(validCycles.reduce((sum, days) => sum + days, 0) / validCycles.length * 10) / 10,
        minDays: Math.min(...validCycles),
        maxDays: Math.max(...validCycles),
        completedTurns: validCycles.length
      }

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] Error in lease history fallback:', error)
      return { avgDays: 0, completedTurns: 0, minDays: 0, maxDays: 0 }
    }
  }

  /**
   * Calculate average lease-up time
   * From ready/marketed date to lease start
   */
  private static async calculateLeaseUpTime(asOfDate: string): Promise<LeaseUpData> {
    try {
      const { db } = await import('../server/db')
      const { unitVacancy } = await import('../shared/schema')

      const result = await db
        .select({
          avgDays: sql<number>`avg(${unitVacancy.daysToLease})`,
          minDays: sql<number>`min(${unitVacancy.daysToLease})`,
          maxDays: sql<number>`max(${unitVacancy.daysToLease})`,
          count: sql<number>`count(*)`
        })
        .from(unitVacancy)
        .where(
          and(
            lte(unitVacancy.leaseStartDate, asOfDate),
            isNotNull(unitVacancy.daysToLease),
            gte(unitVacancy.daysToLease, 0)
          )
        )

      const data = result[0]
      return {
        avgDays: Math.round(Number(data?.avgDays || 0) * 10) / 10,
        minDays: Number(data?.minDays || 0),
        maxDays: Number(data?.maxDays || 0),
        completedLeases: Number(data?.count || 0)
      }

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] Error calculating lease-up time:', error)
      return { avgDays: 0, completedLeases: 0, minDays: 0, maxDays: 0 }
    }
  }

  /**
   * Calculate work order metrics
   */
  private static async calculateWorkOrderMetrics(asOfDate: string): Promise<WorkOrderMetrics> {
    try {
      const { db } = await import('../server/db')
      const { workOrder } = await import('../shared/schema')

      // Current backlog (open work orders)
      const backlogResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(workOrder)
        .where(
          and(
            eq(workOrder.status, 'Open'),
            lte(workOrder.openedAt, new Date(asOfDate + 'T23:59:59'))
          )
        )

      const backlog = Number(backlogResult[0]?.count || 0)

      // Average age of open work orders
      const ageResult = await db
        .select({
          avgAge: sql<number>`avg(DATE_PART('day', ${sql`'${asOfDate}'::date`} - ${workOrder.openedAt}::date))`
        })
        .from(workOrder)
        .where(
          and(
            eq(workOrder.status, 'Open'),
            lte(workOrder.openedAt, new Date(asOfDate + 'T23:59:59'))
          )
        )

      const avgAge = Math.round(Number(ageResult[0]?.avgAge || 0) * 10) / 10

      // SLA compliance (completed within SLA days)
      const slaResult = await db
        .select({
          total: sql<number>`count(*)`,
          onTime: sql<number>`count(CASE WHEN ${workOrder.actualDays} <= ${workOrder.slaDays} THEN 1 END)`
        })
        .from(workOrder)
        .where(
          and(
            eq(workOrder.status, 'Completed'),
            isNotNull(workOrder.actualDays),
            isNotNull(workOrder.slaDays),
            lte(workOrder.completedAt, new Date(asOfDate + 'T23:59:59'))
          )
        )

      const slaData = slaResult[0]
      const slaCompliance = Number(slaData?.total || 0) > 0 
        ? Math.round((Number(slaData?.onTime || 0) / Number(slaData?.total)) * 100 * 10) / 10
        : 0

      // First-pass fix rate
      const firstPassRate = await this.calculateFirstPassFixRate(asOfDate)

      // Preventive maintenance compliance
      const preventiveCompliance = await this.calculatePreventiveMaintenanceCompliance(asOfDate)

      return {
        backlog,
        avgAge,
        slaCompliance,
        firstPassRate,
        preventiveCompliance,
        totalOpen: backlog,
        totalCompleted: Number(slaData?.total || 0)
      }

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] ⚠️  Work order data unavailable (likely empty tables):', (error as any)?.message || 'Unknown error')
      return {
        backlog: 0,
        avgAge: 0,
        slaCompliance: 0,
        firstPassRate: 0,
        preventiveCompliance: 0,
        totalOpen: 0,
        totalCompleted: 0
      }
    }
  }

  /**
   * Calculate first-pass fix rate
   * Based on reopen flags or multiple WOs on same unit/category within 7 days
   */
  private static async calculateFirstPassFixRate(asOfDate: string): Promise<number> {
    try {
      const { db } = await import('../server/db')
      const { workOrder } = await import('../shared/schema')

      // Method 1: Use reopen flags if available
      const reopenFlagResult = await db
        .select({
          total: sql<number>`count(*)`,
          reopened: sql<number>`count(CASE WHEN ${workOrder.isReopen} = true THEN 1 END)`
        })
        .from(workOrder)
        .where(
          and(
            eq(workOrder.status, 'Completed'),
            lte(workOrder.completedAt, new Date(asOfDate + 'T23:59:59'))
          )
        )

      const flagData = reopenFlagResult[0]
      if (Number(flagData?.total || 0) > 0) {
        const successRate = ((Number(flagData?.total || 0) - Number(flagData?.reopened || 0)) / Number(flagData?.total)) * 100
        return Math.round(successRate * 10) / 10
      }

      // Method 2: Infer from multiple WOs on same unit/category within 7 days
      const inferredResult = await this.inferFirstPassFixRate(asOfDate)
      return inferredResult

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] Error calculating first-pass fix rate:', error)
      return 0
    }
  }

  /**
   * Infer first-pass fix rate from work order patterns
   */
  private static async inferFirstPassFixRate(asOfDate: string): Promise<number> {
    try {
      const { db } = await import('../server/db')
      const { workOrder } = await import('../shared/schema')

      // Get all completed work orders
      const completedWOs = await db
        .select({
          id: workOrder.id,
          unit: workOrder.unit,
          category: workOrder.category,
          completedAt: workOrder.completedAt
        })
        .from(workOrder)
        .where(
          and(
            eq(workOrder.status, 'Completed'),
            lte(workOrder.completedAt, new Date(asOfDate + 'T23:59:59')),
            isNotNull(workOrder.unit),
            isNotNull(workOrder.category)
          )
        )
        .orderBy(asc(workOrder.completedAt))

      if (completedWOs.length === 0) return 0

      let successfulFixes = 0
      const processedWOs = new Set<string>()

      for (const wo of completedWOs) {
        if (processedWOs.has(wo.id)) continue

        // Look for follow-up WOs within 7 days
        const completedDate = new Date(wo.completedAt!)
        const sevenDaysLater = new Date(completedDate.getTime() + 7 * 24 * 60 * 60 * 1000)

        const followUpWOs = completedWOs.filter((followUp: any) => 
          followUp.unit === wo.unit &&
          followUp.category === wo.category &&
          followUp.id !== wo.id &&
          new Date(followUp.completedAt!) > completedDate &&
          new Date(followUp.completedAt!) <= sevenDaysLater
        )

        if (followUpWOs.length === 0) {
          successfulFixes++
        }

        processedWOs.add(wo.id)
        followUpWOs.forEach((followUp: any) => processedWOs.add(followUp.id))
      }

      const successRate = (successfulFixes / completedWOs.length) * 100
      return Math.round(successRate * 10) / 10

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] Error inferring first-pass fix rate:', error)
      return 0
    }
  }

  /**
   * Calculate preventive maintenance compliance
   */
  private static async calculatePreventiveMaintenanceCompliance(asOfDate: string): Promise<number> {
    try {
      const { db } = await import('../server/db')
      const { workOrder } = await import('../shared/schema')

      // Count preventive maintenance work orders
      const preventiveResult = await db
        .select({
          total: sql<number>`count(*)`,
          completed: sql<number>`count(CASE WHEN status = 'Completed' THEN 1 END)`
        })
        .from(workOrder)
        .where(
          and(
            or(
              eq(workOrder.isPreventive, true),
              like(workOrder.category, '%preventive%'),
              like(workOrder.category, '%PM%'),
              like(workOrder.subcategory, '%preventive%'),
              like(workOrder.subcategory, '%PM%')
            ),
            lte(workOrder.openedAt, new Date(asOfDate + 'T23:59:59'))
          )
        )

      const data = preventiveResult[0]
      const compliance = Number(data?.total || 0) > 0 
        ? (Number(data?.completed || 0) / Number(data?.total)) * 100
        : 0

      return Math.round(compliance * 10) / 10

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] Error calculating preventive maintenance compliance:', error)
      return 0
    }
  }

  /**
   * Calculate maintenance-linked vacancy days per unit
   */
  private static async calculateMaintenanceLinkedVacancy(asOfDate: string): Promise<{ avgDaysPerUnit: number }> {
    try {
      const { db } = await import('../server/db')
      const { unitVacancy, workOrder } = await import('../shared/schema')

      // Get vacancy periods that overlap with work orders
      const vacancyPeriods = await db
        .select({
          unit: unitVacancy.unit,
          vacancyStart: unitVacancy.vacancyStartDate,
          vacancyEnd: unitVacancy.vacancyEndDate,
          daysVacant: unitVacancy.daysVacant
        })
        .from(unitVacancy)
        .where(
          and(
            lte(unitVacancy.vacancyStartDate, asOfDate),
            isNotNull(unitVacancy.daysVacant)
          )
        )

      let totalMaintenanceLinkedDays = 0
      let unitsWithMaintenanceVacancy = 0

      for (const vacancy of vacancyPeriods) {
        if (!vacancy.unit) continue

        // Find overlapping work orders
        const overlappingWOs = await db
          .select({ count: sql<number>`count(*)` })
          .from(workOrder)
          .where(
            and(
              eq(workOrder.unit, vacancy.unit),
              gte(workOrder.openedAt, new Date(vacancy.vacancyStart + 'T00:00:00')),
              lte(workOrder.openedAt, new Date((vacancy.vacancyEnd || asOfDate) + 'T23:59:59'))
            )
          )

        if (Number(overlappingWOs[0]?.count || 0) > 0) {
          totalMaintenanceLinkedDays += Number(vacancy.daysVacant || 0)
          unitsWithMaintenanceVacancy++
        }
      }

      const avgDaysPerUnit = unitsWithMaintenanceVacancy > 0 
        ? totalMaintenanceLinkedDays / unitsWithMaintenanceVacancy
        : 0

      return { avgDaysPerUnit: Math.round(avgDaysPerUnit * 10) / 10 }

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] Error calculating maintenance-linked vacancy:', error)
      return { avgDaysPerUnit: 0 }
    }
  }

  /**
   * Calculate turn costs per move-out
   */
  private static async calculateTurnCosts(asOfDate: string): Promise<{ avgCostPerTurn: number }> {
    try {
      const { db } = await import('../server/db')
      const { generalLedger, unitTurnDetail } = await import('../shared/schema')

      // Get turn costs from general ledger
      const turnCosts = await db
        .select({
          totalCost: sql<number>`sum(${generalLedger.amount})`,
          turnCount: sql<number>`count(DISTINCT ${generalLedger.unit})`
        })
        .from(generalLedger)
        .where(
          and(
            lte(generalLedger.date, asOfDate),
            or(
              like(generalLedger.category, '%make-ready%'),
              like(generalLedger.category, '%turnover%'),
              like(generalLedger.account, '%turn%'),
              like(generalLedger.account, '%make%ready%')
            ),
            isNotNull(generalLedger.unit)
          )
        )

      const ledgerData = turnCosts[0]
      const avgFromLedger = Number(ledgerData?.turnCount || 0) > 0 
        ? Number(ledgerData?.totalCost || 0) / Number(ledgerData?.turnCount)
        : 0

      // Fallback: Use turn detail cost data
      if (avgFromLedger === 0) {
        const turnDetailCosts = await db
          .select({
            avgCost: sql<number>`avg(${unitTurnDetail.turnCost})`
          })
          .from(unitTurnDetail)
          .where(
            and(
              lte(unitTurnDetail.turnStartDate, asOfDate),
              isNotNull(unitTurnDetail.turnCost),
              gte(unitTurnDetail.turnCost, 0)
            )
          )

        return { avgCostPerTurn: Math.round(Number(turnDetailCosts[0]?.avgCost || 0) * 100) / 100 }
      }

      return { avgCostPerTurn: Math.round(avgFromLedger * 100) / 100 }

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] Error calculating turn costs:', error)
      return { avgCostPerTurn: 0 }
    }
  }

  /**
   * Calculate work orders per occupied unit (30-day rolling)
   */
  private static async calculateWOsPerOccupiedUnit(asOfDate: string): Promise<number> {
    try {
      const { db } = await import('../server/db')
      const { workOrder } = await import('../shared/schema')

      // Get date 30 days ago
      const date30DaysAgo = new Date(asOfDate)
      date30DaysAgo.setDate(date30DaysAgo.getDate() - 30)
      const startDate = date30DaysAgo.toISOString().split('T')[0]

      // Count work orders in last 30 days
      const woResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(workOrder)
        .where(
          and(
            gte(workOrder.openedAt, new Date(startDate + 'T00:00:00')),
            lte(workOrder.openedAt, new Date(asOfDate + 'T23:59:59'))
          )
        )

      const woCount = Number(woResult[0]?.count || 0)
      const occupiedUnits = await this.getOccupiedUnitCount(asOfDate)

      const ratio = occupiedUnits > 0 ? woCount / occupiedUnits : 0
      return Math.round(ratio * 100) / 100

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] Error calculating WOs per occupied unit:', error)
      return 0
    }
  }

  /**
   * Get occupied unit count from latest KPI data
   */
  private static async getOccupiedUnitCount(asOfDate: string): Promise<number> {
    try {
      const { db } = await import('../server/db')
      const { occupancyDailyKPI } = await import('../shared/schema')

      const result = await db
        .select({ occupiedUnits: occupancyDailyKPI.occupiedUnits })
        .from(occupancyDailyKPI)
        .where(lte(occupancyDailyKPI.snapshotDate, asOfDate))
        .orderBy(desc(occupancyDailyKPI.snapshotDate))
        .limit(1)

      const occupiedUnits = Number(result[0]?.occupiedUnits || 0)
      
      if (occupiedUnits > 0) {
        return occupiedUnits
      }
      
      // Fallback: Try to get from master CSV data
      const { prisma } = await import('./prisma')
      const masterData = await prisma.masterCsvData.findMany({
        where: {
          tenantStatus: {
            in: ['Current', 'Financially Responsible']
          }
        }
      })
      
      return masterData.length || 141 // Final fallback

    } catch (error) {
      console.warn('[OPERATIONAL_ANALYTICS] ⚠️  Occupied unit count unavailable, using fallback:', (error as any)?.message || 'Unknown error')
      return 141 // Use fallback from financial analytics
    }
  }
}


export type { OperationalMetrics, TurnoverData, MakeReadyData, LeaseUpData, WorkOrderMetrics }