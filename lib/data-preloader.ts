// Background data preloader for instant navigation
import { PerformanceCache } from './performance-cache'
import { InstantUIManager } from './instant-ui'

class DataPreloader {
  private static isPreloading = false
  private static preloadPromise: Promise<void> | null = null

  // Aggressive preloading strategy
  static async preloadAllCriticalData(): Promise<void> {
    if (this.isPreloading) {
      return this.preloadPromise || Promise.resolve()
    }

    this.isPreloading = true
    console.log('[DATA_PRELOADER] 🚀 Starting aggressive data preload...')

    this.preloadPromise = this.executePreload()
    
    try {
      await this.preloadPromise
      console.log('[DATA_PRELOADER] ✅ All critical data preloaded successfully')
    } catch (error) {
      console.error('[DATA_PRELOADER] ❌ Preload failed:', error)
    } finally {
      this.isPreloading = false
      this.preloadPromise = null
    }
  }

  private static async executePreload(): Promise<void> {
    const preloadTasks = [
      // Financial metrics
      this.preloadFinancial(),
      
      // Occupancy analytics
      this.preloadOccupancy(),
      
      // RentIQ data
      this.preloadRentIQ(),
      
      // Features list
      this.preloadFeatures()
    ]

    // Execute all preloads in parallel
    await Promise.allSettled(preloadTasks)
  }

  private static async preloadFinancial(): Promise<void> {
    try {
      console.log('[DATA_PRELOADER] 💰 Preloading financial data...')
      const { FinancialAnalytics } = await import('./financial-analytics')
      const data = await FinancialAnalytics.getFinancialMetrics()
      InstantUIManager.storeInstantData('financial', data)
      console.log('[DATA_PRELOADER] ✅ Financial data preloaded')
    } catch (error) {
      console.error('[DATA_PRELOADER] ❌ Financial preload failed:', error)
    }
  }

  private static async preloadOccupancy(): Promise<void> {
    try {
      console.log('[DATA_PRELOADER] 🏠 Preloading occupancy data...')
      const { getOccupancyKPIs } = await import('./occupancy-analytics')
      const data = await getOccupancyKPIs()
      InstantUIManager.storeInstantData('occupancy', data)
      console.log('[DATA_PRELOADER] ✅ Occupancy data preloaded')
    } catch (error) {
      console.error('[DATA_PRELOADER] ❌ Occupancy preload failed:', error)
    }
  }

  private static async preloadRentIQ(): Promise<void> {
    try {
      console.log('[DATA_PRELOADER] 💰 Preloading RentIQ data...')
      const rentiqModule = await import('./rentiq-analytics')
      const rentiqAnalytics = rentiqModule.RentIQAnalytics.getInstance()
      const data = await rentiqAnalytics.calculateRentIQ()
      InstantUIManager.storeInstantData('rentiq', data)
      console.log('[DATA_PRELOADER] ✅ RentIQ data preloaded')
    } catch (error) {
      console.error('[DATA_PRELOADER] ❌ RentIQ preload failed:', error)
    }
  }

  private static async preloadFeatures(): Promise<void> {
    try {
      console.log('[DATA_PRELOADER] 🎛️ Preloading features list...')
      // Cache features for faster sidebar loading
      const { PerformanceCache } = await import('./performance-cache')
      await PerformanceCache.getCachedOrCompute(
        'features-list-admin',
        async () => {
          // Use a mock implementation since we can't fetch in Node.js context
          return ['jasmine', 'analytics', 'query', 'rentiq', 'overview', 'tasks']
        },
        30 // 30 minute cache for features
      )
      console.log('[DATA_PRELOADER] ✅ Features list preloaded')
    } catch (error) {
      console.error('[DATA_PRELOADER] ❌ Features preload failed:', error)
    }
  }

  // Smart preloading based on user behavior
  static async preloadBasedOnRoute(currentRoute: string): Promise<void> {
    console.log(`[DATA_PRELOADER] 🎯 Smart preload for route: ${currentRoute}`)

    switch (true) {
      case currentRoute.includes('/analytics'):
        // User is in analytics, preload all analytics data
        await this.preloadAllCriticalData()
        break
        
      case currentRoute.includes('/financial'):
        // User viewing financial, preload occupancy (likely next page)
        await this.preloadOccupancy()
        break
        
      case currentRoute.includes('/overview'):
        // User on overview, preload everything
        await this.preloadAllCriticalData()
        break
        
      case currentRoute.includes('/rentiq'):
        // User on RentIQ, preload financial data
        await this.preloadFinancial()
        break
        
      default:
        // Default: preload most commonly accessed data
        await Promise.allSettled([
          this.preloadFinancial(),
          this.preloadOccupancy()
        ])
    }
  }

  // Initialize on app startup
  static async initializeOnStartup(): Promise<void> {
    console.log('[DATA_PRELOADER] 🌟 Initializing data preloader on startup...')
    
    // Start preloading in background immediately
    setTimeout(() => {
      this.preloadAllCriticalData()
    }, 500) // Small delay to let main app load first
  }

  // Get preload status
  static getStatus(): {
    isPreloading: boolean
    instantDataStatus: any
    cacheStats: any
  } {
    return {
      isPreloading: this.isPreloading,
      instantDataStatus: InstantUIManager.getStatus(),
      cacheStats: PerformanceCache.getStats()
    }
  }
}

export { DataPreloader }