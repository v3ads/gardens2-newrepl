// Conditionally import server-only only in Next.js runtime
try {
  if (process.env.NODE_ENV && typeof window === 'undefined') {
    require('server-only');
  }
} catch (e) {
  // server-only not available or not in Next.js environment - continue
}
import { prisma, withPrismaRetry } from './prisma'
import { Prisma } from '@prisma/client'
import { EasternTimeManager } from './timezone-utils'

// Proper async repositories to replace the problematic analytics-db-pg adapter
// These provide reliable, awaited database operations using Prisma

export class MasterCsvRepository {
  static async createMany(records: Array<{
    unit: string
    firstName?: string
    lastName?: string
    fullName?: string
    phoneNumber?: string
    email?: string
    leaseStartDate?: string
    leaseEndDate?: string
    moveInDate?: string
    monthlyRent?: number
    marketRent?: number
    securityDeposit?: number
    tenantStatus?: string
    tenantType?: string
    primaryTenant?: string
    squareFeet?: string
    unitType?: string
    unitCategory?: string
    leasingAgent?: string
    nextRentIncrease?: string
    lastRentIncrease?: string
  }>): Promise<{ count: number }> {
    const dataWithTimestamp = records.map(record => ({
      unit: record.unit,
      firstName: record.firstName || null,
      lastName: record.lastName || null,
      fullName: record.fullName || null,
      phoneNumber: record.phoneNumber || null,
      email: record.email || null,
      leaseStartDate: record.leaseStartDate || null,
      leaseEndDate: record.leaseEndDate || null,
      moveInDate: record.moveInDate || null,
      monthlyRent: record.monthlyRent || 0,
      marketRent: record.marketRent || 0,
      securityDeposit: record.securityDeposit || 0,
      tenantStatus: record.tenantStatus || null,
      tenantType: record.tenantType || null,
      primaryTenant: record.primaryTenant || null,
      squareFeet: record.squareFeet || null,
      unitType: record.unitType || null,
      unitCategory: record.unitCategory || null,
      leasingAgent: record.leasingAgent || null,
      nextRentIncrease: record.nextRentIncrease || null,
      lastRentIncrease: record.lastRentIncrease || null,
      updatedAt: new Date()
    }))

    // Batch large operations to prevent PostgreSQL connection terminations
    return await this.batchInsert(dataWithTimestamp, (batch) => 
      prisma.masterCsvData.createMany({
        data: batch,
        skipDuplicates: true
      })
    )
  }

  // Helper method for batched database operations to prevent connection terminations
  static async batchInsert<T>(data: T[], operation: (batch: T[]) => Promise<{ count: number }>): Promise<{ count: number }> {
    const BATCH_SIZE = 1000 // Prevent PostgreSQL connection termination with large datasets
    let totalCount = 0
    
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE)
      try {
        const result = await operation(batch)
        totalCount += result.count
        console.log(`[BATCH_INSERT] Processed batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(data.length/BATCH_SIZE)}: ${result.count} records`)
        
        // Small delay between batches to prevent overwhelming connections
        if (i + BATCH_SIZE < data.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (error) {
        console.error(`[BATCH_INSERT] Error in batch ${Math.floor(i/BATCH_SIZE) + 1}:`, error)
        throw error
      }
    }
    
    return { count: totalCount }
  }

