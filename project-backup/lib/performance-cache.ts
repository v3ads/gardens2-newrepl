import { cache } from './cache'

// Enhanced caching system for analytics data
interface CachedMetrics {
  data: any
  computedAt: number
  snapshotDate: string
}

class PerformanceCache {
  private static readonly CACHE_DURATION = 10 * 60 * 1000 // 10 minutes
  private static readonly STALE_DURATION = 30 * 60 * 1000 // 30 minutes (stale-while-revalidate)

  // Enhanced cache with stale-while-revalidate pattern
  static async getCachedOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttlMinutes: number = 10
  ): Promise<{ data: T; fromCache: boolean; stale: boolean }> {
    const cached = cache.get<CachedMetrics>(key)
    const now = Date.now()

    // If cache exists and is fresh, return it
    if (cached && (now - cached.computedAt) < (ttlMinutes * 60 * 1000)) {
      console.log(`[PERF_CACHE] ⚡ Cache HIT (fresh): ${key}`)
      return { data: cached.data, fromCache: true, stale: false }
    }

    // If cache exists but is stale (< 30min), return stale and recompute in background
    if (cached && (now - cached.computedAt) < this.STALE_DURATION) {
      console.log(`[PERF_CACHE] ⚠️ Cache HIT (stale): ${key} - returning stale data`)
      
      // Return stale data immediately
      const result = { data: cached.data, fromCache: true, stale: true }
      
      // Recompute in background (fire and forget)
      setTimeout(async () => {
        try {
          console.log(`[PERF_CACHE] 🔄 Background refresh: ${key}`)
          const freshData = await computeFn()
          this.setCached(key, freshData, ttlMinutes)
          console.log(`[PERF_CACHE] ✅ Background refresh complete: ${key}`)
        } catch (error) {
          console.error(`[PERF_CACHE] ❌ Background refresh failed: ${key}`, error)
        }
      }, 0)
      
      return result
    }

    // No cache or expired - compute fresh
    console.log(`[PERF_CACHE] ❌ Cache MISS: ${key} - computing fresh data`)
    const data = await computeFn()
    this.setCached(key, data, ttlMinutes)
    return { data, fromCache: false, stale: false }
  }

  private static setCached(key: string, data: any, ttlMinutes: number): void {
    const cachedMetrics: CachedMetrics = {
      data,
      computedAt: Date.now(),
      snapshotDate: new Date().toISOString().split('T')[0]
    }
    cache.set(key, cachedMetrics, ttlMinutes * 60)
    console.log(`[PERF_CACHE] 💾 Cached: ${key} (TTL: ${ttlMinutes}m)`)
  }

  // Preload frequently accessed data
  static async preloadCriticalData(): Promise<void> {
    console.log('[PERF_CACHE] 🚀 Preloading critical analytics data...')
    
    const preloadTasks = [
      // Preload financial metrics
      this.preloadData('financial-metrics', async () => {
        const { FinancialAnalytics } = await import('./financial-analytics')
        return FinancialAnalytics.getFinancialMetrics()
      }),
      
      // Preload occupancy analytics
      this.preloadData('occupancy-kpis', async () => {
        const { getOccupancyKPIs } = await import('./occupancy-analytics')
        return getOccupancyKPIs()
      }),
      
      // Preload tenant analytics
      this.preloadData('tenant-analytics', async () => {
        const tenantModule = await import('./tenant-etl')
        return tenantModule.buildTenantMart() // Use the correct export
      })
    ]

    await Promise.allSettled(preloadTasks)
    console.log('[PERF_CACHE] ✅ Critical data preload complete')
  }

  private static async preloadData(key: string, computeFn: () => Promise<any>): Promise<void> {
    try {
      await this.getCachedOrCompute(key, computeFn, 15) // 15 min cache for preloaded data
    } catch (error) {
      console.error(`[PERF_CACHE] Failed to preload ${key}:`, error)
    }
  }

  // Invalidate cache for specific patterns
  static invalidatePattern(pattern: string): void {
    console.log(`[PERF_CACHE] 🗑️ Invalidating cache pattern: ${pattern}`)
    cache.clearPattern(pattern)
  }

  // Warm up cache with fresh data
  static async warmupCache(): Promise<void> {
    console.log('[PERF_CACHE] 🔥 Warming up cache...')
    cache.clear() // Clear stale cache
    await this.preloadCriticalData()
  }

  // Get cache statistics
  static getStats(): { 
    totalKeys: number
    patterns: { [key: string]: number }
  } {
    // This is a simplified version - actual implementation would track more metrics
    return {
      totalKeys: 0, // Would need to expose this from the cache class
      patterns: {
        'financial': 0,
        'occupancy': 0,
        'tenant': 0,
        'rentiq': 0
      }
    }
  }
}

export { PerformanceCache }