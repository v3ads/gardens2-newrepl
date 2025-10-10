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

export class RentIQAnalytics {
  private static instance: RentIQAnalytics
  
  static getInstance(): RentIQAnalytics {
    if (!RentIQAnalytics.instance) {
      RentIQAnalytics.instance = new RentIQAnalytics()
    }
    return RentIQAnalytics.instance
  }

  /**
   * Calculate RentIQ results for a given date (defaults to latest available date)
   */
  async calculateRentIQ(targetDate?: string): Promise<RentIQResults> {
    try {
      // If no date provided, use the latest available date
      if (!targetDate) {
        const latestDateResult = await prisma.masterTenantData.aggregate({
          _max: { snapshotDate: true }
        })
        targetDate = latestDateResult._max.snapshotDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]
      }
      
      console.log(`[RENTIQ] Calculating RentIQ for date: ${targetDate}`)
      
      // TIMEZONE FIX: Use date range query to handle timezone offsets in database
      // Eastern date "2025-10-10" may be stored as 2025-10-10T04:00:00.000Z in DB
      const startOfDay = new Date(`${targetDate}T00:00:00.000Z`)
      const endOfDay = new Date(`${targetDate}T23:59:59.999Z`)
      
      // Get master CSV data with actual unit type information from master.csv (unique units only)
      let masterDataRaw = await prisma.masterTenantData.findMany({
        where: {
          snapshotDate: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        // We'll join manually since Prisma doesn't have the relation set up
        orderBy: {
          unitCode: 'asc'
        }
      })
      
      // FALLBACK: If no data found for exact date, use latest available snapshot
      if (masterDataRaw.length === 0) {
        console.warn(`[RENTIQ] No data found for ${targetDate}, using latest snapshot`)
        masterDataRaw = await prisma.masterTenantData.findMany({
          orderBy: {
            snapshotDate: 'desc'
          },
          take: 182 // Get latest snapshot (all units)
        })
      }

      // Join with master CSV data manually
      const masterCsvData = await prisma.masterCsvData.findMany()
      const csvDataMap = new Map(masterCsvData.map(d => [d.unit, d]))
      
      // Note: Vacancy tracking not yet implemented in PostgreSQL schema
      // Will be added in future version for enhanced days vacant calculation
      const vacancyMap = new Map()
      
      const masterData = masterDataRaw.map(mtd => ({
        'Unit': mtd.unitCode,
        'Tenant Status': mtd.isOccupied ? 'Current' : 'Vacant',
        'Monthly Rent': mtd.mrrAmount,
        'Market Rent': csvDataMap.get(mtd.unitCode)?.marketRent || mtd.marketRent, // Use CSV market rent (correct) over masterTenantData (NULL)
        'Unit Type': csvDataMap.get(mtd.unitCode)?.unitType || null,
        'Days Vacant': csvDataMap.get(mtd.unitCode)?.daysVacant || 0
      }))

      console.log(`[RENTIQ] Found ${masterData.length} units in master tenant data for ${targetDate}`)

      if (masterData.length === 0) {
        console.warn(`[RENTIQ] No master tenant data found for date: ${targetDate}`)
        throw new Error(`No master tenant data available for ${targetDate}`)
      }

      // Get total unique units from master.csv (the source of truth)
      const totalUnitsQuery = await prisma.masterCsvData.count()

      // Get occupied units from master tenant data
      const currentUnits = masterData.filter(row => row['Tenant Status'] === 'Current')
      
      // Calculate basic occupancy metrics using master.csv as truth
      const totalUnits = totalUnitsQuery || 182 // Use master.csv count or fallback to 182
      const occupiedUnits = currentUnits.length
      const currentOccupancy = (occupiedUnits / totalUnits) * 100
      
      // Target is 95% occupancy
      const targetOccupancy = 95
      const targetOccupiedUnits = Math.ceil((targetOccupancy / 100) * totalUnits) // 173 units
      const allowedVacantUnits = totalUnits - targetOccupiedUnits // 9 units
      
      // Find vacant units (any unit where Tenant Status != "Current")
      const vacantUnits = masterData.filter(row => row['Tenant Status'] !== 'Current')
      
      // Calculate RentIQ Pool: vacant units minus allowed vacant units (9)
      const rentiqPoolCount = Math.max(0, vacantUnits.length - allowedVacantUnits)
      const unitsNeededFor95 = Math.max(0, targetOccupiedUnits - occupiedUnits)
      
      // RentIQ is active if pool count > 0
      const rentiqActive = rentiqPoolCount > 0
      
      console.log(`[RENTIQ] Occupancy: ${occupiedUnits}/${totalUnits} (${currentOccupancy.toFixed(1)}%), Vacant: ${vacantUnits.length}, Pool: ${rentiqPoolCount}`)

      // Calculate pricing for RentIQ pool units
      const rentiqUnits: RentIQUnit[] = []
      
      if (rentiqActive && vacantUnits.length > 0) {
        // Sort vacant units by some criteria (e.g., by unit number) and take the pool count
        const poolUnits = vacantUnits
          .sort((a, b) => a.Unit.localeCompare(b.Unit))
          .slice(0, rentiqPoolCount)
        
        const thresholdsArray = await this.getThresholdsArray()
        
        for (const unit of poolUnits) {
          const marketRent = this.parseRent(unit['Market Rent'])
          const monthlyRent = this.parseRent(unit['Monthly Rent'])
          const daysVacant = unit['Days Vacant'] || 0
          const unitType = unit['Unit Type']
          
          // Assign category based on unit type or market rent
          const assignedCategory = this.assignCategoryFromUnitType(unitType, marketRent, thresholdsArray)
          const minimumThreshold = this.getThresholdForCategory(assignedCategory, thresholdsArray)
          
          // Calculate progressive suggested rent
          const { suggestedRent, tier, capApplied } = this.calculateProgressiveSuggestedRent(
            marketRent || 0,
            daysVacant,
            minimumThreshold
          )
          
          rentiqUnits.push({
            unit: unit.Unit || '',
            tenant_status: unit['Tenant Status'] || '',
            monthly_rent: monthlyRent,
            market_rent: marketRent,
            unit_type: unitType,
            suggested_new_rent: suggestedRent,
            pricing_tier: tier,
            days_vacant: daysVacant,
            assigned_category: assignedCategory,
            minimum_threshold: minimumThreshold,
            cap_applied: capApplied,
            days_in_pool: daysVacant
          })
        }
      }

      const results: RentIQResults = {
        date: targetDate!,
        current_occupancy: Math.round(currentOccupancy * 100) / 100,
        total_units: totalUnits,
        occupied_units: occupiedUnits,
        target_occupancy: targetOccupancy,
        target_occupied_units: targetOccupiedUnits,
        rentiq_pool_count: rentiqPoolCount,
        units_needed_for_95: unitsNeededFor95,
        rentiq_active: rentiqActive,
        rentiq_units: rentiqUnits,
        thresholds: await this.getThresholdsArray() // Load actual thresholds
      }

      // Store results in database for caching
      await this.storeRentIQResults(results)
      
      console.log(`[RENTIQ] ✅ Calculated RentIQ: ${rentiqPoolCount} units in pool, active: ${rentiqActive}`)
      return results

    } catch (error) {
      console.error(`[RENTIQ] Error calculating RentIQ:`, error)
      throw error
    }
  }

