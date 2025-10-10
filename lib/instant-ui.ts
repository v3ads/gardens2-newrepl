// Instant UI feedback system for immediate user response
interface InstantData {
  financial: any
  occupancy: any
  tenant: any
  rentiq: any
}

class InstantUIManager {
  private static instantData: Partial<InstantData> = {}
  private static lastSnapshot: string = ''

  // Store data for instant UI responses
  static storeInstantData(category: keyof InstantData, data: any): void {
    this.instantData[category] = data
    this.lastSnapshot = new Date().toISOString().split('T')[0]
    console.log(`[INSTANT_UI] 💾 Stored ${category} data for instant loading`)
  }

  // Get instant data if available (returns immediately)
  static getInstantData(category: keyof InstantData): {
    data: any | null
    hasData: boolean
    isToday: boolean
  } {
    const data = this.instantData[category]
    const isToday = this.lastSnapshot === new Date().toISOString().split('T')[0]
    
    return {
      data: data || null,
      hasData: !!data,
      isToday
    }
  }

  // Preload data in background for next navigation
  static async preloadNextPage(category: keyof InstantData): Promise<void> {
    try {
      console.log(`[INSTANT_UI] 🚀 Preloading ${category} for next navigation...`)
      
      let data: any
      switch (category) {
        case 'financial':
          const { FinancialAnalytics } = await import('./financial-analytics')
          data = await FinancialAnalytics.getFinancialMetrics()
          break
          
        case 'occupancy':
          const { getOccupancyKPIs } = await import('./occupancy-analytics')
          data = await getOccupancyKPIs()
          break
          
        case 'tenant':
          const tenantModule = await import('./tenant-etl')
          data = await tenantModule.buildTenantMart()
          break
          
        case 'rentiq':
          const rentiqModule = await import('./rentiq-analytics')
          const rentiqAnalytics = rentiqModule.RentIQAnalytics.getInstance()
          data = await rentiqAnalytics.calculateRentIQ()
          break
          
        default:
          return
      }
      
      this.storeInstantData(category, data)
      console.log(`[INSTANT_UI] ✅ Preloaded ${category} successfully`)
      
    } catch (error) {
      console.error(`[INSTANT_UI] ❌ Failed to preload ${category}:`, error)
    }
  }

  // Progressive loading strategy
  static async progressiveLoad<T>(
    category: keyof InstantData,
    freshDataFn: () => Promise<T>
  ): Promise<{
    instantData: T | null
    freshData: Promise<T>
    hasInstant: boolean
  }> {
    const instant = this.getInstantData(category)
    
    // Start fresh data fetch immediately (don't await)
    const freshDataPromise = freshDataFn().then(data => {
      this.storeInstantData(category, data)
      return data
    })
    
    return {
      instantData: instant.hasData && instant.isToday ? instant.data : null,
      freshData: freshDataPromise,
      hasInstant: instant.hasData && instant.isToday
    }
  }

  // Clear instant data when sync occurs
  static clearInstantData(): void {
    this.instantData = {}
    this.lastSnapshot = ''
    console.log('[INSTANT_UI] 🗑️ Cleared instant data cache')
  }

  // Get status of instant data
  static getStatus(): {
    categories: (keyof InstantData)[]
    lastSnapshot: string
    isToday: boolean
  } {
    return {
      categories: Object.keys(this.instantData) as (keyof InstantData)[],
      lastSnapshot: this.lastSnapshot,
      isToday: this.lastSnapshot === new Date().toISOString().split('T')[0]
    }
  }
}

export { InstantUIManager }