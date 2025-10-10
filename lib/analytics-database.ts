
import { prisma } from './prisma'
import { withPrismaRetry } from './prisma-retry'

// Unified PostgreSQL Analytics Database
// Replaces all SQLite and hybrid implementations

export interface AnalyticsRecord {
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

export class AnalyticsDatabase {
  
  // Initialize database state
  static async initialize(): Promise<void> {
    await withPrismaRetry(async () => {
      // Ensure AppFolio integration state exists
      await prisma.integrationState.upsert({
        where: { key: 'appfolio' },
        update: {},
        create: {
          key: 'appfolio',
          json: {
            connected: false,
            ever_connected: false,
            connected_at: null,
            last_sync_at: null,
            last_error: null
          },
          updatedAt: new Date()
        }
      })
      
      console.log('[ANALYTICS_DB] PostgreSQL analytics database initialized')
    })
  }

  // Analytics Master Operations
  static async getAnalyticsMaster(snapshotDate: Date): Promise<AnalyticsRecord[]> {
    return withPrismaRetry(async () => {
      const records = await prisma.analyticsMaster.findMany({
        where: { snapshotDate },
        orderBy: { unitCode: 'asc' }
      })

      return records.map(record => ({
        snapshotDate: record.snapshotDate,
        propertyId: record.propertyId,
        unitCode: record.unitCode,
        bedspaceCode: record.bedspaceCode,
        tenantId: record.tenantId,
        leaseId: record.leaseId,
        isOccupied: record.isOccupied,
        studentFlag: record.studentFlag,
        primaryTenantFlag: record.primaryTenantFlag,
        marketRent: record.marketRent,
        mrr: record.mrr,
        moveIn: record.moveIn,
        moveOut: record.moveOut,
        leaseStart: record.leaseStart,
        leaseEnd: record.leaseEnd,
        daysVacant: record.daysVacant,
        vacancyLoss: record.vacancyLoss
      }))
    })
  }

  static async countAnalyticsMaster(snapshotDate?: Date): Promise<number> {
    return withPrismaRetry(async () => {
      return await prisma.analyticsMaster.count({
        where: snapshotDate ? { snapshotDate } : undefined
      })
    })
  }

  static async getLatestSnapshotDate(): Promise<Date | null> {
    return withPrismaRetry(async () => {
      const result = await prisma.analyticsMaster.findFirst({
        select: { snapshotDate: true },
        orderBy: { snapshotDate: 'desc' }
      })
      return result?.snapshotDate || null
    })
  }