  /**
   * Assign category from unit type or fallback to market rent
   */
  private assignCategoryFromUnitType(unitType: string | null, marketRent: number | null, thresholds: RentIQThreshold[]): string {
    if (unitType) {
      const category = this.mapUnitTypeToCategory(unitType)
      if (category) {
        return category
      }
    }
    
    // Fallback to market rent based assignment
    return this.assignCategoryByMarketRent(marketRent || 0, thresholds)
  }

  /**
   * Map unit types to RentIQ categories
   */
  private mapUnitTypeToCategory(unitType: string): string | null {
    const type = unitType.toLowerCase()
    
    // Martinique/Nautica = Premium, Monaco = Basic, Capri = Upgraded
    if ((type.includes('martinique') || type.includes('nautica')) && type.includes('furnished')) {
      return 'Premium-Furnished'
    }
    if ((type.includes('martinique') || type.includes('nautica')) && type.includes('unfurnished')) {
      return 'Premium-Unfurnished'
    }
    if (type.includes('monaco') && type.includes('furnished')) {
      return 'Basic-Furnished'
    }
    if (type.includes('monaco') && type.includes('unfurnished')) {
      return 'Basic-Unfurnished'
    }
    if (type.includes('capri') && type.includes('furnished')) {
      return 'Upgraded-Furnished'
    }
    if (type.includes('capri') && type.includes('unfurnished')) {
      return 'Upgraded-Unfurnished'
    }
    if (type.includes('student')) {
      return 'Student Unit'
    }
    
    return null
  }

