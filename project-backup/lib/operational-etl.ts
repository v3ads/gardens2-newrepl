/**
 * Operational Data ETL - Transform Raw AppFolio Data into Operational Analytics
 * 
 * This ETL process transforms raw AppFolio sync data into structured operational
 * analytics tables for real-time operational metrics calculation.
 */

import { prisma } from './prisma'
import { withPrismaRetry } from './prisma-retry'

export interface OperationalETLResult {
  success: boolean
  recordsProcessed: number
  tablesUpdated: string[]
  error?: string
}

export class OperationalETL {
  
  /**
   * Run complete operational ETL process
   */
  public static async processOperationalData(): Promise<OperationalETLResult> {
    return withPrismaRetry(async () => {
      console.log('[OPERATIONAL_ETL] Starting operational data ETL process...')
      
      try {
        let totalRecords = 0
        const tablesUpdated: string[] = []

        // 1. Process Lease History from raw data
        console.log('[OPERATIONAL_ETL] Processing lease history...')
        const leaseResult = await this.processLeaseHistory()
        totalRecords += leaseResult.recordsProcessed
        if (leaseResult.recordsProcessed > 0) tablesUpdated.push('LeaseHistory')

        // 2. Process Unit Turn Details
        console.log('[OPERATIONAL_ETL] Processing unit turn details...')
        const turnResult = await this.processUnitTurnDetails()
        totalRecords += turnResult.recordsProcessed
        if (turnResult.recordsProcessed > 0) tablesUpdated.push('UnitTurnDetail')

        // 3. Process Unit Vacancy data
        console.log('[OPERATIONAL_ETL] Processing unit vacancy data...')
        const vacancyResult = await this.processUnitVacancy()
        totalRecords += vacancyResult.recordsProcessed
        if (vacancyResult.recordsProcessed > 0) tablesUpdated.push('UnitVacancy')

        console.log(`[OPERATIONAL_ETL] ✅ ETL completed: ${totalRecords} records processed across ${tablesUpdated.length} tables`)

        return {
          success: true,
          recordsProcessed: totalRecords,
          tablesUpdated
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[OPERATIONAL_ETL] ❌ ETL failed:', error)
        
        return {
          success: false,
          recordsProcessed: 0,
          tablesUpdated: [],
          error: errorMessage
        }
      }
    })
  }

  /**
   * Process lease history from raw AppFolio data
   */
  private static async processLeaseHistory(): Promise<{ recordsProcessed: number }> {
    try {
      // Get raw lease data with move-in/move-out information (12+ months for historical analysis)
      const rawLeases = await prisma.rawAppfolioLease.findMany({
        where: {
          ingestedAt: {
            gte: new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000) // Last 18 months for full historical analysis
          }
        }
      })

      let processedCount = 0

      for (const rawLease of rawLeases) {
        try {
          // payloadJson is already parsed as an object by Prisma
          const payload = rawLease.payloadJson as any
          
          // Skip if no tenant (vacant units)
          if (!payload.Tenant || !payload.TenantId) continue

          // Extract lease dates
          const moveInDate = payload.MoveIn ? this.parseAppFolioDate(payload.MoveIn) : null
          const moveOutDate = payload.MoveOut || payload.LastMoveOut ? 
            this.parseAppFolioDate(payload.MoveOut || payload.LastMoveOut) : null
          const leaseStart = payload.LeaseFrom ? this.parseAppFolioDate(payload.LeaseFrom) : null
          const leaseEnd = payload.LeaseTo ? this.parseAppFolioDate(payload.LeaseTo) : null

          if (!moveInDate && !leaseStart) continue // Need at least one date

          // Create or update lease history record using Drizzle
          const { db } = await import('../server/db')
          const { leaseHistory } = await import('../shared/schema')

          const recordId = `lease_${payload.UnitId}_${payload.TenantId}_${payload.OccupancyId || 'current'}`
          
          // Insert or update record using Drizzle
          await db.insert(leaseHistory)
            .values({
              id: recordId,
              unit: payload.Unit,
              tenantName: payload.Tenant,
              leaseStartDate: leaseStart,
              leaseEndDate: leaseEnd, 
              moveInDate: moveInDate,
              moveOutDate: moveOutDate,
              monthlyRent: this.parseMoneyAmount(payload.Rent),
              leaseType: payload.LeaseType || 'New',
              reasonForLeaving: payload.ReasonForLeaving || null
            })
            .onConflictDoUpdate({
              target: leaseHistory.id,
              set: {
                tenantName: payload.Tenant,
                leaseStartDate: leaseStart,
                leaseEndDate: leaseEnd,
                moveInDate: moveInDate,
                moveOutDate: moveOutDate,
                monthlyRent: this.parseMoneyAmount(payload.Rent),
                updatedAt: new Date()
              }
            })

          processedCount++

        } catch (recordError) {
          console.warn(`[OPERATIONAL_ETL] Error processing lease record ${rawLease.id}:`, recordError)
        }
      }

      console.log(`[OPERATIONAL_ETL] ✅ Processed ${processedCount} lease history records`)
      return { recordsProcessed: processedCount }

    } catch (error) {
      console.error('[OPERATIONAL_ETL] Error processing lease history:', error)
      return { recordsProcessed: 0 }
    }
  }

