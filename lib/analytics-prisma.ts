// Removed server-only import for worker compatibility
import { prisma } from './prisma'
import { withPrismaRetry } from './prisma-retry'

// Type definitions for better TypeScript support
type PrismaDate = Date | string

// Direct Prisma-based analytics operations - replaces the broken analytics-db-pg adapter
// This provides reliable, consistent database operations using the actual Prisma schema

export interface AnalyticsMasterRecord {
  snapshotDate: Date
  propertyId: string
  unitCode: string
  bedspaceCode?: string | null
  tenantId?: string | null
  leaseId?: string | null
  isOccupied: boolean
  studentFlag: boolean
  primaryTenantFlag?: boolean | null
  marketRent?: number | null
  mrr?: number | null
  moveIn?: Date | null
  moveOut?: Date | null
  leaseStart?: Date | null
  leaseEnd?: Date | null
  daysVacant?: number | null
  vacancyLoss?: number | null
}

export class AnalyticsPrismaService {
  
  /**
   * DEPRECATED: Clear all analytics master data for a specific snapshot date
   * PERFORMANCE IMPROVEMENT: Use upsertAnalyticsMaster() instead for incremental updates
   */
  static async clearAnalyticsMaster(snapshotDate: Date): Promise<void> {
    console.log(`[ANALYTICS_PRISMA] ⚠️ clearAnalyticsMaster() is deprecated - use upsertAnalyticsMaster() for better performance`)
    return withPrismaRetry(async () => {
      const deletedCount = await prisma.analyticsMaster.deleteMany({
        where: { snapshotDate }
      })
      console.log(`[ANALYTICS_PRISMA] Cleared ${deletedCount.count} analytics_master records for ${snapshotDate.toISOString().split('T')[0]}`)
    })
  }

