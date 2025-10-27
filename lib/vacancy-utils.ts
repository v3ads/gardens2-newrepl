/**
 * Vacancy Deduplication Utilities
 * 
 * Handles smart vacant unit counting with deduplication logic.
 * Version: v18.3.0
 * 
 * FEATURE FLAG: USE_SMART_VACANCY_DEDUPLICATION
 * - "true" (default): Deduplicate units with multiple status rows (matches external AI - 37 vacant)
 * - "false": Legacy row-based counting (40 vacant)
 * 
 * Smart Logic:
 * - Groups units by unit code
 * - Excludes units from vacant count if they have BOTH "Vacant" AND non-vacant statuses
 * - Units with Future/Notice tenants are NOT counted as vacant (lease signed)
 */

import { prisma } from './prisma'

export interface VacancyResult {
  vacantUnits: string[]
  vacantCount: number
  excludedUnits: Array<{
    unit: string
    reason: string
    statuses: string[]
  }>
  method: 'smart_deduplication' | 'legacy_row_based'
}

/**
 * Get vacant units with smart deduplication logic
 */
export async function getSmartVacantUnits(): Promise<VacancyResult> {
  // Check feature flag (defaults to true for smart deduplication)
  const useSmartDedup = process.env.USE_SMART_VACANCY_DEDUPLICATION !== 'false'
  
  console.log(`[VACANCY_UTILS] Using ${useSmartDedup ? 'SMART deduplication' : 'LEGACY row-based'} counting`)
  
  // Get all master CSV data
  const allData = await prisma.masterCsvData.findMany({
    select: {
      unit: true,
      tenantStatus: true
    }
  })
  
  if (!useSmartDedup) {
    // Legacy mode: Simple row-based counting
    const vacantRows = allData.filter(row => row.tenantStatus?.toLowerCase() === 'vacant')
    return {
      vacantUnits: vacantRows.map(r => r.unit),
      vacantCount: vacantRows.length,
      excludedUnits: [],
      method: 'legacy_row_based'
    }
  }
  
  // Smart deduplication mode
  const unitGroups = new Map<string, string[]>()
  
  // Group all rows by unit code
  for (const row of allData) {
    const unit = row.unit
    const status = row.tenantStatus || ''
    
    if (!unitGroups.has(unit)) {
      unitGroups.set(unit, [])
    }
    unitGroups.get(unit)!.push(status)
  }
  
  const vacantUnits: string[] = []
  const excludedUnits: Array<{ unit: string; reason: string; statuses: string[] }> = []
  
  // Process each unit
  for (const [unit, statuses] of unitGroups) {
    const uniqueStatuses = [...new Set(statuses)]
    const hasVacant = uniqueStatuses.some(s => s.toLowerCase() === 'vacant')
    const hasNonVacant = uniqueStatuses.some(s => s.toLowerCase() !== 'vacant')
    
    if (hasVacant && !hasNonVacant) {
      // Unit is ONLY vacant (no other status rows)
      vacantUnits.push(unit)
    } else if (hasVacant && hasNonVacant) {
      // Unit has BOTH vacant and non-vacant rows - exclude from vacant count
      const nonVacantStatuses = uniqueStatuses.filter(s => s.toLowerCase() !== 'vacant')
      excludedUnits.push({
        unit,
        reason: `Has both Vacant and non-vacant statuses: ${nonVacantStatuses.join(', ')}`,
        statuses: uniqueStatuses
      })
    }
    // If only non-vacant statuses, unit is not vacant (don't add to vacant list)
  }
  
  // Log excluded units for transparency
  if (excludedUnits.length > 0) {
    console.log(`[VACANCY_UTILS] 📋 Excluded ${excludedUnits.length} units from vacant count:`)
    excludedUnits.forEach(({ unit, reason }) => {
      console.log(`  - ${unit}: ${reason}`)
    })
  }
  
  return {
    vacantUnits: vacantUnits.sort(),
    vacantCount: vacantUnits.length,
    excludedUnits,
    method: 'smart_deduplication'
  }
}

/**
 * Get vacant unit count only (convenience method)
 */
export async function getVacantUnitCount(): Promise<number> {
  const result = await getSmartVacantUnits()
  return result.vacantCount
}

/**
 * Check if a specific unit is vacant (smart logic)
 */
export async function isUnitVacant(unitCode: string): Promise<boolean> {
  const result = await getSmartVacantUnits()
  return result.vacantUnits.includes(unitCode)
}
