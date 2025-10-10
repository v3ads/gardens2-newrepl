import { getOccupancyKPIs } from './occupancy-analytics'
import { upsertKPI, type OccupancyKPIData } from './occupancy-kpi-repository'

/**
 * Backfill occupancy KPIs for recent dates to provide immediate functionality
 */
export async function backfillOccupancyKPIs(daysBack: number = 30): Promise<void> {
  console.log(`[KPI_BACKFILL] Starting backfill for last ${daysBack} days...`)
  
  const today = new Date()
  const processedDates: string[] = []
  const errors: string[] = []
  
  for (let i = 0; i < daysBack; i++) {
    const targetDate = new Date(today)
    targetDate.setDate(targetDate.getDate() - i)
    const dateStr = targetDate.toISOString().split('T')[0]
    
    try {
      console.log(`[KPI_BACKFILL] Processing ${dateStr}...`)
      
      // Use existing analytics function to calculate KPIs for this date
      const kpis = await getOccupancyKPIs(dateStr)
      
      if (!kpis || !kpis.total_units || kpis.total_units === 0) {
        console.log(`[KPI_BACKFILL] No data for ${dateStr} - skipping`)
        continue
      }
      
      // Convert to repository format and store
      const kpiData: OccupancyKPIData = {
        snapshotDate: dateStr,
        scope: 'portfolio',
        totalUnits: kpis.total_units,
        occupiedUnits: kpis.occupied_units,
        vacantUnits: kpis.vacant_units,
        occupancyRatePct: kpis.occupancy_rate_pct || kpis.occupancy_all || 0,
        occupancyStudent: kpis.occupancy_student,
        occupancyNonStudent: kpis.occupancy_non_student,
        avgVacancyDays: kpis.avg_vacancy_days,
        moveInsMTD: kpis.move_ins_mtd || 0,
        moveOutsMTD: kpis.move_outs_mtd || 0,
        expirations30: kpis.expirations_30 || 0,
        expirations60: kpis.expirations_60 || 0,
        expirations90: kpis.expirations_90 || 0,
        calcVersion: 'v1-backfill'
      }
      
      const result = await upsertKPI(kpiData)
      processedDates.push(dateStr)
      
      console.log(`[KPI_BACKFILL] ✅ ${dateStr}: ${result.occupancyRatePct}% occupancy, ${result.totalUnits} units`)
      
    } catch (error) {
      const errorMsg = `${dateStr}: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMsg)
      console.warn(`[KPI_BACKFILL] ❌ Failed to process ${dateStr}:`, error)
      // Continue with next date instead of failing entirely
    }
  }
  
  console.log(`[KPI_BACKFILL] ✅ Backfill completed:`)
  console.log(`[KPI_BACKFILL] Successfully processed: ${processedDates.length} dates`)
  console.log(`[KPI_BACKFILL] Errors: ${errors.length}`)
  
  if (processedDates.length > 0) {
    console.log(`[KPI_BACKFILL] Date range: ${processedDates[processedDates.length - 1]} to ${processedDates[0]}`)
  }
  
  if (errors.length > 0) {
    console.log(`[KPI_BACKFILL] Errors encountered:`, errors.slice(0, 5))
  }
}

/**
 * Backfill a single date (useful for testing)
 */
export async function backfillSingleDate(dateStr: string): Promise<boolean> {
  try {
    console.log(`[KPI_BACKFILL] Processing single date: ${dateStr}`)
    
    const kpis = await getOccupancyKPIs(dateStr)
    
    if (!kpis || !kpis.total_units || kpis.total_units === 0) {
      console.log(`[KPI_BACKFILL] No data available for ${dateStr}`)
      return false
    }
    
    const kpiData: OccupancyKPIData = {
      snapshotDate: dateStr,
      scope: 'portfolio',
      totalUnits: kpis.total_units,
      occupiedUnits: kpis.occupied_units,
      vacantUnits: kpis.vacant_units,
      occupancyRatePct: kpis.occupancy_rate_pct || kpis.occupancy_all || 0,
      occupancyStudent: kpis.occupancy_student,
      occupancyNonStudent: kpis.occupancy_non_student,
      avgVacancyDays: kpis.avg_vacancy_days,
      moveInsMTD: kpis.move_ins_mtd || 0,
      moveOutsMTD: kpis.move_outs_mtd || 0,
      expirations30: kpis.expirations_30 || 0,
      expirations60: kpis.expirations_60 || 0,
      expirations90: kpis.expirations_90 || 0,
      calcVersion: 'v1-backfill'
    }
    
    const result = await upsertKPI(kpiData)
    console.log(`[KPI_BACKFILL] ✅ ${dateStr}: ${result.occupancyRatePct}% occupancy stored`)
    return true
    
  } catch (error) {
    console.error(`[KPI_BACKFILL] Failed to backfill ${dateStr}:`, error)
    return false
  }
}