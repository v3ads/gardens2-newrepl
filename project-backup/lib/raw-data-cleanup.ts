import { prisma } from './prisma'
import { withPrismaRetry } from './prisma-retry'

/**
 * Clean up raw AppFolio tables to keep only today and previous day data
 * This prevents the tables from growing indefinitely while maintaining 
 * the two-day buffer needed for the occupancy system
 */
export async function cleanupRawAppfolioData(): Promise<{
  success: boolean
  recordsDeleted: number
  error?: string
}> {
  return withPrismaRetry(async () => {
    try {
      console.log('[RAW_CLEANUP] Starting cleanup of raw AppFolio data...')
      
      // Calculate cutoff date (keep only today and yesterday)
      const today = new Date()
      const twoDaysAgo = new Date(today)
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
      
      const cutoffDate = twoDaysAgo.toISOString()
      
      console.log(`[RAW_CLEANUP] Deleting records older than: ${cutoffDate}`)
      
      let totalDeleted = 0
      
      // Clean up each raw table
      const tables = [
        'rawAppfolioLease',
        'rawAppfolioUnit', 
        'rawAppfolioTenant',
        'rawAppfolioTransaction'
      ]
      
      for (const tableName of tables) {
        try {
          let deleted = 0
          
          switch (tableName) {
            case 'rawAppfolioLease':
              const leaseResult = await prisma.rawAppfolioLease.deleteMany({
                where: {
                  ingestedAt: {
                    lt: new Date(cutoffDate)
                  }
                }
              })
              deleted = leaseResult.count
              break
              
            case 'rawAppfolioUnit':
              const unitResult = await prisma.rawAppfolioUnit.deleteMany({
                where: {
                  ingestedAt: {
                    lt: new Date(cutoffDate)
                  }
                }
              })
              deleted = unitResult.count
              break
              
            case 'rawAppfolioTenant':
              const tenantResult = await prisma.rawAppfolioTenant.deleteMany({
                where: {
                  ingestedAt: {
                    lt: new Date(cutoffDate)
                  }
                }
              })
              deleted = tenantResult.count
              break
              
            case 'rawAppfolioTransaction':
              const transactionResult = await prisma.rawAppfolioTransaction.deleteMany({
                where: {
                  ingestedAt: {
                    lt: new Date(cutoffDate)
                  }
                }
              })
              deleted = transactionResult.count
              break
          }
          
          console.log(`[RAW_CLEANUP] Deleted ${deleted} records from ${tableName}`)
          totalDeleted += deleted
          
        } catch (tableError) {
          console.warn(`[RAW_CLEANUP] Error cleaning ${tableName}:`, tableError)
          // Continue with other tables even if one fails
        }
      }
      
      console.log(`[RAW_CLEANUP] ✅ Cleanup complete: ${totalDeleted} total records deleted`)
      
      return {
        success: true,
        recordsDeleted: totalDeleted
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[RAW_CLEANUP] ❌ Cleanup failed:', error)
      
      return {
        success: false,
        recordsDeleted: 0,
        error: errorMessage
      }
    }
  })
}

/**
 * Get current raw data statistics
 */
export async function getRawDataStats(): Promise<{
  totalRecords: number
  tableStats: Array<{ table: string; count: number; oldestRecord?: Date; newestRecord?: Date }>
}> {
  return withPrismaRetry(async () => {
    try {
      const stats = []
      let totalRecords = 0
      
      // Check rawAppfolioLease
      const leaseCount = await prisma.rawAppfolioLease.count()
      const leaseOldest = await prisma.rawAppfolioLease.findFirst({
        select: { ingestedAt: true },
        orderBy: { ingestedAt: 'asc' }
      })
      const leaseNewest = await prisma.rawAppfolioLease.findFirst({
        select: { ingestedAt: true },
        orderBy: { ingestedAt: 'desc' }
      })
      
      stats.push({
        table: 'rawAppfolioLease',
        count: leaseCount,
        oldestRecord: leaseOldest?.ingestedAt,
        newestRecord: leaseNewest?.ingestedAt
      })
      totalRecords += leaseCount
      
      // Check rawAppfolioUnit
      const unitCount = await prisma.rawAppfolioUnit.count()
      if (unitCount > 0) {
        const unitOldest = await prisma.rawAppfolioUnit.findFirst({
          select: { ingestedAt: true },
          orderBy: { ingestedAt: 'asc' }
        })
        const unitNewest = await prisma.rawAppfolioUnit.findFirst({
          select: { ingestedAt: true },
          orderBy: { ingestedAt: 'desc' }
        })
        
        stats.push({
          table: 'rawAppfolioUnit',
          count: unitCount,
          oldestRecord: unitOldest?.ingestedAt,
          newestRecord: unitNewest?.ingestedAt
        })
        totalRecords += unitCount
      }
      
      // Check rawAppfolioTenant
      const tenantCount = await prisma.rawAppfolioTenant.count()
      if (tenantCount > 0) {
        const tenantOldest = await prisma.rawAppfolioTenant.findFirst({
          select: { ingestedAt: true },
          orderBy: { ingestedAt: 'asc' }
        })
        const tenantNewest = await prisma.rawAppfolioTenant.findFirst({
          select: { ingestedAt: true },
          orderBy: { ingestedAt: 'desc' }
        })
        
        stats.push({
          table: 'rawAppfolioTenant',
          count: tenantCount,
          oldestRecord: tenantOldest?.ingestedAt,
          newestRecord: tenantNewest?.ingestedAt
        })
        totalRecords += tenantCount
      }
      
      // Check rawAppfolioTransaction
      const transactionCount = await prisma.rawAppfolioTransaction.count()
      if (transactionCount > 0) {
        const transactionOldest = await prisma.rawAppfolioTransaction.findFirst({
          select: { ingestedAt: true },
          orderBy: { ingestedAt: 'asc' }
        })
        const transactionNewest = await prisma.rawAppfolioTransaction.findFirst({
          select: { ingestedAt: true },
          orderBy: { ingestedAt: 'desc' }
        })
        
        stats.push({
          table: 'rawAppfolioTransaction',
          count: transactionCount,
          oldestRecord: transactionOldest?.ingestedAt,
          newestRecord: transactionNewest?.ingestedAt
        })
        totalRecords += transactionCount
      }
      
      return {
        totalRecords,
        tableStats: stats
      }
      
    } catch (error) {
      console.error('[RAW_CLEANUP] Error getting stats:', error)
      return {
        totalRecords: 0,
        tableStats: []
      }
    }
  })
}