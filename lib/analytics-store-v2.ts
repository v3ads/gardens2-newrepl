// import 'server-only' // Removed for worker compatibility
import { prisma } from './prisma'

// Temporary type fix while regenerating Prisma client
const db = prisma as any

// ===================================
// Simplified PostgreSQL Analytics Store
// ===================================
// Phase 2: Direct Prisma-based implementation with SQLite-compatible interface

// ===================================
// APPFOLIO INTEGRATION STATE HELPERS
// ===================================

export async function getAppfolioStateFromPG() {
  try {
    const result = await prisma.integrationState.findUnique({
      where: { key: 'appfolio' }
    })
    return result?.json as Record<string, any> | null
  } catch (error) {
    console.error('[ANALYTICS_STORE_V2] Error getting AppFolio state:', error)
    return null
  }
}

export async function updateAppfolioStateInPG(updates: Partial<{
  connected: boolean
  ever_connected: boolean
  connected_at: string | null
  last_sync_at: string | null
  last_error: string | null
}>) {
  try {
    const currentState = await getAppfolioStateFromPG()
    const baseState = (currentState as Record<string, any>) || {
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
  } catch (error) {
    console.error('[ANALYTICS_STORE_V2] Error updating AppFolio state:', error)
    return null
  }
}

// ===================================
// REPORT CHECKPOINT HELPERS
// ===================================

export async function getReportCheckpointsFromPG() {
  try {
    const checkpoints = await prisma.reportCheckpoint.findMany({
      orderBy: { lastIngestedAt: 'desc' }
    })

    return checkpoints.map(cp => ({
      report_id: cp.reportId,
      status: cp.status,
      last_successful_run: cp.lastSuccessfulRun?.toISOString() || null,
      total_records_ingested: cp.totalRecordsIngested,
      last_error: cp.lastError,
      last_ingested_at: cp.lastIngestedAt?.toISOString() || null
    }))
  } catch (error) {
    console.error('[ANALYTICS_STORE_V2] Error getting report checkpoints:', error)
    return []
  }
}

export async function upsertReportCheckpointInPG(data: {
  reportId: string
  status: string
  lastIngestedAt?: Date | string
  lastSuccessfulRun?: Date | string | null
  totalRecordsIngested?: number
  lastError?: string | null
}) {
  try {
    const processedData = {
      reportId: data.reportId,
      status: data.status,
      lastIngestedAt: data.lastIngestedAt ? new Date(data.lastIngestedAt) : undefined,
      lastSuccessfulRun: data.lastSuccessfulRun ? new Date(data.lastSuccessfulRun) : null,
      totalRecordsIngested: data.totalRecordsIngested || 0,
      lastError: data.lastError || null
    }

    return await prisma.reportCheckpoint.upsert({
      where: { reportId: data.reportId },
      update: processedData,
      create: processedData
    })
  } catch (error) {
    console.error('[ANALYTICS_STORE_V2] Error upserting report checkpoint:', error)
    throw error
  }
}

// ===================================
// ANALYTICS MASTER HELPERS
// ===================================

export async function getAnalyticsMasterCountFromPG() {
  try {
    return await prisma.analyticsMaster.count()
  } catch (error) {
    console.error('[ANALYTICS_STORE_V2] Error getting analytics master count:', error)
    return 0
  }
}

export async function getLatestSnapshotDateFromPG() {
  try {
    const result = await prisma.analyticsMaster.findFirst({
      select: { snapshotDate: true },
      orderBy: { snapshotDate: 'desc' }
    })
    return result?.snapshotDate || null
  } catch (error) {
    console.error('[ANALYTICS_STORE_V2] Error getting latest snapshot date:', error)
    return null
  }
}

export async function getAnalyticsMasterRecordsFromPG(limit = 1000) {
  try {
    const records = await prisma.analyticsMaster.findMany({
      take: limit,
      orderBy: { snapshotDate: 'desc' }
    })

    return records.map(record => ({
      snapshot_date: record.snapshotDate.toISOString().split('T')[0],
      property_id: record.propertyId,
      unit_code: record.unitCode,
      bedspace_code: record.bedspaceCode,
      tenant_id: record.tenantId,
      lease_id: record.leaseId,
      is_occupied: record.isOccupied ? 1 : 0,
      student_flag: record.studentFlag ? 1 : 0,
      primary_tenant_flag: record.primaryTenantFlag ? 1 : 0,
      market_rent: record.marketRent,
      mrr: record.mrr,
      move_in: record.moveIn?.toISOString().split('T')[0] || null,
      move_out: record.moveOut?.toISOString().split('T')[0] || null,
      lease_start: record.leaseStart?.toISOString().split('T')[0] || null,
      lease_end: record.leaseEnd?.toISOString().split('T')[0] || null,
      days_vacant: record.daysVacant,
      vacancy_loss: record.vacancyLoss,
      updated_at: record.updatedAt.toISOString()
    }))
  } catch (error) {
    console.error('[ANALYTICS_STORE_V2] Error getting analytics master records:', error)
    return []
  }
}

// ===================================
// RAW DATA HELPERS
// ===================================

export async function upsertRawAppfolioDataInPG(tableName: string, data: {
  sourceId: string
  payloadJson: any
  ingestedAt: Date | string
}) {
  try {
    const processedData = {
      sourceId: data.sourceId,
      payloadJson: data.payloadJson,
      ingestedAt: new Date(data.ingestedAt)
    }

    switch (tableName) {
      case 'raw_appfolio_properties':
        return await prisma.rawAppfolioProperty.upsert({
          where: { sourceId: data.sourceId },
          update: processedData,
          create: processedData
        })
      case 'raw_appfolio_units':
        return await prisma.rawAppfolioUnit.upsert({
          where: { sourceId: data.sourceId },
          update: processedData,
          create: processedData
        })
      case 'raw_appfolio_leases':
        return await prisma.rawAppfolioLease.upsert({
          where: { sourceId: data.sourceId },
          update: processedData,
          create: processedData
        })
      case 'raw_appfolio_tenants':
        return await prisma.rawAppfolioTenant.upsert({
          where: { sourceId: data.sourceId },
          update: processedData,
          create: processedData
        })
      case 'raw_appfolio_transactions':
        return await prisma.rawAppfolioTransaction.upsert({
          where: { sourceId: data.sourceId },
          update: processedData,
          create: processedData
        })
      default:
        throw new Error(`Unsupported raw table: ${tableName}`)
    }
  } catch (error) {
    console.error(`[ANALYTICS_STORE_V2] Error upserting ${tableName}:`, error)
    throw error
  }
}

// ===================================
// SQLITE COMPATIBILITY LAYER
// ===================================

// Simplified prepared statement that works with async operations
class PGPreparedStatement {
  constructor(private sql: string, private executor: () => Promise<any[]>) {}
  
  async execAsync(): Promise<any[]> {
    return await this.executor()
  }
  
  // Synchronous interface for compatibility (returns cached results)
  all(): any[] {
    console.warn('[ANALYTICS_STORE_V2] Synchronous .all() called - use execAsync() for better reliability')
    return []
  }
  
  get(): any | undefined {
    console.warn('[ANALYTICS_STORE_V2] Synchronous .get() called - use execAsync() for better reliability')
    return undefined
  }
  
  run(...params: any[]): void {
    console.warn('[ANALYTICS_STORE_V2] .run() called - async operations not fully supported in sync mode')
  }
}

// Main database interface
export const pgAnalyticsStore = {
  exec(sql: string): void {
    console.log('[ANALYTICS_STORE_V2] DDL operation (handled by Prisma migrations):', sql.substring(0, 100))
  },

  prepare(sql: string): PGPreparedStatement {
    // Route SQL queries to appropriate async functions
    if (sql.includes('SELECT') && sql.includes('report_checkpoints')) {
      return new PGPreparedStatement(sql, getReportCheckpointsFromPG)
    } else if (sql.includes('SELECT') && sql.includes('analytics_master')) {
      return new PGPreparedStatement(sql, getAnalyticsMasterRecordsFromPG)
    } else {
      return new PGPreparedStatement(sql, async () => [])
    }
  }
}

// ===================================
// INITIALIZATION
// ===================================

let isInitialized = false

export async function initializePGAnalyticsStore() {
  if (!isInitialized) {
    try {
      // Ensure AppFolio integration state exists
      await prisma.integrationState.upsert({
        where: { key: 'appfolio' },
        update: {}, // Don't overwrite existing state
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
      
      isInitialized = true
      console.log('[ANALYTICS_STORE_V2] PostgreSQL analytics store initialized successfully')
    } catch (error) {
      console.error('[ANALYTICS_STORE_V2] Error initializing store:', error)
      throw error
    }
  }
}

export async function ensurePGAnalyticsStoreInitialized() {
  if (!isInitialized) {
    await initializePGAnalyticsStore()
  }
}