  static async upsertAnalyticsMaster(records: AnalyticsRecord[]): Promise<{ count: number }> {
    return withPrismaRetry(async () => {
      if (records.length === 0) return { count: 0 }

      let upsertedCount = 0
      const BATCH_SIZE = 200

      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE)
        
        for (const record of batch) {
          // Handle nullable bedspaceCode properly in unique constraint
          const bedspaceCode = record.bedspaceCode ?? null
          const existingRecord = await prisma.analyticsMaster.findFirst({
            where: {
              snapshotDate: record.snapshotDate,
              unitCode: record.unitCode,
              bedspaceCode: bedspaceCode
            }
          })

          if (existingRecord) {
            await prisma.analyticsMaster.update({
              where: { id: existingRecord.id },
              data: {
                propertyId: record.propertyId,
                tenantId: record.tenantId,
                leaseId: record.leaseId,
                isOccupied: record.isOccupied,
                studentFlag: record.studentFlag,
                primaryTenantFlag: record.primaryTenantFlag,
                marketRent: record.marketRent,
                mrr: record.mrr,
                moveIn: record.moveIn,
                moveOut: record.moveOut,
                leaseStart: record.leaseStart,
                leaseEnd: record.leaseEnd,
                daysVacant: record.daysVacant,
                vacancyLoss: record.vacancyLoss,
                updatedAt: new Date()
              }
            })
          } else {
            await prisma.analyticsMaster.create({
              data: {
                ...record,
                bedspaceCode: bedspaceCode,
                updatedAt: new Date()
              }
            })
          }
          upsertedCount++
        }
      }

      console.log(`[ANALYTICS_DB] Upserted ${upsertedCount} analytics_master records`)
      return { count: upsertedCount }
    })
  }

  // Report Checkpoints
  static async getReportCheckpoints(): Promise<Array<{
    reportId: string
    status: string
    lastSuccessfulRun: Date | null
    totalRecordsIngested: number
    lastError: string | null
    lastIngestedAt: Date | null
  }>> {
    return withPrismaRetry(async () => {
      const checkpoints = await prisma.reportCheckpoint.findMany({
        orderBy: { lastIngestedAt: 'desc' }
      })

      return checkpoints.map(cp => ({
        reportId: cp.reportId,
        status: cp.status,
        lastSuccessfulRun: cp.lastSuccessfulRun,
        totalRecordsIngested: cp.totalRecordsIngested,
        lastError: cp.lastError,
        lastIngestedAt: cp.lastIngestedAt
      }))
    })
  }

  static async upsertReportCheckpoint(data: {
    reportId: string
    status: string
    lastIngestedAt?: Date
    lastSuccessfulRun?: Date
    totalRecordsIngested?: number
    lastError?: string
  }): Promise<void> {
    return withPrismaRetry(async () => {
      await prisma.reportCheckpoint.upsert({
        where: { reportId: data.reportId },
        update: data,
        create: data
      })
    })
  }

  // AppFolio Integration State
  static async getAppfolioState(): Promise<Record<string, any> | null> {
    return withPrismaRetry(async () => {
      const result = await prisma.integrationState.findUnique({
        where: { key: 'appfolio' }
      })
      return (result?.json as Record<string, any>) || null
    })
  }

  static async updateAppfolioState(updates: Partial<{
    connected: boolean
    ever_connected: boolean
    connected_at: string | null
    last_sync_at: string | null
    last_error: string | null
  }>): Promise<Record<string, any> | null> {
    return withPrismaRetry(async () => {
      const currentState = await this.getAppfolioState()
      const baseState = currentState || {
        connected: false,
        ever_connected: false,
        connected_at: null,
        last_sync_at: null,
        last_error: null
      }
      const newState = { ...baseState, ...updates }

      await prisma.integrationState.upsert({
        where: { key: 'appfolio' },
        update: {
          json: newState,
          updatedAt: new Date()
        },
        create: {
          key: 'appfolio',
          json: newState,
          updatedAt: new Date()
        }
      })

      return newState
    })
  }

  // Master CSV Data
  static async getMasterCsvData(): Promise<Array<{
    unit: string
    firstName?: string | null
    lastName?: string | null
    fullName?: string | null
    tenantStatus?: string | null
    tenantType?: string | null
    primaryTenant?: string | null
    marketRent?: number | null
    monthlyRent?: number | null
    moveInDate?: string | null
    leaseStartDate?: string | null
    leaseEndDate?: string | null
  }>> {
    return withPrismaRetry(async () => {
      const records = await prisma.masterCsvData.findMany({
        orderBy: { unit: 'asc' }
      })

      return records.map(record => ({
        unit: record.unit,
        firstName: record.firstName,
        lastName: record.lastName,
        fullName: record.fullName,
        tenantStatus: record.tenantStatus,
        tenantType: record.tenantType,
        primaryTenant: record.primaryTenant,
        marketRent: record.marketRent,
        monthlyRent: record.monthlyRent,
        moveInDate: record.moveInDate,
        leaseStartDate: record.leaseStartDate,
        leaseEndDate: record.leaseEndDate
      }))
    })
  }

  static async clearMasterCsvData(): Promise<void> {
    return withPrismaRetry(async () => {
      const result = await prisma.masterCsvData.deleteMany()
      console.log(`[ANALYTICS_DB] Cleared ${result.count} master CSV records`)
    })
  }

  static async insertMasterCsvData(records: Array<{
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
    daysVacant?: number
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
    syncDate?: string
  }>): Promise<{ count: number }> {
    return withPrismaRetry(async () => {
      if (records.length === 0) return { count: 0 }

      const data = records.map(record => ({
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
        daysVacant: record.daysVacant || 0,
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
        syncDate: record.syncDate || null,
        updatedAt: new Date()
      }))

      const result = await prisma.masterCsvData.createMany({
        data,
        skipDuplicates: true
      })

      console.log(`[ANALYTICS_DB] Inserted ${result.count} master CSV records`)
      return { count: result.count }
    })
  }
}

// Export singleton for backwards compatibility
export const analyticsDb = AnalyticsDatabase

// Initialize database
let isInitialized = false
export async function ensureAnalyticsDbInitialized(): Promise<void> {
  if (!isInitialized) {
    await AnalyticsDatabase.initialize()
    isInitialized = true
  }
}
