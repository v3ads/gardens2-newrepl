import { prisma } from './prisma'

export interface RentIQUnit {
  unit: string
  tenant_status: string
  monthly_rent: number | null
  market_rent: number | null
  unit_type: string | null
  suggested_new_rent: number
  pricing_tier: 'Tier 1' | 'Tier 2' | 'Tier 3'
  days_vacant: number
  assigned_category: string
  minimum_threshold: number
  cap_applied: boolean
  days_in_pool: number
}

export interface RentIQResults {
  date: string
  current_occupancy: number
  total_units: number
  occupied_units: number
  target_occupancy: number
  target_occupied_units: number
  rentiq_pool_count: number
  units_needed_for_95: number
  rentiq_active: boolean
  rentiq_units: RentIQUnit[]
  thresholds: RentIQThreshold[]
}

export interface RentIQThreshold {
  config_key: string
  category_name: string
  min_rent: number
}

interface UnitTracking {
  unit: string
  days_in_pool: number
  date_first_entered: string
  assigned_category: string
  last_suggested_rent: number
}

export class RentIQAdvancedAnalytics {
  private static instance: RentIQAdvancedAnalytics
  
  static getInstance(): RentIQAdvancedAnalytics {
    if (!RentIQAdvancedAnalytics.instance) {
      RentIQAdvancedAnalytics.instance = new RentIQAdvancedAnalytics()
    }
    return RentIQAdvancedAnalytics.instance
  }

