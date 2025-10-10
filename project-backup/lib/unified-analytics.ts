/**
 * Unified Analytics Service
 * 
 * Single source of truth for all occupancy and financial analytics.
 * Uses master CSV data with standardized vacancy definition:
 * - Status "Vacant" = vacant unit
 * - Everything else = occupied unit
 */

import { prisma } from './prisma'
import { EasternTimeManager } from './timezone-utils'

export interface UnifiedAnalyticsMetrics {
  // Occupancy Metrics
  totalUnits: number
  occupiedUnits: number
  vacantUnits: number
  occupancyRate: number
  
  // Student/Non-Student Breakdown
  occupancyStudent: number
  occupancyNonStudent: number
  
  // Vacancy Analysis
  avgVacancyDays: number
  
  // Move Activity
  moveInsMTD: number
  moveOutsMTD: number
  
  // Financial Metrics  
  actualMRR: number
  marketPotential: number
  vacancyLoss: number
  arpu: number
  
  // Family Units (if family calculation needed)
  familyUnits?: {
    totalFamilyUnits: number
    occupiedFamilyUnits: number
    vacantFamilyUnits: number
    familyVacancyLoss: number
    familyActualMRR: number
    familyMarketPotential: number
  }
  
  // Metadata
  snapshotDate: string
  dataSource: 'master_csv'
  calculatedAt: string
  
  // Financial Consistency Flag
  excludeFamilyUnits?: boolean
}

export interface UnitData {
  unit: string
  isVacant: boolean
  tenantStatus: string
  monthlyRent: number
  marketRent: number
  isFamily?: boolean
  tenantType?: string
}

export class UnifiedAnalytics {
  
  /**
   * Get all analytics metrics from master CSV with standard vacancy definition
   */
  public static async getAnalyticsMetrics(options: { excludeFamilyUnits?: boolean } = {}): Promise<UnifiedAnalyticsMetrics> {
    console.log('[UNIFIED_ANALYTICS] Computing analytics from master CSV...')
    
    try {
      // Get unit data from master CSV 
      const allUnits = await this.getUnitsFromMasterCSV()
      
      if (allUnits.length === 0) {
        throw new Error('No master CSV data available')
      }
      
      // Filter units based on options (for financial consistency)
      const units = options.excludeFamilyUnits 
        ? allUnits.filter(unit => !unit.isFamily)
        : allUnits
      
      console.log(`[UNIFIED_ANALYTICS] Processing ${units.length} units from master CSV ${options.excludeFamilyUnits ? '(excluding family units)' : '(all units)'}`)
      
      // Apply standard vacancy definition with family unit rule:
      // - Status "Vacant" = vacant, everything else = occupied
      // - BUT family units are NEVER counted as vacant regardless of status
      const occupiedUnits = units.filter(unit => !unit.isVacant || unit.isFamily)
      const vacantUnits = units.filter(unit => unit.isVacant && !unit.isFamily)
      
      console.log(`[UNIFIED_ANALYTICS] Vacancy definition applied: ${vacantUnits.length} vacant, ${occupiedUnits.length} occupied`)
      
      // Calculate student/non-student breakdown using existing dash-based logic
      const { isStudentUnit } = await import('./units')
      
      const allStudentUnits = units.filter(unit => isStudentUnit(unit.unit))
      const allNonStudentUnits = units.filter(unit => !isStudentUnit(unit.unit))
      
      const occupiedStudentUnits = occupiedUnits.filter(unit => isStudentUnit(unit.unit))
      const occupiedNonStudentUnits = occupiedUnits.filter(unit => !isStudentUnit(unit.unit))
      
      const occupancyStudent = allStudentUnits.length > 0 ? (occupiedStudentUnits.length / allStudentUnits.length) * 100 : 0
      const occupancyNonStudent = allNonStudentUnits.length > 0 ? (occupiedNonStudentUnits.length / allNonStudentUnits.length) * 100 : 0
      
      // Calculate occupancy metrics
      const totalUnits = units.length
      const occupancyRate = totalUnits > 0 ? (occupiedUnits.length / totalUnits) * 100 : 0
      
      // Calculate vacancy days (get from master CSV daysVacant field if available)
      const avgVacancyDays = await this.calculateAverageVacancyDays(vacantUnits)
      
      // Calculate move activity
      const { moveInsMTD, moveOutsMTD } = await this.calculateMoveActivity()
      
      // Calculate financial metrics
      const actualMRR = occupiedUnits.reduce((sum, unit) => sum + unit.monthlyRent, 0)
      const vacancyLoss = vacantUnits.reduce((sum, unit) => sum + unit.marketRent, 0)
      const marketPotential = actualMRR + vacancyLoss
      const arpu = occupiedUnits.length > 0 ? actualMRR / occupiedUnits.length : 0
      
      // Calculate family units if needed (preserve family calculation logic)
      const familyUnits = this.calculateFamilyMetrics(allUnits)
      
      const metrics: UnifiedAnalyticsMetrics = {
        totalUnits,
        occupiedUnits: occupiedUnits.length,
        vacantUnits: vacantUnits.length,
        occupancyRate: Math.round(occupancyRate * 100) / 100, // Round to 2 decimal places
        
        occupancyStudent: Math.round(occupancyStudent * 100) / 100,
        occupancyNonStudent: Math.round(occupancyNonStudent * 100) / 100,
        
        avgVacancyDays,
        moveInsMTD,
        moveOutsMTD,
        
        actualMRR: Math.round(actualMRR),
        marketPotential: Math.round(marketPotential),
        vacancyLoss: Math.round(vacancyLoss),
        arpu: Math.round(arpu),
        
        familyUnits,
        
        snapshotDate: await this.getLatestSnapshotDate(),
        dataSource: 'master_csv',
        calculatedAt: EasternTimeManager.getCurrentEasternISO(),
        excludeFamilyUnits: options.excludeFamilyUnits
      }
      
      console.log('[UNIFIED_ANALYTICS] ✅ Analytics calculated:', {
        totalUnits: metrics.totalUnits,
        occupiedUnits: metrics.occupiedUnits,
        vacantUnits: metrics.vacantUnits,
        occupancyRate: `${metrics.occupancyRate}%`,
        studentOccupancy: `${metrics.occupancyStudent}%`,
        nonStudentOccupancy: `${metrics.occupancyNonStudent}%`,
        avgVacancyDays: metrics.avgVacancyDays,
        moveInsMTD: metrics.moveInsMTD,
        moveOutsMTD: metrics.moveOutsMTD,
        actualMRR: metrics.actualMRR,
        vacancyLoss: metrics.vacancyLoss,
        excludingFamily: options.excludeFamilyUnits
      })
      
      return metrics
      
    } catch (error) {
      console.error('[UNIFIED_ANALYTICS] ❌ Failed to calculate analytics:', error)
      throw error
    }
  }
  
