import { prisma } from './prisma'
import { withPrismaRetry } from './prisma-retry'
import { upsertKPI, type OccupancyKPIData } from './occupancy-kpi-repository'
import { normalizeUnitCode, isStudentUnit } from './units'

/**
 * Calculate average vacancy days from analytics_master data (authoritative source)
 * This uses the same days_vacant data that RentIQ uses, from master.csv
 */
async function calculateAverageVacancyDaysFromMaster(): Promise<number> {
  try {
    // Get vacancy data from analytics_master (authoritative source)
    const vacancyRecords = await prisma.$queryRaw<Array<{ daysVacant: number | null }>>`
      SELECT "daysVacant" 
      FROM analytics_master 
      WHERE "daysVacant" IS NOT NULL 
      AND "daysVacant" > 0
      ORDER BY "snapshotDate" DESC
    `
    
    if (vacancyRecords.length === 0) {
      console.log('[OCCUPANCY_BACKFILL] No vacancy data found in analytics_master')
      return 0
    }
    
    const totalVacancyDays = vacancyRecords.reduce((sum, record) => sum + (record.daysVacant || 0), 0)
    const averageVacancy = Math.round(totalVacancyDays / vacancyRecords.length)
    
    console.log(`[OCCUPANCY_BACKFILL] Average vacancy from analytics_master: ${averageVacancy} days (${vacancyRecords.length} vacant units)`)
    return averageVacancy
    
  } catch (error) {
    console.warn('[OCCUPANCY_BACKFILL] Error calculating vacancy from analytics_master:', error)
    return 0
  }
}

/**
 * Compute occupancy KPI data from raw AppFolio lease data
 * This function extracts essential occupancy metrics from the raw lease records
 * to provide immediate fallback data when pre-calculated KPIs are not available
 */