  static async upsert(record: {
    unit: string
    firstName?: string
    lastName?: string
    fullName?: string
    phoneNumber?: string
    email?: string
    leaseStartDate?: string
    leaseEndDate?: string
    moveInDate?: string
    monthlyRent?: number
    marketRent?: number
    securityDeposit?: number
    tenantStatus?: string
    tenantType?: string
    primaryTenant?: string
    squareFeet?: string
    unitType?: string
    unitCategory?: string
    leasingAgent?: string
    nextRentIncrease?: string
    lastRentIncrease?: string
  }): Promise<any> {
    return await prisma.masterCsvData.upsert({
      where: { unit: record.unit },
      create: {
        unit: record.unit,
        firstName: record.firstName || null,
        lastName: record.lastName || null,
        fullName: record.fullName || null,
        phoneNumber: record.phoneNumber || null,
        email: record.email || null,
        leaseStartDate: record.leaseStartDate || null,
        leaseEndDate: record.leaseEndDate || null,
        moveInDate: record.moveInDate || null,
        monthlyRent: record.monthlyRent || 0,
        marketRent: record.marketRent || 0,
        securityDeposit: record.securityDeposit || 0,
        tenantStatus: record.tenantStatus || null,
        tenantType: record.tenantType || null,
        primaryTenant: record.primaryTenant || null,
        squareFeet: record.squareFeet || null,
        unitType: record.unitType || null,
        unitCategory: record.unitCategory || null,
        leasingAgent: record.leasingAgent || null,
        nextRentIncrease: record.nextRentIncrease || null,
        lastRentIncrease: record.lastRentIncrease || null,
        updatedAt: new Date()
      },
      update: {
        firstName: record.firstName || null,
        lastName: record.lastName || null,
        fullName: record.fullName || null,
        phoneNumber: record.phoneNumber || null,
        email: record.email || null,
        leaseStartDate: record.leaseStartDate || null,
        leaseEndDate: record.leaseEndDate || null,
        moveInDate: record.moveInDate || null,
        monthlyRent: record.monthlyRent || 0,
        marketRent: record.marketRent || 0,
        securityDeposit: record.securityDeposit || 0,
        tenantStatus: record.tenantStatus || null,
        tenantType: record.tenantType || null,
        primaryTenant: record.primaryTenant || null,
        squareFeet: record.squareFeet || null,
        unitType: record.unitType || null,
        unitCategory: record.unitCategory || null,
        leasingAgent: record.leasingAgent || null,
        nextRentIncrease: record.nextRentIncrease || null,
        lastRentIncrease: record.lastRentIncrease || null,
        updatedAt: new Date()
      }
    })
  }

  static async findAll(): Promise<Array<{
    unit: string
    firstName: string | null
    lastName: string | null
    fullName: string | null
    phoneNumber: string | null
    email: string | null
    leaseStartDate: string | null
    leaseEndDate: string | null
    moveInDate: string | null
    monthlyRent: number
    marketRent: number
    securityDeposit: number
    tenantStatus: string | null
    tenantType: string | null
    primaryTenant: string | null
    squareFeet: string | null
    unitType: string | null
    unitCategory: string | null
    leasingAgent: string | null
    nextRentIncrease: string | null
    lastRentIncrease: string | null
  }>> {
    const records = await prisma.masterCsvData.findMany({
      orderBy: { unit: 'asc' }
    })

    return records.map(record => ({
      unit: record.unit || '',
      firstName: record.firstName,
      lastName: record.lastName,
      fullName: record.fullName,
      phoneNumber: record.phoneNumber,
      email: record.email,
      leaseStartDate: record.leaseStartDate,
      leaseEndDate: record.leaseEndDate,
      moveInDate: record.moveInDate,
      monthlyRent: record.monthlyRent,
      marketRent: record.marketRent,
      securityDeposit: record.securityDeposit,
      tenantStatus: record.tenantStatus,
      tenantType: record.tenantType,
      primaryTenant: record.primaryTenant,
      squareFeet: record.squareFeet,
      unitType: record.unitType,
      unitCategory: record.unitCategory,
      leasingAgent: record.leasingAgent,
      nextRentIncrease: record.nextRentIncrease,
      lastRentIncrease: record.lastRentIncrease
    }))
  }

  static async deleteAll(): Promise<{ count: number }> {
    console.log('[MASTER_CSV_REPO] ⚠️ deleteAll() is deprecated - use upsertMany() for better performance')
    return await prisma.masterCsvData.deleteMany()
  }

