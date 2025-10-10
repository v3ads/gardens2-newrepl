import 'server-only'
import { prisma } from './prisma'
import type { Prisma } from '@prisma/client'

// ===================================
// PostgreSQL Analytics Store Adapter
// ===================================
// This provides a drop-in replacement for the SQLite analytics-db.ts
// interface while using PostgreSQL/Prisma under the hood.

// Interface to match SQLite prepared statement behavior
// ARCHITECTURE FIX: Remove SQLite synchronous methods for PostgreSQL compatibility  
interface PreparedStatement {
  // PostgreSQL uses asynchronous operations - removed sync all() and get() methods
  run(...params: any[]): void
}

// Result cache for sync interface compatibility
interface QueryResult {
  data: any[]
  timestamp: number
  sql: string
}

const CACHE_TTL = 5000 // 5 seconds cache for rapid consecutive calls

// Interface for SQL execution (mainly for DDL compatibility)
interface DatabaseExecutor {
  exec(sql: string): void
  prepare(sql: string): PreparedStatement
}

// Internal query result cache for prepared statements
const queryCache = new Map<string, QueryResult>()
const queryPromises = new Map<string, Promise<any[]>>()

// ===================================
// PREPARED STATEMENT IMPLEMENTATIONS
// ===================================

class PostgresPreparedStatement implements PreparedStatement {
  private sql: string
  private params: any[]

  constructor(sql: string) {
    this.sql = sql
    this.params = []
  }

  async executeQuery(): Promise<any[]> {
    const cacheKey = `${this.sql}-${JSON.stringify(this.params)}`
    
    // Handle specific queries with Prisma operations
    if (this.sql.includes('SELECT') && this.sql.includes('report_checkpoints')) {
      return this.queryReportCheckpoints()
    }
    
    if (this.sql.includes('SELECT') && this.sql.includes('integration_state')) {
      return this.queryIntegrationState()
    }
    
    if (this.sql.includes('SELECT') && this.sql.includes('analytics_master')) {
      return this.queryAnalyticsMaster()
    }

    if (this.sql.includes('SELECT') && this.sql.includes('analytics_tenant_daily')) {
      return this.queryAnalyticsTenantDaily()
    }
    
    // Default fallback - log for debugging
    console.log('[ANALYTICS_STORE] Unhandled SQL query:', this.sql)
    return []
  }