  /**
   * Process unit turn details from raw data
   */
  private static async processUnitTurnDetails(): Promise<{ recordsProcessed: number }> {
    try {
      // Get lease records with move-out data for turn analysis
      // Get historical lease records for turn analysis (12+ months for trends)
      const rawLeases = await prisma.rawAppfolioLease.findMany({
        where: {
          ingestedAt: {
            gte: new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000) // Last 18 months for complete turn analysis
          }
        }
      })

      let processedCount = 0

      // Filter for records with move-out data in JavaScript
      const recordsWithMoveOut = rawLeases.filter(lease => {
        try {
          const payload = lease.payloadJson as any
          return payload?.LastMoveOut && payload?.Unit
        } catch {
          return false
        }
      })

      for (const rawLease of recordsWithMoveOut) {
        try {
          // payloadJson is already parsed as an object by Prisma
          const payload = rawLease.payloadJson as any
          
          const moveOutDate = this.parseAppFolioDate(payload.LastMoveOut)
          const nextMoveIn = payload.MoveIn ? this.parseAppFolioDate(payload.MoveIn) : null

          if (!moveOutDate) continue

          // Calculate turn metrics
          const turnDays = nextMoveIn && moveOutDate ? 
            Math.ceil((new Date(nextMoveIn).getTime() - new Date(moveOutDate).getTime()) / (1000 * 60 * 60 * 24)) : null

          // Estimate make-ready time (60% of total turn time or 14 days default)
          const makeReadyDays = turnDays ? Math.round(turnDays * 0.6) : 14

          // Estimate turn cost based on market rent (1.2x monthly rent)
          const marketRent = this.parseMoneyAmount(payload.MarketRent) || 2000
          const estimatedTurnCost = marketRent * 1.2

          // Create or update unit turn detail using Drizzle
          const { db } = await import('../server/db')
          const { unitTurnDetail } = await import('../shared/schema')

          const turnId = `turn_${payload.UnitId}_${moveOutDate.replace(/-/g, '')}`
          
          await db.insert(unitTurnDetail)
            .values({
              id: turnId,
              unit: payload.Unit,
              turnStartDate: moveOutDate,
              moveOutDate: moveOutDate,
              nextMoveInDate: nextMoveIn,
              totalMakeReadyDays: makeReadyDays,
              totalDownDays: turnDays || makeReadyDays,
              turnCost: estimatedTurnCost
            })
            .onConflictDoUpdate({
              target: unitTurnDetail.id,
              set: {
                nextMoveInDate: nextMoveIn,
                totalMakeReadyDays: makeReadyDays,
                totalDownDays: turnDays || makeReadyDays,
                turnCost: estimatedTurnCost,
                updatedAt: new Date()
              }
            })

          processedCount++

        } catch (recordError) {
          console.warn(`[OPERATIONAL_ETL] Error processing turn record ${rawLease.id}:`, recordError)
        }
      }

      console.log(`[OPERATIONAL_ETL] ✅ Processed ${processedCount} unit turn records`)
      return { recordsProcessed: processedCount }

    } catch (error) {
      console.error('[OPERATIONAL_ETL] Error processing unit turns:', error)
      return { recordsProcessed: 0 }
    }
  }

  /**
   * Process unit vacancy data
   */
  private static async processUnitVacancy(): Promise<{ recordsProcessed: number }> {
    try {
      // Get historical lease records for vacancy analysis (12+ months for patterns)
      const allUnits = await prisma.rawAppfolioLease.findMany({
        where: {
          ingestedAt: {
            gte: new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000) // Last 18 months for vacancy trends
          }
        }
      })

      // Filter for vacant units in JavaScript
      const vacantUnits = allUnits.filter(unit => {
        try {
          const payload = unit.payloadJson as any
          return payload?.Status?.includes('Vacant')
        } catch {
          return false
        }
      })

      let processedCount = 0

      for (const rawUnit of vacantUnits) {
        try {
          const payload = rawUnit.payloadJson as any
          
          if (!payload.Unit || !payload.Status?.includes('Vacant')) continue

          const lastMoveOut = payload.LastMoveOut ? this.parseAppFolioDate(payload.LastMoveOut) : null
          const vacancyStartDate = lastMoveOut || new Date().toISOString().split('T')[0]

          // Calculate days vacant
          const daysVacant = Math.ceil(
            (new Date().getTime() - new Date(vacancyStartDate).getTime()) / (1000 * 60 * 60 * 24)
          )

          // Create or update unit vacancy using Drizzle
          const { db } = await import('../server/db')
          const { unitVacancy } = await import('../shared/schema')

          const vacancyId = `vacancy_${payload.UnitId}_${vacancyStartDate.replace(/-/g, '')}`
          
          await db.insert(unitVacancy)
            .values({
              id: vacancyId,
              unit: payload.Unit,
              vacancyStartDate: vacancyStartDate,
              daysVacant: daysVacant,
              marketRent: this.parseMoneyAmount(payload.MarketRent),
              vacancyReason: 'Move-out'
            })
            .onConflictDoUpdate({
              target: unitVacancy.id,
              set: {
                daysVacant: daysVacant,
                marketRent: this.parseMoneyAmount(payload.MarketRent),
                updatedAt: new Date()
              }
            })

          processedCount++

        } catch (recordError) {
          console.warn(`[OPERATIONAL_ETL] Error processing vacancy record ${rawUnit.id}:`, recordError)
        }
      }

      console.log(`[OPERATIONAL_ETL] ✅ Processed ${processedCount} unit vacancy records`)
      return { recordsProcessed: processedCount }

    } catch (error) {
      console.error('[OPERATIONAL_ETL] Error processing vacancies:', error)
      return { recordsProcessed: 0 }
    }
  }

  /**
   * Parse AppFolio date format to ISO string
   */
  private static parseAppFolioDate(dateStr: string): string | null {
    if (!dateStr || dateStr === 'null') return null

    try {
      // Handle MM/dd/yyyy format from AppFolio
      if (dateStr.includes('/')) {
        const [month, day, year] = dateStr.split('/')
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }
      
      // Handle ISO format
      if (dateStr.includes('-')) {
        return dateStr.split('T')[0] // Get just the date part
      }

      return null
    } catch (error) {
      console.warn(`[OPERATIONAL_ETL] Could not parse date: ${dateStr}`)
      return null
    }
  }

  /**
   * Parse money amounts from AppFolio (handles commas and formatting)
   */
  private static parseMoneyAmount(amountStr: string | null): number {
    if (!amountStr || amountStr === 'null') return 0
    
    try {
      // Remove commas, dollar signs, and convert to number
      const cleaned = amountStr.toString().replace(/[\$,]/g, '')
      const amount = parseFloat(cleaned)
      return isNaN(amount) ? 0 : amount
    } catch (error) {
      return 0
    }
  }
}