  /**
   * PERFORMANCE IMPROVEMENT: Incremental upsert for CSV data instead of delete+rebuild
   */
  static async upsertMany(records: Array<{
    unit: string
    firstName: string
    lastName: string
    fullName: string
    phoneNumber: string
    email: string
    leaseStartDate: string
    leaseEndDate: string
    moveInDate: string
    monthlyRent: number
    marketRent: number
    daysVacant?: number
    securityDeposit: number
    tenantStatus: string
    tenantType: string
    primaryTenant: string
    squareFeet: string
    unitType: string
    unitCategory: string
    leasingAgent: string
    nextRentIncrease: string
    lastRentIncrease: string
  }>): Promise<{ count: number }> {
    console.log(`[MASTER_CSV_REPO] Upserting ${records.length} CSV records (incremental mode)`)
    
    let totalUpserted = 0
    const BATCH_SIZE = 200
    
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      
      for (const record of batch) {
        try {
          const recordId = `csv_${record.unit}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          const daysVacant = (record as any).daysVacant || 0
          const { EasternTimeManager } = await import('./timezone-utils')
          const syncDate = EasternTimeManager.getCurrentEasternDate()
          await withPrismaRetry(() => prisma.$executeRaw`
            INSERT INTO master_csv_data ("id", "unit", "firstName", "lastName", "fullName", "phoneNumber", "email", "leaseStartDate", "leaseEndDate", "moveInDate", "monthlyRent", "marketRent", "daysVacant", "securityDeposit", "tenantStatus", "tenantType", "primaryTenant", "squareFeet", "unitType", "unitCategory", "leasingAgent", "nextRentIncrease", "lastRentIncrease", "syncDate", "createdAt", "updatedAt")
            VALUES (${recordId}, ${record.unit}, ${record.firstName}, ${record.lastName}, ${record.fullName}, ${record.phoneNumber}, ${record.email}, ${record.leaseStartDate}, ${record.leaseEndDate}, ${record.moveInDate}, ${record.monthlyRent}, ${record.marketRent}, ${daysVacant}, ${record.securityDeposit}, ${record.tenantStatus}, ${record.tenantType}, ${record.primaryTenant}, ${record.squareFeet}, ${record.unitType}, ${record.unitCategory}, ${record.leasingAgent}, ${record.nextRentIncrease}, ${record.lastRentIncrease}, ${syncDate}, ${new Date()}, ${new Date()})
            ON CONFLICT ("unit")
            DO UPDATE SET
              "firstName" = EXCLUDED."firstName",
              "lastName" = EXCLUDED."lastName", 
              "fullName" = EXCLUDED."fullName",
              "phoneNumber" = EXCLUDED."phoneNumber",
              "email" = EXCLUDED."email",
              "leaseStartDate" = EXCLUDED."leaseStartDate",
              "leaseEndDate" = EXCLUDED."leaseEndDate",
              "moveInDate" = EXCLUDED."moveInDate",
              "monthlyRent" = EXCLUDED."monthlyRent",
              "marketRent" = EXCLUDED."marketRent",
              "daysVacant" = EXCLUDED."daysVacant",
              "securityDeposit" = EXCLUDED."securityDeposit",
              "tenantStatus" = EXCLUDED."tenantStatus",
              "tenantType" = EXCLUDED."tenantType",
              "primaryTenant" = EXCLUDED."primaryTenant",
              "squareFeet" = EXCLUDED."squareFeet",
              "unitType" = EXCLUDED."unitType",
              "unitCategory" = EXCLUDED."unitCategory",
              "leasingAgent" = EXCLUDED."leasingAgent",
              "nextRentIncrease" = EXCLUDED."nextRentIncrease",
              "lastRentIncrease" = EXCLUDED."lastRentIncrease",
              "syncDate" = EXCLUDED."syncDate",
              "updatedAt" = EXCLUDED."updatedAt"
          `)
          totalUpserted++
        } catch (error) {
          console.error(`[MASTER_CSV_REPO] CRITICAL: Failed to upsert unit ${record.unit}:`, error)
          // Don't silently ignore upsert failures - they indicate real problems
          throw new Error(`Master CSV upsert failed for unit ${record.unit}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      
      console.log(`[MASTER_CSV_REPO] Upserted batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(records.length/BATCH_SIZE)}: ${batch.length} records`)
    }
    
    console.log(`[MASTER_CSV_REPO] ✅ Upserted ${totalUpserted} CSV records (incremental)`)
    return { count: totalUpserted }
  }
}

export class MasterTenantRepository {
  static async createMany(records: Array<{
    snapshotDate: Date
    unitCode: string
    isOccupied: boolean
    mrrAmount?: number
    marketRent?: number
  }>): Promise<{ count: number }> {
    console.log(`[MASTER_TENANT_REPO] Upserting ${records.length} master_tenant_data records (incremental mode)`)
    
    const dataWithTimestamp = records.map(record => ({
      snapshotDate: record.snapshotDate,
      unitCode: record.unitCode,
      isOccupied: record.isOccupied,
      mrrAmount: record.mrrAmount || 0,
      marketRent: record.marketRent || 0,
      updatedAt: new Date()
    }))

    // PERFORMANCE IMPROVEMENT: Use upsert instead of delete+rebuild
    let totalUpserted = 0
    
    // Process in batches to avoid transaction timeout
    const BATCH_SIZE = 500
    for (let i = 0; i < dataWithTimestamp.length; i += BATCH_SIZE) {
      const batch = dataWithTimestamp.slice(i, i + BATCH_SIZE)
      
      // Use PostgreSQL ON CONFLICT for efficient upserts
      for (const record of batch) {
        const recordId = `tenant_${record.unitCode}_${EasternTimeManager.toDateString(record.snapshotDate)}_${Math.random().toString(36).substr(2, 9)}`
        await prisma.$executeRaw`
          INSERT INTO master_tenant_data ("id", "snapshot_date", "unit_code", "is_occupied", "mrr_amount", "market_rent", "updated_at")
          VALUES (${recordId}, ${record.snapshotDate}, ${record.unitCode}, ${record.isOccupied}, ${record.mrrAmount}, ${record.marketRent}, ${record.updatedAt})
          ON CONFLICT ("snapshot_date", "unit_code") 
          DO UPDATE SET 
            "is_occupied" = EXCLUDED."is_occupied",
            "mrr_amount" = EXCLUDED."mrr_amount", 
            "market_rent" = EXCLUDED."market_rent",
            "updated_at" = EXCLUDED."updated_at"
        `
        totalUpserted++
      }
      
      console.log(`[MASTER_TENANT_REPO] Processed batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(dataWithTimestamp.length/BATCH_SIZE)}: ${batch.length} records`)
    }

    console.log(`[MASTER_TENANT_REPO] ✅ Upserted ${totalUpserted} master_tenant_data records (incremental)`)
    return { count: totalUpserted }
  }