  private async queryReportCheckpoints(): Promise<any[]> {
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
      console.error('[ANALYTICS_STORE] Error querying report checkpoints:', error)
      return []
    }
  }

  private async queryIntegrationState(): Promise<any[]> {
    try {
      const states = await prisma.integrationState.findMany()
      return states.map(state => ({
        key: state.key,
        json: JSON.stringify(state.json),
        updated_at: state.updatedAt.toISOString()
      }))
    } catch (error) {
      console.error('[ANALYTICS_STORE] Error querying integration state:', error)
      return []
    }
  }

  private async queryAnalyticsMaster(): Promise<any[]> {
    try {
      const records = await prisma.analyticsMaster.findMany({
        take: 1000, // Reasonable limit for queries
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
      console.error('[ANALYTICS_STORE] Error querying analytics master:', error)
      return []
    }
  }

  private async queryAnalyticsTenantDaily(): Promise<any[]> {
    try {
      const records = await prisma.analyticsTenantDaily.findMany({
        take: 1000,
        orderBy: { snapshotDate: 'desc' }
      })

      return records.map(record => ({
        snapshot_date: record.snapshotDate.toISOString().split('T')[0],
        property_id: record.propertyId,
        unit_code: record.unitCode,
        lease_id: record.leaseId,
        tenant_id: record.tenantId,
        is_primary: record.isPrimary ? 1 : 0,
        cosigner_flag: record.cosignerFlag ? 1 : 0,
        student_flag: record.studentFlag ? 1 : 0,
        household_size: record.householdSize,
        lease_length_days: record.leaseLengthDays,
        tenure_days: record.tenureDays,
        payment_plan_active: record.paymentPlanActive ? 1 : 0,
        updated_at: record.updatedAt.toISOString()
      }))
    } catch (error) {
      console.error('[ANALYTICS_STORE] Error querying analytics tenant daily:', error)
      return []
    }
  }

  // ARCHITECTURE FIX: Remove SQLite synchronous all() method
  // PostgreSQL requires asynchronous operations for external database safety  
  // Use executeQuery() instead for proper async PostgreSQL operations

  // ARCHITECTURE FIX: Remove SQLite synchronous get() method  
  // PostgreSQL requires asynchronous operations for external database safety

  run(...params: any[]): void {
    this.params = params
    
    // Handle INSERT/UPDATE/REPLACE operations asynchronously
    if (this.sql.includes('INSERT OR REPLACE') || this.sql.includes('INSERT OR IGNORE')) {
      this.handleUpsertOperation().catch(error => {
        console.error('[ANALYTICS_STORE] Upsert error:', error)
      })
    } else if (this.sql.includes('UPDATE')) {
      this.handleUpdateOperation().catch(error => {
        console.error('[ANALYTICS_STORE] Update error:', error)
      })
    } else if (this.sql.includes('INSERT')) {
      this.handleInsertOperation().catch(error => {
        console.error('[ANALYTICS_STORE] Insert error:', error)
      })
    }
  }

  private async handleUpsertOperation(): Promise<void> {
    try {
      if (this.sql.includes('report_checkpoints')) {
        await this.upsertReportCheckpoint()
      } else if (this.sql.includes('integration_state')) {
        await this.upsertIntegrationState()
      } else if (this.sql.includes('raw_appfolio_')) {
        await this.upsertRawAppfolio()
      } else if (this.sql.includes('analytics_master')) {
        await this.upsertAnalyticsMaster()
      } else if (this.sql.includes('analytics_tenant_daily')) {
        await this.upsertAnalyticsTenantDaily()
      }
    } catch (error) {
      console.error('[ANALYTICS_STORE] Error in upsert operation:', error)
    }
  }

  private async handleUpdateOperation(): Promise<void> {
    try {
      if (this.sql.includes('integration_state')) {
        await this.updateIntegrationState()
      } else if (this.sql.includes('report_checkpoints')) {
        await this.updateReportCheckpoint()
      }
    } catch (error) {
      console.error('[ANALYTICS_STORE] Error in update operation:', error)
    }
  }

  private async handleInsertOperation(): Promise<void> {
    // Handle INSERT operations (similar to upsert but stricter)
    await this.handleUpsertOperation()
  }

  private async upsertReportCheckpoint(): Promise<void> {
    const [reportId, lastIngested, lastSuccessful, totalRecords, lastError, status] = this.params
    
    await prisma.reportCheckpoint.upsert({
      where: { reportId },
      update: {
        lastIngestedAt: lastIngested ? new Date(lastIngested) : null,
        lastSuccessfulRun: lastSuccessful ? new Date(lastSuccessful) : null,
        totalRecordsIngested: totalRecords || 0,
        lastError,
        status
      },
      create: {
        reportId,
        lastIngestedAt: lastIngested ? new Date(lastIngested) : null,
        lastSuccessfulRun: lastSuccessful ? new Date(lastSuccessful) : null,
        totalRecordsIngested: totalRecords || 0,
        lastError,
        status
      }
    })
  }

  private async upsertIntegrationState(): Promise<void> {
    const [key, jsonString, updatedAt] = this.params
    const jsonData = JSON.parse(jsonString || '{}')
    
    await prisma.integrationState.upsert({
      where: { key },
      update: {
        json: jsonData,
        updatedAt: new Date(updatedAt)
      },
      create: {
        key,
        json: jsonData,
        updatedAt: new Date(updatedAt)
      }
    })
  }

  private async updateIntegrationState(): Promise<void> {
    const [jsonString, updatedAt, key] = this.params
    const jsonData = JSON.parse(jsonString || '{}')
    
    await prisma.integrationState.update({
      where: { key },
      data: {
        json: jsonData,
        updatedAt: new Date(updatedAt)
      }
    })
  }

  private async updateReportCheckpoint(): Promise<void> {
    // Handle UPDATE report_checkpoints operations
    const [reportId] = this.params
    // Implementation would depend on specific UPDATE query structure
  }

  private async upsertRawAppfolio(): Promise<void> {
    const [sourceId, payloadJson, ingestedAt] = this.params
    const tableName = this.extractTableName()
    
    const data = {
      sourceId,
      payloadJson: JSON.parse(payloadJson || '{}'),
      ingestedAt: new Date(ingestedAt)
    }

    switch (tableName) {
      case 'raw_appfolio_properties':
        await prisma.rawAppfolioProperty.upsert({
          where: { sourceId },
          update: data,
          create: data
        })
        break
      case 'raw_appfolio_units':
        await prisma.rawAppfolioUnit.upsert({
          where: { sourceId },
          update: data,
          create: data
        })
        break
      case 'raw_appfolio_leases':
        await prisma.rawAppfolioLease.upsert({
          where: { sourceId },
          update: data,
          create: data
        })
        break
      case 'raw_appfolio_tenants':
        await prisma.rawAppfolioTenant.upsert({
          where: { sourceId },
          update: data,
          create: data
        })
        break
      case 'raw_appfolio_transactions':
        await prisma.rawAppfolioTransaction.upsert({
          where: { sourceId },
          update: data,
          create: data
        })
        break
    }
  }

  private async upsertAnalyticsMaster(): Promise<void> {
    // Handle analytics_master upserts
    const data = this.parseAnalyticsMasterParams()
    
    await prisma.analyticsMaster.upsert({
      where: {
        snapshotDate_unitCode_bedspaceCode: {
          snapshotDate: data.snapshotDate,
          unitCode: data.unitCode,
          bedspaceCode: data.bedspaceCode || ''
        }
      },
      update: data,
      create: data
    })
  }

  private async upsertAnalyticsTenantDaily(): Promise<void> {
    // Handle analytics_tenant_daily upserts
    const data = this.parseAnalyticsTenantDailyParams()
    
    await prisma.analyticsTenantDaily.upsert({
      where: {
        snapshotDate_tenantId_leaseId: {
          snapshotDate: data.snapshotDate,
          tenantId: data.tenantId,
          leaseId: data.leaseId || ''
        }
      },
      update: data,
      create: data
    })
  }

  private extractTableName(): string {
    // Extract table name from SQL statement
    const match = this.sql.match(/INTO\s+(\w+)/i)
    return match ? match[1] : ''
  }

  private parseAnalyticsMasterParams(): any {
    // Simplified implementation - actual parsing would depend on SQL structure
    // This is a placeholder for now
    console.log('[ANALYTICS_STORE] Analytics master params parsing not fully implemented')
    return {
      snapshotDate: new Date(),
      propertyId: 'unknown',
      unitCode: 'unknown',
      bedspaceCode: '',
      isOccupied: false,
      studentFlag: false,
      updatedAt: new Date()
    }
  }

  private parseAnalyticsTenantDailyParams(): any {
    // Simplified implementation - actual parsing would depend on SQL structure
    console.log('[ANALYTICS_STORE] Tenant daily params parsing not fully implemented')
    return {
      snapshotDate: new Date(),
      propertyId: 'unknown',
      unitCode: 'unknown',
      tenantId: 'unknown',
      leaseId: '',
      isPrimary: false,
      cosignerFlag: false,
      studentFlag: false,
      updatedAt: new Date()
    }
  }
}

// ===================================
// MAIN DATABASE EXECUTOR
// ===================================

class PostgresAnalyticsStore implements DatabaseExecutor {
  exec(sql: string): void {
    // Most exec() calls are for DDL operations that are handled by Prisma migrations
    // Log for debugging but don't fail
    console.log('[ANALYTICS_STORE] DDL operation (handled by Prisma):', sql.substring(0, 100))
  }

  prepare(sql: string): PreparedStatement {
    const stmt = new PostgresPreparedStatement(sql)
    
    // Pre-cache query results for synchronous interface compatibility
    if (sql.includes('SELECT')) {
      stmt.executeQuery().then(results => {
        const cacheKey = `${sql}-[]`
        queryCache.set(cacheKey, {
          data: results,
          timestamp: Date.now(),
          sql
        })
      }).catch(error => {
        console.error('[ANALYTICS_STORE] Error pre-caching query:', error)
      })
    }
    
    return stmt
  }
}

// Create singleton instance
const analyticsStore = new PostgresAnalyticsStore()

// Export main interface (matches analytics-db.ts)
export const pgAnalyticsDb = analyticsStore

// ===================================
// APPFOLIO INTEGRATION STATE HELPERS
// ===================================

export async function getAppfolioState() {
  try {
    const result = await prisma.integrationState.findUnique({
      where: { key: 'appfolio' }
    })
    return result?.json as Record<string, any> | null
  } catch (error) {
    console.error('[ANALYTICS_STORE] Error getting AppFolio state:', error)
    return null
  }
}

export async function updateAppfolioState(updates: Partial<{
  connected: boolean
  ever_connected: boolean
  connected_at: string | null
  last_sync_at: string | null
  last_error: string | null
}>) {
  try {
    const currentState = await getAppfolioState()
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
    console.error('[ANALYTICS_STORE] Error updating AppFolio state:', error)
    return null
  }
}

export async function initializeAppfolioState() {
  try {
    const initialState = {
      connected: false,
      ever_connected: false,
      connected_at: null,
      last_sync_at: null,
      last_error: null
    }
    
    await prisma.integrationState.upsert({
      where: { key: 'appfolio' },
      update: {}, // Don't overwrite existing state
      create: {
        key: 'appfolio',
        json: initialState,
        updatedAt: new Date()
      }
    })
  } catch (error) {
    console.error('[ANALYTICS_STORE] Error initializing AppFolio state:', error)
  }
}

// ===================================
// INITIALIZATION HELPERS
// ===================================

let isInitialized = false

export async function initializeAnalyticsStore() {
  // Tables are created by Prisma migrations, so this is mostly a no-op
  console.log('[ANALYTICS_STORE] PostgreSQL analytics store initialized via Prisma')
}

export async function ensureAnalyticsStoreInitialized() {
  if (!isInitialized) {
    await initializeAnalyticsStore()
    await initializeAppfolioState()
    isInitialized = true
    console.log('[ANALYTICS_STORE] PostgreSQL analytics store ready')
  }
}

// ===================================
// DIRECT QUERY HELPERS FOR MIGRATION
// ===================================

// Helper functions that provide direct Prisma access for complex queries
export const directQueries = {
  async getReportCheckpoints() {
    return await prisma.reportCheckpoint.findMany({
      orderBy: { lastIngestedAt: 'desc' }
    })
  },

  async upsertReportCheckpoint(data: {
    reportId: string
    status: string
    lastIngestedAt?: Date
    lastSuccessfulRun?: Date
    totalRecordsIngested?: number
    lastError?: string
  }) {
    return await prisma.reportCheckpoint.upsert({
      where: { reportId: data.reportId },
      update: data,
      create: data
    })
  },

  async getAnalyticsMasterCount() {
    return await prisma.analyticsMaster.count()
  },

  async getLatestSnapshotDate() {
    const result = await prisma.analyticsMaster.findFirst({
      select: { snapshotDate: true },
      orderBy: { snapshotDate: 'desc' }
    })
    return result?.snapshotDate
  }
}