  /**
   * Get current Eastern Time date in YYYY-MM-DD format
   */
  private getCurrentEasternDate(): string {
    const now = new Date()
    // Convert to Eastern Time (UTC-5 in standard time, UTC-4 in daylight time)
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}))
    return easternTime.toISOString().split('T')[0]
  }

  /**
   * Main RentIQ calculation with progressive discounting and category mapping
   */
  async calculateRentIQ(targetDate?: string): Promise<RentIQResults> {
    
    try {
      // Get target date - use Eastern Time today if not specified
      if (!targetDate) {
        const todayEastern = this.getCurrentEasternDate()
        console.log(`[RENTIQ_ADVANCED] Using current Eastern date: ${todayEastern}`)
        
        // Check if we have data for today, otherwise use latest available
        const todayResult = await prisma.analyticsMaster.findFirst({
          where: { snapshotDate: new Date(todayEastern) },
          select: { snapshotDate: true }
        })
        
        if (todayResult) {
          targetDate = todayEastern
        } else {
          const latestResult = await prisma.analyticsMaster.findFirst({
            orderBy: { snapshotDate: 'desc' },
            select: { snapshotDate: true }
          })
          
          if (!latestResult?.snapshotDate) {
            throw new Error('No analytics master data available')
          }
          targetDate = latestResult.snapshotDate.toISOString().split('T')[0]
          console.log(`[RENTIQ_ADVANCED] No data for ${todayEastern}, using latest: ${targetDate}`)
        }
      }

      console.log(`[RENTIQ_ADVANCED] Calculating for date: ${targetDate}`)

      // Get thresholds
      const thresholds = await this.getThresholds()

      // Get all units from analytics master - the authoritative source
      const units = await prisma.analyticsMaster.findMany({
        where: { snapshotDate: new Date(targetDate) },
        orderBy: { unitCode: 'asc' },
        select: {
          unitCode: true,
          isOccupied: true,
          marketRent: true,
          mrr: true,
          daysVacant: true,
          snapshotDate: true
        }
      })

      if (!units || units.length === 0) {
        throw new Error(`No analytics master data found for ${targetDate}`)
      }

      // Calculate occupancy metrics
      const totalUnits = units.length
      const occupiedUnits = units.filter(unit => unit.isOccupied).length
      const currentOccupancy = (occupiedUnits / totalUnits) * 100

      // Target 95% occupancy 
      const targetOccupancy = 95.0
      const targetOccupiedUnits = Math.ceil(totalUnits * (targetOccupancy / 100))
      const unitsNeededFor95 = Math.max(0, targetOccupiedUnits - occupiedUnits)

      // Find vacant units with REAL data only - no fallbacks or estimates
      const excludedUnits = ['513', '818'] // Units to exclude from RentIQ operations
      const familyUnits = ['115', '116', '202', '313', '318'] // Family units excluded from RentIQ
      const allExcludedUnits = [...excludedUnits, ...familyUnits]
      
      const eligibleVacantUnits = units.filter(unit => 
        !unit.isOccupied && 
        !allExcludedUnits.includes(unit.unitCode) &&
        unit.marketRent !== null && 
        unit.marketRent !== undefined && 
        unit.marketRent > 0 &&
        unit.daysVacant !== null && 
        unit.daysVacant !== undefined
      )
      
      console.log(`[RENTIQ_ADVANCED] Data filtering (REAL DATA ONLY):`)
      console.log(`[RENTIQ_ADVANCED]   Total units: ${totalUnits}`)
      console.log(`[RENTIQ_ADVANCED]   Occupied units: ${occupiedUnits}`)
      console.log(`[RENTIQ_ADVANCED]   All vacant units: ${units.filter(u => !u.isOccupied).length}`)
      console.log(`[RENTIQ_ADVANCED]   Excluded units: ${excludedUnits.join(', ')}, Family units: ${familyUnits.join(', ')}`)
      console.log(`[RENTIQ_ADVANCED]   Vacant with real market rent: ${units.filter(u => !u.isOccupied && u.marketRent && u.marketRent > 0).length}`)
      console.log(`[RENTIQ_ADVANCED]   Vacant with real days vacant: ${units.filter(u => !u.isOccupied && u.daysVacant !== null).length}`)
      console.log(`[RENTIQ_ADVANCED]   Eligible units (both market rent & days vacant): ${eligibleVacantUnits.length}`)
      console.log(`[RENTIQ_ADVANCED]   Units needed for 95%: ${unitsNeededFor95}`)
      
      // RentIQ is active if we need more units to reach 95% occupancy
      const rentiqActive = unitsNeededFor95 > 0

      // Sort by highest vacancy days first and take exactly the units needed for 95% target
      const selectedUnits = eligibleVacantUnits
        .sort((a, b) => (b.daysVacant || 0) - (a.daysVacant || 0)) // Sort by highest vacancy days first  
        .slice(0, unitsNeededFor95) // Take exactly the units needed for 95% target

      const rentiqPoolCount = selectedUnits.length

      console.log(`[RENTIQ_ADVANCED] ${occupiedUnits}/${totalUnits} occupied (${currentOccupancy.toFixed(1)}%), need ${unitsNeededFor95} more for 95%, ${rentiqPoolCount} in pool`)
      
      // Log the selected units with their vacancy days for transparency
      if (selectedUnits.length > 0) {
        console.log(`[RENTIQ_ADVANCED] Selected units prioritized by highest vacancy days:`)
        selectedUnits.slice(0, 10).forEach((unit, idx) => {
          console.log(`[RENTIQ_ADVANCED]   ${idx + 1}. Unit ${unit.unitCode}: ${unit.daysVacant} days vacant, $${unit.marketRent} market rent`)
        })
        if (selectedUnits.length > 10) {
          console.log(`[RENTIQ_ADVANCED]   ... and ${selectedUnits.length - 10} more units`)
        }
      }

      // Process RentIQ pool units using REAL data only
      const rentiqUnits: RentIQUnit[] = []

      for (const unit of selectedUnits) {
        // Get or create unit tracking
        const tracking = await this.getOrCreateUnitTracking(unit.unitCode, targetDate)
        
        // Use REAL market rent from analytics_master - no parsing or fallbacks needed
        const realMarketRent = unit.marketRent!  // Safe to use ! because we filtered for non-null values
        const realDaysVacant = unit.daysVacant!  // Safe to use ! because we filtered for non-null values
        
        // Assign category using real market rent
        const assignedCategory = await this.assignCategoryFromUnitType(unit.unitCode, realMarketRent, await this.getThresholdsArray())
        const minimumThreshold = this.getThresholdForCategory(assignedCategory, await this.getThresholdsArray())
        
        // Calculate progressive suggested rent using real vacancy days
        const { suggestedRent, tier, capApplied } = this.calculateProgressiveSuggestedRent(
          realMarketRent,
          realDaysVacant,
          minimumThreshold
        )
        
        // Update tracking
        await this.updateUnitTracking(unit.unitCode, {
          assigned_category: assignedCategory,
          last_suggested_rent: suggestedRent,
          days_in_pool: realDaysVacant
        })

        rentiqUnits.push({
          unit: unit.unitCode,
          tenant_status: unit.isOccupied ? 'Occupied' : 'Vacant',
          monthly_rent: unit.mrr,
          market_rent: realMarketRent,
          unit_type: null, // Unit type info not in analytics_master currently
          suggested_new_rent: suggestedRent,
          pricing_tier: tier,
          days_vacant: realDaysVacant,
          assigned_category: assignedCategory,
          minimum_threshold: minimumThreshold,
          cap_applied: capApplied,
          days_in_pool: realDaysVacant
        })
      }

      const results: RentIQResults = {
        date: targetDate,
        current_occupancy: Math.round(currentOccupancy * 100) / 100,
        total_units: totalUnits,
        occupied_units: occupiedUnits,
        target_occupancy: targetOccupancy,
        target_occupied_units: targetOccupiedUnits,
        rentiq_pool_count: rentiqPoolCount,
        units_needed_for_95: unitsNeededFor95,
        rentiq_active: rentiqActive,
        rentiq_units: rentiqUnits,
        thresholds: await this.getThresholdsArray()
      }

      // Store results for historical tracking
      await this.storeRentIQResults(results)

      console.log(`[RENTIQ_ADVANCED] ✅ Calculated: ${rentiqPoolCount} units in pool, active: ${rentiqActive}`)
      return results

    } catch (error) {
      console.error(`[RENTIQ_ADVANCED] Error:`, error)
      throw error
    }
  }

  /**
   * Get threshold settings as array (for internal use)
   */
  private async getThresholdsArray(): Promise<RentIQThreshold[]> {
    const thresholdRecord = await this.getThresholds()
    
    const thresholds: RentIQThreshold[] = []
    
    for (const [key, value] of Object.entries(thresholdRecord)) {
      const categoryName = key.replace('min_', '').split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join('-')
      
      thresholds.push({
        config_key: key,
        category_name: categoryName,
        min_rent: value
      })
    }
    
    return thresholds
  }

  /**
   * Get threshold settings
   */
  async getThresholds(): Promise<Record<string, number>> {
    try {
      // Try to load from database
      const stored = await prisma.kvStore.findUnique({
        where: { key: 'rentiq_thresholds' }
      })

      if (stored?.value) {
        try {
          const parsed = JSON.parse(stored.value)
          console.log(`[RENTIQ_ADVANCED] ✅ Loaded thresholds from database:`, parsed)
          return parsed
        } catch (error) {
          console.warn('[RENTIQ_ADVANCED] Failed to parse stored thresholds, using defaults:', error)
        }
      }
    } catch (error) {
      console.warn('[RENTIQ_ADVANCED] Failed to load thresholds from database, using defaults:', error)
    }

    // Return defaults if not found in database
    const defaults = {
      'min_basic_unfurnished': 1700,
      'min_basic_furnished': 1900,
      'min_upgraded_unfurnished': 1720,
      'min_upgraded_furnished': 2000,
      'min_premium_unfurnished': 2100,
      'min_premium_furnished': 2250,
      'min_student_unit': 1500
    }

    console.log(`[RENTIQ_ADVANCED] Using default thresholds`)
    return defaults
  }

  /**
   * Update threshold settings
   */
  async updateThresholds(thresholds: Record<string, number>): Promise<void> {
    try {
      const thresholdsJson = JSON.stringify(thresholds)
      
      await prisma.kvStore.upsert({
        where: { key: 'rentiq_thresholds' },
        create: {
          key: 'rentiq_thresholds',
          value: thresholdsJson,
          updatedAt: new Date()
        },
        update: {
          value: thresholdsJson,
          updatedAt: new Date()
        }
      })
      
      console.log(`[RENTIQ_ADVANCED] ✅ Saved ${Object.keys(thresholds).length} thresholds to database:`, thresholds)
    } catch (error) {
      console.error('[RENTIQ_ADVANCED] ❌ Failed to save thresholds:', error)
      throw new Error(`Failed to save thresholds: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }



  /**
   * Assign category prioritizing CSV unit type over market rent for consistent pricing
   */
  private async assignCategoryFromUnitType(unitCode: string, marketRent: number, thresholds: RentIQThreshold[]): Promise<string> {
    try {
      // Get unit type from CSV data
      // Skip CSV lookup for now
      const csvData = undefined as { unit_type?: string } | undefined
      
      const csvUnitType: string | null = csvData?.unit_type || null
      
      if (csvUnitType) {
        // Map CSV unit types to RentIQ categories
        const categoryFromCSV = this.mapCSVUnitTypeToCategory(csvUnitType)
        if (categoryFromCSV) {
          console.log(`[RENTIQ] Unit ${unitCode}: CSV type "${csvUnitType}" → category "${categoryFromCSV}"`);
          return categoryFromCSV
        }
      }
      
      // Fallback to market rent based assignment
      console.log(`[RENTIQ] Unit ${unitCode}: No CSV mapping, using market rent ${marketRent} for category`);
      return this.assignCategoryByMarketRent(marketRent, thresholds)
    } catch (error) {
      console.warn(`[RENTIQ] Error getting CSV unit type for ${unitCode}, falling back to market rent:`, error)
      return this.assignCategoryByMarketRent(marketRent, thresholds)
    }
  }

  /**
   * Map CSV unit types to standardized RentIQ categories
   */
  private mapCSVUnitTypeToCategory(csvUnitType: string): string | null {
    const type = csvUnitType.toLowerCase()
    
    // Map specific CSV unit types to RentIQ categories
    if (type.includes('capri') && type.includes('unfurnished')) {
      return 'Upgraded-Unfurnished'
    }
    if (type.includes('capri') && type.includes('furnished')) {
      return 'Upgraded-Furnished'
    }
    if (type.includes('monaco') && type.includes('unfurnished')) {
      return 'Basic-Unfurnished'
    }
    if (type.includes('monaco') && type.includes('furnished')) {
      return 'Basic-Furnished'
    }
    if (type.includes('premium') && type.includes('unfurnished')) {
      return 'Premium-Unfurnished'
    }
    if (type.includes('premium') && type.includes('furnished')) {
      return 'Premium-Furnished'
    }
    if (type.includes('student')) {
      return 'Student Unit'
    }
    
    // Generic fallback mappings
    if (type.includes('upgraded') && type.includes('furnished')) {
      return 'Upgraded-Furnished'
    }
    if (type.includes('upgraded') && type.includes('unfurnished')) {
      return 'Upgraded-Unfurnished'
    }
    if (type.includes('basic') && type.includes('furnished')) {
      return 'Basic-Furnished'
    }
    if (type.includes('basic') && type.includes('unfurnished')) {
      return 'Basic-Unfurnished'
    }
    
    return null // No mapping found
  }

  /**
   * Assign category based on exact market rent match (fallback method)
   */
  private assignCategoryByMarketRent(marketRent: number, thresholds: RentIQThreshold[]): string {
    // Exact market rent to category mapping
    const categoryMapping: { [key: number]: string } = {
      1500: 'Student Unit',
      1990: 'Basic-Unfurnished', 
      2240: 'Basic-Furnished',
      2020: 'Upgraded-Unfurnished',
      2370: 'Upgraded-Furnished',
      2220: 'Premium-Unfurnished',
      2570: 'Premium-Furnished'
    }

    const category = categoryMapping[marketRent]
    
    if (category) {
      return category
    }

    // Fallback: assign based on rent ranges if no exact match
    if (marketRent >= 2300) return 'Premium-Furnished'
    if (marketRent >= 2200) return 'Premium-Unfurnished'
    if (marketRent >= 2000) return 'Upgraded-Furnished'
    if (marketRent >= 1900) return 'Basic-Furnished'
    if (marketRent >= 1700) return 'Basic-Unfurnished'
    return 'Student Unit'
  }

  /**
   * Get threshold for category
   */
  private getThresholdForCategory(category: string, thresholds: RentIQThreshold[]): number {
    const threshold = thresholds.find(t => t.category_name === category)
    return threshold?.min_rent || 1500 // Default minimum
  }

  /**
   * Calculate progressive suggested rent with tier-based discounting
   */
  private calculateProgressiveSuggestedRent(
    marketRent: number, 
    daysInPool: number, 
    minimumThreshold: number
  ): { suggestedRent: number; tier: 'Tier 1' | 'Tier 2' | 'Tier 3'; capApplied: boolean } {
    
    // Determine tier based on market rent
    // Tier 1: market rent >= $2300
    // Tier 2: $1800-$2299  
    // Tier 3: < $1800
    let tier: 'Tier 1' | 'Tier 2' | 'Tier 3'
    if (marketRent >= 2300) {
      tier = 'Tier 1'
    } else if (marketRent >= 1800) {
      tier = 'Tier 2'
    } else {
      tier = 'Tier 3'
    }

    // Progressive discount based on days in pool
    let discount = 0
    
    if (daysInPool <= 6) {
      // Days 1-6
      discount = tier === 'Tier 1' ? 0.15 : tier === 'Tier 2' ? 0.10 : 0.00
    } else if (daysInPool <= 13) {
      // Days 7-13
      discount = tier === 'Tier 1' ? 0.20 : tier === 'Tier 2' ? 0.15 : 0.05
    } else if (daysInPool <= 20) {
      // Days 14-20
      discount = tier === 'Tier 1' ? 0.25 : tier === 'Tier 2' ? 0.20 : 0.10
    } else {
      // Days 21+
      discount = tier === 'Tier 1' ? 0.30 : tier === 'Tier 2' ? 0.25 : 0.15
    }

    // Calculate suggested rent
    const discountedRent = Math.round(marketRent * (1 - discount))
    
    // Apply minimum threshold cap
    const suggestedRent = Math.max(discountedRent, minimumThreshold)
    const capApplied = suggestedRent > discountedRent

    return { suggestedRent, tier, capApplied }
  }

  /**
   * Get or create unit tracking record
   */
  private async getOrCreateUnitTracking(unit: string, currentDate: string): Promise<UnitTracking> {
    
    // Skip unit tracking for now
    const existing: UnitTracking | undefined = undefined

    if (existing) {
      return existing
    }

    // Create new tracking record
    const newTracking: UnitTracking = {
      unit,
      days_in_pool: 0,
      date_first_entered: currentDate,
      assigned_category: '',
      last_suggested_rent: 0
    }

    // Skip tracking insertion for now

    return newTracking
  }

  /**
   * Update unit tracking record
   */
  private async updateUnitTracking(unit: string, updates: Partial<UnitTracking>): Promise<void> {
    
    const fields = []
    const values = []

    if (updates.assigned_category !== undefined) {
      fields.push('assigned_category = ?')
      values.push(updates.assigned_category)
    }
    if (updates.last_suggested_rent !== undefined) {
      fields.push('last_suggested_rent = ?')
      values.push(updates.last_suggested_rent)
    }
    if (updates.days_in_pool !== undefined) {
      fields.push('days_in_pool = ?')
      values.push(updates.days_in_pool)
    }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP')
      values.push(unit)

      // Skip tracking update for now
    }
  }


  /**
   * Store RentIQ results for historical tracking
   */
  private async storeRentIQResults(results: RentIQResults): Promise<void> {
    // Stub: skip archival during migration
    console.log(`[RENTIQ_ADVANCED] (stub) Skipped persisting results for ${results.date}`)
  }

}

// Export singleton instance
export const rentiqAdvancedAnalytics = RentIQAdvancedAnalytics.getInstance()