  // REMOVED: Problematic upsert method that caused transaction timeouts
  // Use createMany() instead for efficient bulk operations

  static async findByDate(snapshotDate: Date): Promise<Array<{
    snapshot_date: string
    unit_code: string
    is_occupied: number
    mrr_amount: number
    market_rent: number
  }>> {
    const records = await prisma.masterTenantData.findMany({
      where: { snapshotDate },
      orderBy: { unitCode: 'asc' }
    })

    return records.map(record => ({
      snapshot_date: EasternTimeManager.toDateString(record.snapshotDate),
      unit_code: record.unitCode,
      is_occupied: record.isOccupied ? 1 : 0,
      mrr_amount: record.mrrAmount || 0,
      market_rent: record.marketRent || 0
    }))
  }

  static async findLatest(): Promise<Array<{
    snapshot_date: string
    unit_code: string
    is_occupied: number
    mrr_amount: number
    market_rent: number
  }>> {
    // Get the most recent snapshot date
    const latest = await prisma.masterTenantData.findFirst({
      select: { snapshotDate: true },
      orderBy: { snapshotDate: 'desc' }
    })

    if (!latest) return []

    return this.findByDate(latest.snapshotDate)
  }

  static async deleteAll(): Promise<{ count: number }> {
    return await prisma.masterTenantData.deleteMany()
  }

