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
      
      // Get master CSV data with actual unit type information from master.csv (unique units only)
      const masterDataRaw = await prisma.masterTenantData.findMany({
        where: {
          snapshotDate: new Date(targetDate)
        },
        // We'll join manually since Prisma doesn't have the relation set up
        orderBy: {
          unitCode: 'asc'
        }
      })

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
        'Market Rent': mtd.marketRent,
        'Unit Type': csvDataMap.get(mtd.unitCode)?.unitType || 'Standard'
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
        
        for (const unit of poolUnits) {
          const marketRent = this.parseRent(unit['Market Rent'])
          const monthlyRent = this.parseRent(unit['Monthly Rent'])
          
          const { suggestedRent, tier } = this.calculateSuggestedRent(marketRent)
          
          // Get actual days vacant from vacancy data
          const vacancyInfo = vacancyMap.get(unit.Unit)
          let daysVacant = 0
          
          if (vacancyInfo && vacancyInfo.daysVacant) {
            daysVacant = vacancyInfo.daysVacant
          } else if (vacancyInfo && vacancyInfo.vacancyStartDate) {
            // Calculate days vacant from vacancy start date
            const vacancyStart = new Date(vacancyInfo.vacancyStartDate)
            const today = new Date(targetDate!)
            daysVacant = Math.floor((today.getTime() - vacancyStart.getTime()) / (1000 * 60 * 60 * 24))
          }
          
          rentiqUnits.push({
            unit: unit.Unit || '',
            tenant_status: unit['Tenant Status'] || '',
            monthly_rent: monthlyRent,
            market_rent: marketRent,
            unit_type: unit['Unit Type'] || null,
            suggested_new_rent: suggestedRent,
            pricing_tier: tier,
            days_vacant: Math.max(0, daysVacant), // Use actual vacancy days
            assigned_category: 'Standard', // Default category
            minimum_threshold: suggestedRent * 0.9, // 90% of suggested rent
            cap_applied: false, // Default no cap
            days_in_pool: 0 // Default value
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
        thresholds: [] // Default empty thresholds
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
   * Calculate suggested rent based on market rent and pricing tiers
   */
  private calculateSuggestedRent(marketRent: number | null): { suggestedRent: number; tier: 'Tier 1' | 'Tier 2' | 'Tier 3' } {
    if (!marketRent || marketRent <= 0) {
      return { suggestedRent: 0, tier: 'Tier 3' }
    }

    if (marketRent > 2000) {
      // Tier 1: 15% discount
      return { 
        suggestedRent: Math.round(marketRent * 0.85), 
        tier: 'Tier 1' 
      }
    } else if (marketRent >= 1700 && marketRent <= 2000) {
      // Tier 2: 10% discount
      return { 
        suggestedRent: Math.round(marketRent * 0.90), 
        tier: 'Tier 2' 
      }
    } else {
      // Tier 3: No discount, use market rent
      return { 
        suggestedRent: marketRent, 
        tier: 'Tier 3' 
      }
    }
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
}