  /**
   * Get units data from master CSV with standardized format
   * CRITICAL: Deduplicate by unit code since CSV has multiple rows per unit (roommates/couples)
   */
  private static async getUnitsFromMasterCSV(): Promise<UnitData[]> {
    try {
      // Get data from master CSV table
      const masterData = await prisma.masterCsvData.findMany({
        select: {
          unit: true,
          tenantStatus: true,
          monthlyRent: true,
          marketRent: true,
          unitType: true,
          unitCategory: true,
          tenantType: true
        }
      })
      
      if (!masterData || masterData.length === 0) {
        console.warn('[UNIFIED_ANALYTICS] No master CSV data found in database')
        return []
      }
      
      // Group by unit code to handle multiple tenants per unit
      const unitGroups = new Map<string, typeof masterData>()
      for (const record of masterData) {
        if (!unitGroups.has(record.unit)) {
          unitGroups.set(record.unit, [])
        }
        unitGroups.get(record.unit)!.push(record)
      }
      
      // Convert to standardized format with proper unit-level deduplication
      const units: UnitData[] = Array.from(unitGroups.entries()).map(([unitCode, records]) => {
        // Unit-level vacancy logic: Unit is vacant only if ALL rows show "Vacant" status
        const isVacant = records.every(record => record.tenantStatus === 'Vacant')
        
        // Use first record for unit metadata, but sum financial data
        const firstRecord = records[0]
        const totalMonthlyRent = records.reduce((sum, r) => sum + (r.monthlyRent || 0), 0)
        const marketRent = firstRecord.marketRent || 0 // Market rent is per unit, not per tenant
        
        return {
          unit: unitCode,
          // STANDARD VACANCY DEFINITION: status "Vacant" = vacant, everything else = occupied
          isVacant,
          tenantStatus: isVacant ? 'Vacant' : firstRecord.tenantStatus || '',
          monthlyRent: totalMonthlyRent,
          marketRent,
          // Family units are specific unit numbers: 115, 116, 202, 313, 318
          isFamily: ['115', '116', '202', '313', '318'].includes(unitCode),
          // Add tenant type for student/non-student breakdown
          tenantType: firstRecord.tenantType || ''
        }
      })
      
      console.log(`[UNIFIED_ANALYTICS] Loaded ${masterData.length} CSV rows → ${units.length} unique units`)
      console.log(`[UNIFIED_ANALYTICS] Vacancy breakdown:`, {
        vacant: units.filter(u => u.isVacant).length,
        occupied: units.filter(u => !u.isVacant).length,
        vacantStatuses: [...new Set(units.filter(u => u.isVacant).map(u => u.tenantStatus))],
        occupiedStatuses: [...new Set(units.filter(u => !u.isVacant).map(u => u.tenantStatus))],
        familyUnits: units.filter(u => u.isFamily).length,
        studentUnits: units.filter(u => u.tenantType?.toLowerCase().includes('student')).length
      })
      
      return units
      
    } catch (error) {
      console.error('[UNIFIED_ANALYTICS] ❌ Failed to get master CSV data:', error)
      throw error
    }
  }
  