  static async deleteByDate(snapshotDate: Date): Promise<{ count: number }> {
    return await prisma.masterTenantData.deleteMany({
      where: { snapshotDate }
    })
  }
}

export class AppFolioRepository {
  
  // Helper method for work orders (raw SQL since Prisma model doesn't exist yet)
  static async batchInsertWorkOrders(data: Array<{ sourceId: string; payloadJson: any; ingestedAt: Date }>): Promise<{ count: number }> {
    let totalCount = 0
    
    for (const record of data) {
      try {
        await prisma.$executeRaw`
          INSERT INTO raw_appfolio_work_orders ("sourceId", "payloadJson", "ingestedAt")
          VALUES (${record.sourceId}, ${JSON.stringify(record.payloadJson)}::jsonb, ${record.ingestedAt})
          ON CONFLICT ("sourceId") DO NOTHING
        `
        totalCount += 1
      } catch (error) {
        console.warn(`[APPFOLIO_REPO] Failed to insert work order ${record.sourceId}:`, error)
      }
    }
    
    return { count: totalCount }
  }

  // Helper method for batched database operations to prevent connection terminations
  static async batchInsert<T>(data: T[], operation: (batch: T[]) => Promise<{ count: number }>): Promise<{ count: number }> {
    const BATCH_SIZE = 1000 // Prevent PostgreSQL connection termination with large datasets
    let totalCount = 0
    
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE)
      try {
        const result = await operation(batch)
        totalCount += result.count
        console.log(`[BATCH_INSERT] Processed batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(data.length/BATCH_SIZE)}: ${result.count} records`)
        
        // Small delay between batches to prevent overwhelming connections
        if (i + BATCH_SIZE < data.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (error) {
        console.error(`[BATCH_INSERT] Error in batch ${Math.floor(i/BATCH_SIZE) + 1}:`, error)
        throw error
      }
    }
    
    return { count: totalCount }
  }
  static async getReportCount(reportType: string): Promise<number> {
    console.log(`[APPFOLIO_REPO] Getting count for ${reportType}`)
    
    try {
      switch (reportType) {
        case 'rent_roll':
        case 'rent_roll_itemized':
          const rentRollCount = await prisma.rawAppfolioRentRoll.count()
          return rentRollCount

        case 'units':
        case 'unit_directory':
          const unitsCount = await prisma.rawAppfolioUnit.count()
          return unitsCount

        case 'tenants':
        case 'tenant_directory':
          const tenantsCount = await prisma.rawAppfolioTenant.count()
          return tenantsCount

        case 'lease_history':
          const leaseHistoryCount = await prisma.rawAppfolioLeaseHistory.count()
          return leaseHistoryCount

        case 'lease_expiration_detail':
          const leaseExpirationCount = await prisma.rawAppfolioLeaseExpirationDetail.count()
          return leaseExpirationCount

        case 'income_statement':
        case 'cash_flow':  
        case 'balance_sheet':
        case 'transactions':
        case 'owner_directory':
        case 'general_ledger':
        case 'trial_balance':
        case 'chart_of_accounts':
        case 'delinquency':
        case 'aged_receivables_detail':
        case 'charge_detail':
        case 'receivables_activity':
          const transactionCount = await prisma.rawAppfolioTransaction.count()
          return transactionCount

        default:
          console.warn(`[APPFOLIO_REPO] Unknown report type for count: ${reportType}`)
          return 0
      }
    } catch (error) {
      console.error(`[APPFOLIO_REPO] Failed to get count for ${reportType}:`, error)
      return 0
    }
  }