  /**
   * PERFORMANCE IMPROVEMENT: Efficient upsert for analytics_master records
   * Uses ON CONFLICT for incremental updates instead of delete+rebuild
   */
  static async upsertAnalyticsMaster(records: Array<{
    snapshotDate: Date
    propertyId: string
    unitCode: string
    isOccupied: boolean
    marketRent?: number
    mrr?: number
    tenantId?: string
    leaseId?: string
  }>): Promise<{ count: number }> {
    return withPrismaRetry(async () => {
      console.log(`[ANALYTICS_PRISMA] Upserting ${records.length} analytics_master records (incremental mode)`)
      
      let totalUpserted = 0
      const BATCH_SIZE = 300
      
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE)
        
        for (const record of batch) {
          await prisma.$executeRaw`
            INSERT INTO analytics_master ("snapshot_date", "property_id", "unit_code", "is_occupied", "market_rent", "mrr", "tenant_id", "lease_id", "updated_at")
            VALUES (${record.snapshotDate}, ${record.propertyId}, ${record.unitCode}, ${record.isOccupied}, ${record.marketRent || null}, ${record.mrr || null}, ${record.tenantId || null}, ${record.leaseId || null}, ${new Date()})
            ON CONFLICT ("snapshot_date", "unit_code")
            DO UPDATE SET
              "is_occupied" = EXCLUDED."is_occupied",
              "market_rent" = EXCLUDED."market_rent",
              "mrr" = EXCLUDED."mrr",
              "tenant_id" = EXCLUDED."tenant_id",
              "lease_id" = EXCLUDED."lease_id",
              "updated_at" = EXCLUDED."updated_at"
          `
          totalUpserted++
        }
        
        console.log(`[ANALYTICS_PRISMA] Upserted batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(records.length/BATCH_SIZE)}: ${batch.length} records`)
      }
      
      console.log(`[ANALYTICS_PRISMA] ✅ Upserted ${totalUpserted} analytics_master records (incremental)`)
      return { count: totalUpserted }
    })
  }

  /**
   * Bulk insert analytics master records using Prisma
   */
  static async insertAnalyticsMaster(records: AnalyticsMasterRecord[]): Promise<{ count: number }> {
    return withPrismaRetry(async () => {
      if (records.length === 0) {
        return { count: 0 }
      }

      // Convert to Prisma format
      const prismaData = records.map(record => ({
        snapshotDate: record.snapshotDate,
        propertyId: record.propertyId,
        unitCode: record.unitCode,
        bedspaceCode: record.bedspaceCode || null,
        tenantId: record.tenantId || null,
        leaseId: record.leaseId || null,
        isOccupied: record.isOccupied,
        studentFlag: record.studentFlag,
        primaryTenantFlag: record.primaryTenantFlag || null,
        marketRent: record.marketRent || null,
        mrr: record.mrr || null,
        moveIn: record.moveIn || null,
        moveOut: record.moveOut || null,
        leaseStart: record.leaseStart || null,
        leaseEnd: record.leaseEnd || null,
        daysVacant: record.daysVacant || null,
        vacancyLoss: record.vacancyLoss || null,
        updatedAt: new Date()
      }))

      // Use createMany for efficient bulk insert
      const result = await prisma.analyticsMaster.createMany({
        data: prismaData,
        skipDuplicates: true
      })

      console.log(`[ANALYTICS_PRISMA] ✅ Inserted ${result.count} analytics_master records`)
      return { count: result.count }
    })
  }

  /**
   * Get analytics master records for a specific snapshot date
   */
  static async getAnalyticsMaster(snapshotDate: Date): Promise<AnalyticsMasterRecord[]> {
    return withPrismaRetry(async () => {
      const records = await prisma.analyticsMaster.findMany({
        where: { snapshotDate },
        orderBy: { unitCode: 'asc' }
      })

      return records.map(record => ({
        snapshotDate: record.snapshotDate,
        propertyId: record.propertyId,
        unitCode: record.unitCode,
        bedspaceCode: record.bedspaceCode || undefined,
        tenantId: record.tenantId || undefined,
        leaseId: record.leaseId || undefined,
        isOccupied: record.isOccupied,
        studentFlag: record.studentFlag,
        primaryTenantFlag: record.primaryTenantFlag || undefined,
        marketRent: record.marketRent || undefined,
        mrr: record.mrr || undefined,
        moveIn: record.moveIn || undefined,
        moveOut: record.moveOut || undefined,
        leaseStart: record.leaseStart || undefined,
        leaseEnd: record.leaseEnd || undefined,
        daysVacant: record.daysVacant || undefined,
        vacancyLoss: record.vacancyLoss || undefined
      }))
    })
  }

  /**
   * Count analytics master records for a specific snapshot date
   */
  static async countAnalyticsMaster(snapshotDate: Date): Promise<number> {
    return withPrismaRetry(async () => {
      return await prisma.analyticsMaster.count({
        where: { snapshotDate }
      })
    })
  }

  /**
   * Get analytics master records with filter
   */
  static async getAnalyticsMasterFiltered(
    snapshotDate: Date, 
    filters: {
      isOccupied?: boolean
      studentFlag?: boolean
      unitCodes?: string[]
    } = {}
  ): Promise<AnalyticsMasterRecord[]> {
    return withPrismaRetry(async () => {
      const where: any = { snapshotDate }
      
      if (filters.isOccupied !== undefined) {
        where.isOccupied = filters.isOccupied
      }
      
      if (filters.studentFlag !== undefined) {
        where.studentFlag = filters.studentFlag
      }
      
      if (filters.unitCodes && filters.unitCodes.length > 0) {
        where.unitCode = { in: filters.unitCodes }
      }

      const records = await prisma.analyticsMaster.findMany({
        where,
        orderBy: { unitCode: 'asc' }
      })

      return records.map(record => ({
        snapshotDate: record.snapshotDate,
        propertyId: record.propertyId,
        unitCode: record.unitCode,
        bedspaceCode: record.bedspaceCode || undefined,
        tenantId: record.tenantId || undefined,
        leaseId: record.leaseId || undefined,
        isOccupied: record.isOccupied,
        studentFlag: record.studentFlag,
        primaryTenantFlag: record.primaryTenantFlag || undefined,
        marketRent: record.marketRent || undefined,
        mrr: record.mrr || undefined,
        moveIn: record.moveIn || undefined,
        moveOut: record.moveOut || undefined,
        leaseStart: record.leaseStart || undefined,
        leaseEnd: record.leaseEnd || undefined,
        daysVacant: record.daysVacant || undefined,
        vacancyLoss: record.vacancyLoss || undefined
      }))
    })
  }

  /**
   * Build analytics master data from master CSV data
   */
  static async buildFromMasterCsv(snapshotDate: Date): Promise<{ success: boolean; recordsProcessed: number; error?: string }> {
    try {
      console.log(`[ANALYTICS_PRISMA] Building analytics master from CSV data for ${snapshotDate.toISOString().split('T')[0]}`)
      
      // Clear existing data for this snapshot date
      await this.clearAnalyticsMaster(snapshotDate)
      
      // Get master CSV data
      const csvData = await prisma.masterCsvData.findMany({
        orderBy: { unit: 'asc' }
      })
      
      if (csvData.length === 0) {
        return { success: false, recordsProcessed: 0, error: 'No master CSV data available' }
      }
      
      // Transform CSV data to analytics master format
      const analyticsRecords: AnalyticsMasterRecord[] = csvData.map(record => {
        const isVacant = record.tenantStatus?.toLowerCase().includes('vacant') || false
        const isStudent = record.tenantType?.toLowerCase().includes('student') || false
        
        return {
          snapshotDate,
          propertyId: 'default', // You can enhance this based on your needs
          unitCode: record.unit,
          bedspaceCode: record.unit, // Can be enhanced with parsing
          tenantId: record.fullName ? `tenant_${record.unit}` : null,
          leaseId: record.fullName ? `lease_${record.unit}` : null,
          isOccupied: !isVacant,
          studentFlag: isStudent,
          primaryTenantFlag: record.primaryTenant === 'Yes',
          marketRent: record.marketRent || null,
          mrr: record.monthlyRent || null,
          moveIn: record.moveInDate ? new Date(record.moveInDate) : null,
          moveOut: null, // Not available in CSV
          leaseStart: record.leaseStartDate ? new Date(record.leaseStartDate) : null,
          leaseEnd: record.leaseEndDate ? new Date(record.leaseEndDate) : null,
          daysVacant: null, // Can be calculated
          vacancyLoss: isVacant ? record.marketRent : null
        }
      })
      
      // Insert all records
      const result = await this.insertAnalyticsMaster(analyticsRecords)
      
      console.log(`[ANALYTICS_PRISMA] ✅ Built analytics master: ${result.count} records`)
      return { success: true, recordsProcessed: result.count }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[ANALYTICS_PRISMA] ❌ Failed to build analytics master:', error)
      return { success: false, recordsProcessed: 0, error: errorMessage }
    }
  }
}