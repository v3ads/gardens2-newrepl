/**
 * Centralized Expiring Units Logic
 * 
 * This module provides a single source of truth for expiring units calculations
 * with correct date boundary logic to fix inconsistent results.
 * 
 * ROOT CAUSE FIX: The original logic had overlapping windows instead of separate ones
 * - d30 should be: 0-30 days from today
 * - d60 should be: 31-60 days from today (NOT 0-60)
 * - d90 should be: 61-90 days from today (NOT 0-90)
 */

export interface ExpiringUnitsBoundaries {
  today: Date
  day30: Date
  day60: Date
  day90: Date
}

export interface ExpiringUnitsResult {
  d30: string[]  // Units expiring 0-30 days
  d60: string[]  // Units expiring 31-60 days  
  d90: string[]  // Units expiring 61-90 days
}

export interface ExpiringCountsResult {
  d30: number
  d60: number
  d90: number
}

/**
 * Create date boundaries for expiring units calculations
 */
export function createExpiringUnitsBoundaries(fromDate: string | Date): ExpiringUnitsBoundaries {
  const today = typeof fromDate === 'string' ? new Date(fromDate) : fromDate
  
  return {
    today,
    day30: new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000)),
    day60: new Date(today.getTime() + (60 * 24 * 60 * 60 * 1000)),
    day90: new Date(today.getTime() + (90 * 24 * 60 * 60 * 1000))
  }
}

/**
 * Parse MM/DD/YYYY date strings safely
 */
export function parseLeaseEndDate(dateStr: string): Date | null {
  if (!dateStr) return null
  
  try {
    const [month, day, year] = dateStr.split('/')
    if (!month || !day || !year) return null
    
    const monthNum = parseInt(month, 10)
    const dayNum = parseInt(day, 10)
    const yearNum = parseInt(year, 10)
    
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31 || yearNum < 1900) {
      return null
    }
    
    return new Date(yearNum, monthNum - 1, dayNum)
  } catch (error) {
    console.warn(`[EXPIRING_HELPER] Failed to parse date: ${dateStr}`, error)
    return null
  }
}

/**
 * Categorize a lease end date into the correct expiring window
 * 
 * CORRECT LOGIC:
 * - d30: lease expires > today AND <= day30 (0-30 days)
 * - d60: lease expires > day30 AND <= day60 (31-60 days)
 * - d90: lease expires > day60 AND <= day90 (61-90 days)
 */
export function categorizeExpiringLease(
  leaseEndDate: Date,
  boundaries: ExpiringUnitsBoundaries,
  mode: 'separate' | 'cumulative' = 'separate'
): 'd30' | 'd60' | 'd90' | null {
  
  // Skip if lease already expired
  if (leaseEndDate <= boundaries.today) {
    return null
  }
  
  if (mode === 'separate') {
    // Separate windows: 1-30, 31-60, 61-90 days (NON-OVERLAPPING)
    if (leaseEndDate <= boundaries.day30) {
      return 'd30'  // 0-30 days
    } else if (leaseEndDate > boundaries.day30 && leaseEndDate <= boundaries.day60) {
      return 'd60'  // 31-60 days
    } else if (leaseEndDate > boundaries.day60 && leaseEndDate <= boundaries.day90) {
      return 'd90'  // 61-90 days
    }
  } else {
    // Cumulative windows: 0-30, 0-60, 0-90 days (OVERLAPPING)
    if (leaseEndDate <= boundaries.day30) {
      return 'd30'  // Will also be counted in d60 and d90
    } else if (leaseEndDate <= boundaries.day60) {
      return 'd60'  // Will also be counted in d90
    } else if (leaseEndDate <= boundaries.day90) {
      return 'd90'
    }
  }
  
  return null  // Expires beyond 90 days
}

/**
 * Process multiple leases and categorize them into expiring windows
 */
export function processExpiringLeases(
  leases: Array<{ unit: string; leaseEndDate: string }>,
  boundaries: ExpiringUnitsBoundaries,
  mode: 'separate' | 'cumulative' = 'separate'
): { units: ExpiringUnitsResult; counts: ExpiringCountsResult } {
  
  const units: ExpiringUnitsResult = {
    d30: [],
    d60: [],
    d90: []
  }
  
  for (const lease of leases) {
    const leaseEndDate = parseLeaseEndDate(lease.leaseEndDate)
    if (!leaseEndDate) continue
    
    const category = categorizeExpiringLease(leaseEndDate, boundaries, mode)
    if (!category) continue
    
    if (mode === 'separate') {
      // Each unit goes into exactly one bucket
      units[category].push(lease.unit)
    } else {
      // Cumulative: each unit may go into multiple buckets
      if (category === 'd30') {
        units.d30.push(lease.unit)
        units.d60.push(lease.unit)  // Also in d60 (cumulative)
        units.d90.push(lease.unit)  // Also in d90 (cumulative)
      } else if (category === 'd60') {
        units.d60.push(lease.unit)
        units.d90.push(lease.unit)  // Also in d90 (cumulative)
      } else if (category === 'd90') {
        units.d90.push(lease.unit)
      }
    }
  }
  
  const counts: ExpiringCountsResult = {
    d30: units.d30.length,
    d60: units.d60.length,
    d90: units.d90.length
  }
  
  return { units, counts }
}

/**
 * Get expiring units from master CSV data using centralized logic
 */
export async function getExpiringUnitsFromCSV(
  snapshotDate: string,
  mode: 'separate' | 'cumulative' = 'separate'
): Promise<{ units: ExpiringUnitsResult; counts: ExpiringCountsResult } | null> {
  try {
    const { prisma } = await import('./prisma')
    
    // Get current leases with end dates from master_csv_data
    const currentLeases = await prisma.masterCsvData.findMany({
      where: {
        tenantStatus: 'Current',
        leaseEndDate: { not: null }
      },
      select: {
        unit: true,
        leaseEndDate: true
      }
    })
    
    if (currentLeases.length === 0) {
      console.log('[EXPIRING_HELPER] No current leases with end dates found')
      return {
        units: { d30: [], d60: [], d90: [] },
        counts: { d30: 0, d60: 0, d90: 0 }
      }
    }
    
    // Create date boundaries
    const boundaries = createExpiringUnitsBoundaries(snapshotDate)
    
    // Process all leases
    const result = processExpiringLeases(
      currentLeases.map(l => ({ unit: l.unit, leaseEndDate: l.leaseEndDate! })),
      boundaries,
      mode
    )
    
    console.log(`[EXPIRING_HELPER] ✅ Processed ${currentLeases.length} leases:`, {
      mode,
      snapshotDate,
      counts: result.counts,
      sampleUnits: {
        d30: result.units.d30.slice(0, 3),
        d60: result.units.d60.slice(0, 3),
        d90: result.units.d90.slice(0, 3)
      }
    })
    
    return result
    
  } catch (error) {
    console.error('[EXPIRING_HELPER] Error getting expiring units from CSV:', error)
    return null
  }
}