  static async insertRawReport(
    reportType: string, 
    records: Array<{ id: string; payload: any }>
  ): Promise<{ count: number }> {
    console.log(`[APPFOLIO_REPO] Inserting ${records.length} records for ${reportType}`)
    
    try {
      // Map to proper Prisma data structure based on report type
      switch (reportType) {
        case 'rent_roll':
        case 'rent_roll_itemized':
          // SCHEMA FIX: RawAppfolioRentRoll now has sourceId field for proper deduplication
          const rentRollData = records.map(record => ({
            sourceId: record.id,
            payloadJson: record.payload,
            ingestedAt: new Date()
          }))
          const result = await this.batchInsert(rentRollData, (batch: typeof rentRollData) => 
            prisma.rawAppfolioRentRoll.createMany({
              data: batch,
              skipDuplicates: true
            })
          )
          console.log(`[APPFOLIO_REPO] ✅ Inserted ${result.count} ${reportType} records`)
          return result

        case 'units':
        case 'unit_directory':
          const unitsData = records.map(record => ({
            sourceId: record.id,
            payloadJson: record.payload,
            ingestedAt: new Date()
          }))
          const unitsResult = await this.batchInsert(unitsData, (batch: typeof unitsData) =>
            prisma.rawAppfolioUnit.createMany({
              data: batch,
              skipDuplicates: true
            })
          )
          console.log(`[APPFOLIO_REPO] ✅ Inserted ${unitsResult.count} units records`)
          return unitsResult

        case 'tenants':
        case 'tenant_directory':
          const tenantsData = records.map(record => ({
            sourceId: record.id,
            payloadJson: record.payload,
            ingestedAt: new Date()
          }))
          const tenantsResult = await this.batchInsert(tenantsData, (batch: typeof tenantsData) =>
            prisma.rawAppfolioTenant.createMany({
              data: batch,
              skipDuplicates: true
            })
          )
          console.log(`[APPFOLIO_REPO] ✅ Inserted ${tenantsResult.count} tenants records`)
          return tenantsResult

        case 'work_order':
        case 'work_orders':
          const workOrderData = records.map(record => ({
            sourceId: record.id,
            payloadJson: record.payload,
            ingestedAt: new Date()
          }))
          // Use raw SQL since Prisma model doesn't exist yet for manually created table
          const workOrderResult = await this.batchInsertWorkOrders(workOrderData)
          console.log(`[APPFOLIO_REPO] ✅ Inserted ${workOrderResult.count} work_order records`)
          return workOrderResult

        case 'properties':
        case 'property_directory':
          const propertiesData = records.map(record => ({
            sourceId: record.id,
            payloadJson: record.payload,
            ingestedAt: new Date()
          }))
          const propertiesResult = await this.batchInsert(propertiesData, (batch: typeof propertiesData) =>
            prisma.rawAppfolioProperty.createMany({
              data: batch,
              skipDuplicates: true
            })
          )
          console.log(`[APPFOLIO_REPO] ✅ Inserted ${propertiesResult.count} properties records`)
          return propertiesResult

        case 'lease_history':
          const leaseHistoryData = records.map(record => ({
            sourceId: record.id,
            payloadJson: record.payload,
            ingestedAt: new Date()
          }))
          const leaseHistoryResult = await this.batchInsert(leaseHistoryData, (batch: typeof leaseHistoryData) =>
            prisma.rawAppfolioLeaseHistory.createMany({
              data: batch,
              skipDuplicates: true
            })
          )
          console.log(`[APPFOLIO_REPO] ✅ Inserted ${leaseHistoryResult.count} lease_history records`)
          return leaseHistoryResult

        case 'lease_expiration_detail':
          const leaseExpirationData = records.map(record => ({
            sourceId: record.id,
            payloadJson: record.payload,
            ingestedAt: new Date()
          }))
          const leaseExpirationResult = await this.batchInsert(leaseExpirationData, (batch: typeof leaseExpirationData) =>
            prisma.rawAppfolioLeaseExpirationDetail.createMany({
              data: batch,
              skipDuplicates: true
            })
          )
          console.log(`[APPFOLIO_REPO] ✅ Inserted ${leaseExpirationResult.count} lease_expiration_detail records`)
          return leaseExpirationResult

        case 'owner_directory':
          // TODO: Create dedicated RawAppfolioOwnerDirectory table
          // For now, store in Transaction table as a temporary measure
          const ownerData = records.map(record => ({
            sourceId: record.id,
            payloadJson: record.payload,
            ingestedAt: new Date()
          }))
          const ownerResult = await this.batchInsert(ownerData, (batch: typeof ownerData) =>
            prisma.rawAppfolioTransaction.createMany({
              data: batch,
              skipDuplicates: true
            })
          )
          console.log(`[APPFOLIO_REPO] ⚠️  Inserted ${ownerResult.count} owner_directory records (using Transaction table - needs dedicated table)`)
          return ownerResult

        case 'income_statement':
        case 'cash_flow':  
        case 'balance_sheet':
        case 'transactions':
        case 'general_ledger':
        case 'trial_balance':
        case 'chart_of_accounts':
        case 'delinquency':
        case 'aged_receivables_detail':
        case 'charge_detail':
        case 'receivables_activity':
          // Financial/accounting reports using RawAppfolioTransaction table
          const genericData = records.map(record => ({
            sourceId: record.id,
            payloadJson: record.payload,
            ingestedAt: new Date()
          }))
          const genericResult = await this.batchInsert(genericData, (batch: typeof genericData) =>
            prisma.rawAppfolioTransaction.createMany({
              data: batch,
              skipDuplicates: true
            })
          )
          console.log(`[APPFOLIO_REPO] ✅ Inserted ${genericResult.count} ${reportType} records`)
          return genericResult

        default:
          console.warn(`[APPFOLIO_REPO] Unknown report type: ${reportType}`)
          return { count: 0 }
      }
    } catch (error) {
      console.error(`[APPFOLIO_REPO] Failed to insert ${reportType} records:`, error)
      throw error
    }
  }
}

export class ReportCheckpointRepository {
  static async getAll(): Promise<Array<{
    reportId: string
    lastIngestedAt: Date | null
    lastSuccessfulRun: Date | null
    totalRecordsIngested: number
    lastError: string | null
    status: string
  }>> {
    try {
      const checkpoints = await prisma.reportCheckpoint.findMany({
        orderBy: { lastIngestedAt: 'desc' }
      })
      
      return checkpoints.map(checkpoint => ({
        reportId: checkpoint.reportId,
        lastIngestedAt: checkpoint.lastIngestedAt,
        lastSuccessfulRun: checkpoint.lastSuccessfulRun,
        totalRecordsIngested: checkpoint.totalRecordsIngested,
        lastError: checkpoint.lastError,
        status: checkpoint.status
      }))
    } catch (error) {
      console.error('[REPORT_CHECKPOINT_REPO] Failed to get all checkpoints:', error)
      return []
    }
  }