  /**
   * Assign category based on exact market rent match (fallback)
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
    daysVacant: number,
    minimumThreshold: number
  ): { suggestedRent: number; tier: 'Tier 1' | 'Tier 2' | 'Tier 3'; capApplied: boolean } {
    
    // Determine tier based on market rent
    let tier: 'Tier 1' | 'Tier 2' | 'Tier 3'
    if (marketRent >= 2300) {
      tier = 'Tier 1'
    } else if (marketRent >= 1800) {
      tier = 'Tier 2'
    } else {
      tier = 'Tier 3'
    }

    // Progressive discount based on days vacant
    let discount = 0
    
    if (daysVacant <= 6) {
      // Days 1-6
      discount = tier === 'Tier 1' ? 0.15 : tier === 'Tier 2' ? 0.10 : 0.00
    } else if (daysVacant <= 13) {
      // Days 7-13
      discount = tier === 'Tier 1' ? 0.20 : tier === 'Tier 2' ? 0.15 : 0.05
    } else if (daysVacant <= 20) {
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
   * Parse rent string to number
   */
  private parseRent(rentStr: any): number | null {
    if (!rentStr) return null
    
    const cleanStr = String(rentStr).replace(/[$,\s]/g, '')
    const num = parseFloat(cleanStr)
    
    return isNaN(num) ? null : num
  }

  /**
   * Store RentIQ results in database
   */
  private async storeRentIQResults(results: RentIQResults): Promise<void> {
    try {
      const key = `rentiq_results_${results.date}`
      
      // Store in a simple key-value table
      await prisma.kvStore.upsert({
        where: { key },
        update: {
          value: JSON.stringify(results),
          updatedAt: new Date()
        },
        create: {
          key,
          value: JSON.stringify(results),
          updatedAt: new Date()
        }
      })

      console.log(`[RENTIQ] Stored results for ${results.date}`)
    } catch (error) {
      console.warn(`[RENTIQ] Failed to store results:`, error)
      // Non-critical error - don't fail the calculation
    }
  }

  /**
   * Get latest RentIQ results from cache
   */
  async getLatestRentIQResults(): Promise<RentIQResults | null> {
    try {
      // Get the most recent RentIQ results
      const result = await prisma.kvStore.findFirst({
        where: {
          key: {
            startsWith: 'rentiq_results_'
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      })

      if (result) {
        return JSON.parse(result.value) as RentIQResults
      }
      
      return null
    } catch (error) {
      console.warn(`[RENTIQ] Failed to get cached results:`, error)
      return null
    }
  }

  /**
   * Get RentIQ results for a specific date
   */
  async getRentIQResults(date: string): Promise<RentIQResults | null> {
    try {
      const key = `rentiq_results_${date}`
      
      const result = await prisma.kvStore.findUnique({
        where: { key }
      })

      if (result) {
        return JSON.parse(result.value) as RentIQResults
      }
      
      return null
    } catch (error) {
      console.warn(`[RENTIQ] Failed to get results for ${date}:`, error)
      return null
    }
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
          console.log(`[RENTIQ] ✅ Loaded thresholds from database:`, parsed)
          return parsed
        } catch (error) {
          console.warn('[RENTIQ] Failed to parse stored thresholds, using defaults:', error)
        }
      }
    } catch (error) {
      console.warn('[RENTIQ] Failed to load thresholds from database, using defaults:', error)
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

    console.log(`[RENTIQ] Using default thresholds`)
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
      
      console.log(`[RENTIQ] ✅ Saved ${Object.keys(thresholds).length} thresholds to database:`, thresholds)
    } catch (error) {
      console.error('[RENTIQ] ❌ Failed to save thresholds:', error)
      throw new Error(`Failed to save thresholds: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
}