export async function computeOccupancyFromRawData(dateTarget: 'today' | 'yesterday' = 'yesterday'): Promise<OccupancyKPIData | null> {
  return withPrismaRetry(async () => {
    console.log('[OCCUPANCY_BACKFILL] Computing occupancy from raw lease data...')
    
    // Calculate target date
    const now = new Date()
    const targetDate = new Date(now)
    if (dateTarget === 'yesterday') {
      targetDate.setDate(targetDate.getDate() - 1)
    }
    const snapshotDate = targetDate.toISOString().split('T')[0]
    
    // Get all latest raw lease data (removing artificial limit for complete coverage)
    const rawLeases = await prisma.rawAppfolioLease.findMany({
      select: {
        payloadJson: true,
        ingestedAt: true
      },
      orderBy: { ingestedAt: 'desc' }
    })
    
    if (rawLeases.length === 0) {
      console.log('[OCCUPANCY_BACKFILL] No raw lease data available')
      return null
    }
    
    console.log(`[OCCUPANCY_BACKFILL] Processing ${rawLeases.length} raw lease records`)
    
    // Parse and analyze lease data
    const units = new Map<string, any>()
    let totalProcessed = 0
    
    for (const rawLease of rawLeases) {
      try {
        const lease = typeof rawLease.payloadJson === 'string' 
          ? JSON.parse(rawLease.payloadJson) 
          : rawLease.payloadJson
        
        // Extract unit information
        const unitCode = lease.Unit || lease.unit_code || lease.UnitAddress
        if (!unitCode) continue
        
        // Normalize unit code
        const unitCodeNorm = unitCode.toString().trim()
        
        // Determine occupancy status
        const status = lease.Status || lease.status || ''
        const isOccupied = status.toLowerCase().includes('current') || 
                          status.toLowerCase().includes('occupied') ||
                          status.toLowerCase().includes('active')
        
        // Extract tenant information
        const tenantName = lease.TenantName || lease.tenant_name || lease.Tenant
        
        // Use canonical student classification function
        const isStudent = isStudentUnit(unitCodeNorm)
        
        // Extract financial data
        const marketRent = parseFloat(lease.MarketRent || lease.market_rent || '0')
        const currentRent = parseFloat(lease.CurrentRent || lease.current_rent || '0')
        
        // Extract date information
        const moveIn = lease.MoveIn || lease.move_in_date
        const moveOut = lease.MoveOut || lease.move_out_date
        const leaseEnd = lease.LeaseEnd || lease.lease_end_date
        const lastMoveOut = lease.LastMoveOut || lease.last_move_out
        
        // Store or update unit information
        units.set(unitCodeNorm, {
          unitCode: unitCodeNorm,
          isOccupied,
          tenantName,
          isStudent,
          marketRent,
          currentRent,
          moveIn,
          moveOut,
          leaseEnd,
          lastMoveOut,
          status
        })
        
        totalProcessed++
      } catch (error) {
        console.warn('[OCCUPANCY_BACKFILL] Error parsing lease record:', error)
      }
    }
    
    console.log(`[OCCUPANCY_BACKFILL] Processed ${totalProcessed} lease records into ${units.size} unique units`)
    
    // Calculate occupancy metrics
    const totalUnits = units.size
    let occupiedUnits = 0
    let studentOccupied = 0
    let nonStudentOccupied = 0
    let totalMarketRent = 0
    let currentMonthMoveIns = 0
    let currentMonthMoveOuts = 0
    let expiring30Days = 0
    let expiring60Days = 0
    let expiring90Days = 0
    
    const currentMonth = targetDate.getMonth() + 1
    const currentYear = targetDate.getFullYear()
    const today = new Date()
    const in30Days = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000))
    const in60Days = new Date(today.getTime() + (60 * 24 * 60 * 60 * 1000))
    const in90Days = new Date(today.getTime() + (90 * 24 * 60 * 60 * 1000))
    
    for (const unit of units.values()) {
      if (unit.isOccupied) {
        occupiedUnits++
        if (unit.isStudent) {
          studentOccupied++
        } else {
          nonStudentOccupied++
        }
      }
      
      // Add to total market rent
      if (unit.marketRent > 0) {
        totalMarketRent += unit.marketRent
      }
      
      // Count move-ins for current month
      if (unit.moveIn) {
        const moveInDate = new Date(unit.moveIn)
        if (moveInDate.getMonth() + 1 === currentMonth && moveInDate.getFullYear() === currentYear) {
          currentMonthMoveIns++
        }
      }
      
      // Count move-outs for current month
      if (unit.moveOut) {
        const moveOutDate = new Date(unit.moveOut)
        if (moveOutDate.getMonth() + 1 === currentMonth && moveOutDate.getFullYear() === currentYear) {
          currentMonthMoveOuts++
        }
      }
      
      // Count lease expirations
      if (unit.leaseEnd) {
        const leaseEndDate = new Date(unit.leaseEnd)
        if (leaseEndDate <= in30Days && leaseEndDate > today) {
          expiring30Days++
        } else if (leaseEndDate <= in60Days && leaseEndDate > today) {
          expiring60Days++
        } else if (leaseEndDate <= in90Days && leaseEndDate > today) {
          expiring90Days++
        }
      }
    }
    
    const vacantUnits = totalUnits - occupiedUnits
    const occupancyRatePct = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0
    
    // Count total student and non-student units
    let totalStudentUnits = 0
    let totalNonStudentUnits = 0
    
    for (const unit of units.values()) {
      if (isStudentUnit(unit.unitCode)) {
        totalStudentUnits++
      } else {
        totalNonStudentUnits++
      }
    }
    
    // Calculate correct percentages using proper denominators
    const studentOccupancyPct = totalStudentUnits > 0 ? (studentOccupied / totalStudentUnits) * 100 : 0
    const nonStudentOccupancyPct = totalNonStudentUnits > 0 ? (nonStudentOccupied / totalNonStudentUnits) * 100 : 0
    
    const kpiData: OccupancyKPIData = {
      snapshotDate,
      scope: 'portfolio',
      totalUnits,
      occupiedUnits,
      vacantUnits,
      occupancyRatePct,
      occupancyStudent: Math.round(studentOccupancyPct * 100) / 100,
      occupancyNonStudent: Math.round(nonStudentOccupancyPct * 100) / 100,
      avgVacancyDays: await calculateAverageVacancyDaysFromMaster(),
      moveInsMTD: currentMonthMoveIns,
      moveOutsMTD: currentMonthMoveOuts,
      expirations30: expiring30Days,
      expirations60: expiring60Days,
      expirations90: expiring90Days,
      calcVersion: 'backfill-v1'
    }
    
    console.log(`[OCCUPANCY_BACKFILL] ✅ Computed occupancy: ${occupiedUnits}/${totalUnits} units (${occupancyRatePct.toFixed(1)}%)`)
    
    return kpiData
  })
}

/**
 * Backfill yesterday's occupancy data and save it to the KPI store
 * This ensures users always have data to see, even during sync operations
 */
export async function backfillYesterdayOccupancy(): Promise<boolean> {
  try {
    console.log('[OCCUPANCY_BACKFILL] Starting yesterday occupancy backfill...')
    
    const kpiData = await computeOccupancyFromRawData('yesterday')
    if (!kpiData) {
      console.error('[OCCUPANCY_BACKFILL] Failed to compute occupancy data')
      return false
    }
    
    // Save to KPI store
    const savedKPI = await upsertKPI(kpiData)
    console.log(`[OCCUPANCY_BACKFILL] ✅ Saved KPI for ${savedKPI.snapshotDate}`)
    
    return true
  } catch (error) {
    console.error('[OCCUPANCY_BACKFILL] Error during backfill:', error)
    return false
  }
}

/**
 * Backfill today's occupancy data and save it to the KPI store
 */
export async function backfillTodayOccupancy(): Promise<boolean> {
  try {
    console.log('[OCCUPANCY_BACKFILL] Starting today occupancy backfill...')
    
    const kpiData = await computeOccupancyFromRawData('today')
    if (!kpiData) {
      console.error('[OCCUPANCY_BACKFILL] Failed to compute occupancy data')
      return false
    }
    
    // Save to KPI store
    const savedKPI = await upsertKPI(kpiData)
    console.log(`[OCCUPANCY_BACKFILL] ✅ Saved KPI for ${savedKPI.snapshotDate}`)
    
    return true
  } catch (error) {
    console.error('[OCCUPANCY_BACKFILL] Error during backfill:', error)
    return false
  }
}