  static async findByReportId(reportId: string): Promise<{
    reportId: string
    lastIngestedAt: Date | null
    lastSuccessfulRun: Date | null
    totalRecordsIngested: number
    lastError: string | null
    status: string
  } | null> {
    try {
      const checkpoint = await prisma.reportCheckpoint.findUnique({
        where: { reportId }
      })
      
      if (!checkpoint) return null
      
      return {
        reportId: checkpoint.reportId,
        lastIngestedAt: checkpoint.lastIngestedAt,
        lastSuccessfulRun: checkpoint.lastSuccessfulRun,
        totalRecordsIngested: checkpoint.totalRecordsIngested,
        lastError: checkpoint.lastError,
        status: checkpoint.status
      }
    } catch (error) {
      console.error(`[REPORT_CHECKPOINT_REPO] Failed to find checkpoint for ${reportId}:`, error)
      return null
    }
  }
}

export class VacancyAnalyticsRepository {
  /**
   * Calculate vacancy days for all units based on AppFolio lease data
   */
  static async calculateVacancyDays(): Promise<Array<{
    unit: string
    vacancyDays: number
    lastMoveOut: string | null
    status: string
    isVacant: boolean
  }>> {
    console.log('[VACANCY_ANALYTICS] Calculating vacancy days from AppFolio lease data...')
    
    // Get the most recent lease records for each unit
    const leaseRecords = await prisma.rawAppfolioLease.findMany({
      orderBy: { ingestedAt: 'desc' }
    })
    
    const unitVacancyMap = new Map<string, {
      unit: string
      vacancyDays: number
      lastMoveOut: string | null
      status: string
      isVacant: boolean
    }>()
    
    const today = new Date()
    
    for (const record of leaseRecords) {
      try {
        const payload = typeof record.payloadJson === 'string' 
          ? JSON.parse(record.payloadJson) 
          : record.payloadJson
        
        const unit = payload.Unit
        const status = payload.Status || ''
        const lastMoveOut = payload.LastMoveOut
        
        // Skip if we already processed this unit (newer record)
        if (unitVacancyMap.has(unit)) continue
        
        const isVacant = status.toLowerCase().includes('vacant')
        let vacancyDays = 0
        
        if (isVacant && lastMoveOut) {
          // Parse move-out date (format: "MM/DD/YYYY")
          const moveOutDate = new Date(lastMoveOut)
          if (!isNaN(moveOutDate.getTime())) {
            const timeDiff = today.getTime() - moveOutDate.getTime()
            vacancyDays = Math.floor(timeDiff / (1000 * 3600 * 24))
          }
        }
        
        unitVacancyMap.set(unit, {
          unit,
          vacancyDays,
          lastMoveOut,
          status,
          isVacant
        })
        
      } catch (error) {
        console.warn(`[VACANCY_ANALYTICS] Failed to parse lease record:`, error)
        continue
      }
    }
    
    const results = Array.from(unitVacancyMap.values())
    console.log(`[VACANCY_ANALYTICS] ✅ Calculated vacancy for ${results.length} units`)
    
    return results
  }
  