  /**
   * Calculate family-specific metrics (preserve existing family calculation logic)
   */
  private static calculateFamilyMetrics(units: UnitData[]): UnifiedAnalyticsMetrics['familyUnits'] {
    const familyUnits = units.filter(unit => unit.isFamily)
    
    if (familyUnits.length === 0) {
      return undefined
    }
    
    // Business rule: Family units are ALWAYS considered occupied regardless of status
    // But for financial analysis, we calculate opportunity cost
    const occupiedFamilyUnits = familyUnits // All family units are "occupied" per business rule
    const vacantFamilyUnits: UnitData[] = [] // No family units are ever "vacant" per business rule
    
    // Calculate family unit financials
    const familyActualMRR = familyUnits.reduce((sum, unit) => sum + unit.monthlyRent, 0)
    const familyMarketPotential = familyUnits.reduce((sum, unit) => sum + unit.marketRent, 0)
    
    // Family vacancy loss = OPPORTUNITY COST: what we're missing by not charging market rent
    const familyVacancyLoss = familyMarketPotential - familyActualMRR
    
    return {
      totalFamilyUnits: familyUnits.length,
      occupiedFamilyUnits: occupiedFamilyUnits.length,
      vacantFamilyUnits: vacantFamilyUnits.length,
      familyVacancyLoss: Math.round(familyVacancyLoss),
      familyActualMRR: Math.round(familyActualMRR),
      familyMarketPotential: Math.round(familyMarketPotential)
    }
  }
  
  /**
   * Determine if a unit is a family unit based on specific unit numbers
   */
  private static isUnitFamily(unitType?: string | null, unitCategory?: string | null): boolean {
    // Family units are specific unit numbers: 115, 116, 202, 313, 318
    // This overrides the unit type/category fields
    return false  // Will be overridden by unit number check in getUnitsFromMasterCSV
  }
  
  
  /**
   * Calculate average vacancy days from master CSV data
   */
  private static async calculateAverageVacancyDays(vacantUnits: UnitData[]): Promise<number> {
    try {
      if (vacantUnits.length === 0) return 0
      
      // Get vacancy days from master CSV if available
      const vacantUnitsWithDays = await prisma.masterCsvData.findMany({
        where: {
          unit: { in: vacantUnits.map(u => u.unit) },
          daysVacant: { gt: 0 }
        },
        select: {
          unit: true,
          daysVacant: true
        }
      })
      
      if (vacantUnitsWithDays.length === 0) return 0
      
      const totalDays = vacantUnitsWithDays.reduce((sum, unit) => sum + (unit.daysVacant || 0), 0)
      return Math.round(totalDays / vacantUnitsWithDays.length)
      
    } catch (error) {
      console.warn('[UNIFIED_ANALYTICS] Failed to calculate average vacancy days:', error)
      return 0
    }
  }
  