  /**
   * Get units with highest vacancy days
   */
  static async getUnitsWithHighestVacancy(limit: number = 10): Promise<Array<{
    unit: string
    vacancyDays: number
    lastMoveOut: string | null
    status: string
  }>> {
    const vacancyData = await this.calculateVacancyDays()
    
    return vacancyData
      .filter(unit => unit.isVacant && unit.vacancyDays > 0)
      .sort((a, b) => b.vacancyDays - a.vacancyDays)
      .slice(0, limit)
      .map(unit => ({
        unit: unit.unit,
        vacancyDays: unit.vacancyDays,
        lastMoveOut: unit.lastMoveOut,
        status: unit.status
      }))
  }
}

export class AnalyticsRepository {
  static masterCsv = MasterCsvRepository
  static masterTenant = MasterTenantRepository
  static appfolio = AppFolioRepository
  static vacancy = VacancyAnalyticsRepository
  static reportCheckpoint = ReportCheckpointRepository

  // Utility method to clear all analytics data (for testing/reset)
  static async clearAll(): Promise<void> {
    console.log('[ANALYTICS_REPO] Clearing all analytics data...')
    
    await Promise.all([
      MasterCsvRepository.deleteAll(),
      MasterTenantRepository.deleteAll()
    ])
    
    console.log('[ANALYTICS_REPO] ✅ All analytics data cleared')
  }
}