  /**
   * Calculate move-ins and move-outs for current month
   */
  private static async calculateMoveActivity(): Promise<{ moveInsMTD: number, moveOutsMTD: number }> {
    try {
      // Try to get move activity from existing analytics functions if available
      const { getMoveInsMTD, getMoveOutsMTD } = await import('./occupancy-analytics')
      
      const currentDate = EasternTimeManager.getCurrentEasternDate()
      
      const [moveInsData, moveOutsData] = await Promise.all([
        getMoveInsMTD(currentDate).catch(() => null),
        getMoveOutsMTD(currentDate).catch(() => null)
      ])
      
      return {
        moveInsMTD: moveInsData?.move_ins_mtd || 0,
        moveOutsMTD: moveOutsData?.move_outs_mtd || 0
      }
      
    } catch (error) {
      console.warn('[UNIFIED_ANALYTICS] Failed to calculate move activity:', error)
      return { moveInsMTD: 0, moveOutsMTD: 0 }
    }
  }
  
  /**
   * Get just occupancy metrics (for occupancy-specific endpoints)
   */
  public static async getOccupancyMetrics(): Promise<{
    totalUnits: number
    occupiedUnits: number
    vacantUnits: number
    occupancyRate: number
    occupancyStudent: number
    occupancyNonStudent: number
    avgVacancyDays: number
    moveInsMTD: number
    moveOutsMTD: number
    snapshotDate: string
  }> {
    const metrics = await this.getAnalyticsMetrics()
    
    return {
      totalUnits: metrics.totalUnits,
      occupiedUnits: metrics.occupiedUnits,
      vacantUnits: metrics.vacantUnits,
      occupancyRate: metrics.occupancyRate,
      occupancyStudent: metrics.occupancyStudent,
      occupancyNonStudent: metrics.occupancyNonStudent,
      avgVacancyDays: metrics.avgVacancyDays,
      moveInsMTD: metrics.moveInsMTD,
      moveOutsMTD: metrics.moveOutsMTD,
      snapshotDate: metrics.snapshotDate
    }
  }
  
  /**
   * Get just financial metrics (for financial-specific endpoints)
   */
  public static async getFinancialMetrics(): Promise<{
    actualMRR: number
    marketPotential: number
    vacancyLoss: number
    arpu: number
    occupiedUnits: number
    totalUnits: number
    vacantUnits: number
    snapshotDate: string
    familyUnits?: UnifiedAnalyticsMetrics['familyUnits']
  }> {
    // Use excludeFamilyUnits=true to match existing financial analytics behavior
    const metrics = await this.getAnalyticsMetrics({ excludeFamilyUnits: true })
    
    return {
      actualMRR: metrics.actualMRR,
      marketPotential: metrics.marketPotential,
      vacancyLoss: metrics.vacancyLoss,
      arpu: metrics.arpu,
      occupiedUnits: metrics.occupiedUnits,
      totalUnits: metrics.totalUnits,
      vacantUnits: metrics.vacantUnits,
      snapshotDate: metrics.snapshotDate,
      familyUnits: metrics.familyUnits
    }
  }

  /**
   * Get the latest snapshot date from the actual data (not today's date)
   */
  private static async getLatestSnapshotDate(): Promise<string> {
    try {
      // Try to get from master_tenant_data first (most recent)
      const latestFromTenantData = await prisma.masterTenantData.aggregate({
        _max: {
          snapshotDate: true
        }
      })

      if (latestFromTenantData._max.snapshotDate) {
        // Database stores dates as UTC midnight, extract date directly to avoid timezone shift
        return latestFromTenantData._max.snapshotDate.toISOString().split('T')[0]
      }

      // Fallback to master_csv_data updatedAt if no tenant data
      const latestFromCsvData = await prisma.masterCsvData.aggregate({
        _max: {
          updatedAt: true
        }
      })

      if (latestFromCsvData._max.updatedAt) {
        return EasternTimeManager.toEasternDate(latestFromCsvData._max.updatedAt)
      }

      // Ultimate fallback to today's date
      console.warn('[UNIFIED_ANALYTICS] No snapshot date found in data, using today\'s date')
      return EasternTimeManager.getCurrentEasternDate()

    } catch (error) {
      console.error('[UNIFIED_ANALYTICS] Error getting latest snapshot date:', error)
      return EasternTimeManager.getCurrentEasternDate()
    }
  }
}