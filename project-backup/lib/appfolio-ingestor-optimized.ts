import { AnalyticsRepository } from './analytics-repositories'
import { prisma, withPrismaRetry } from './prisma'
import { getEnabledReports, getDefaultDateRange, type AppFolioReportConfig } from './appfolioReportsRegistry'

interface OptimizedIngestorConfig {
  clientId: string
  clientSecret: string
  tenantDomain: string
  concurrency?: number // Increased to 3-4 for parallelism
  globalRpsLimit?: number // Token bucket rate limiting
  enableDeltaIngestion?: boolean
}

interface DeltaWindow {
  fromDate?: string
  toDate?: string
  updatedSince?: string
  lastSeenId?: string
}

interface IngestorMetrics {
  reportId: string
  totalRecords: number
  deltaRecordsSkipped: number
  apiCallsReduced: number
  duration: number
  throughputRowsPerSec: number
}

export class OptimizedAppFolioIngestor {
  private config: OptimizedIngestorConfig
  private basicAuth: string
  private tokenBucket: number = 0
  private lastRefill: number = Date.now()
  private readonly maxTokens: number
  private rateLimitStats: Map<string, { count: number; lastWindow: number }> = new Map()

  constructor(config: OptimizedIngestorConfig) {
    this.config = {
      concurrency: 3, // Process 3 reports in parallel (architect recommendation)
      globalRpsLimit: 1.5, // 1.5 requests per second with token bucket
      enableDeltaIngestion: true,
      ...config
    }
    this.basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    this.maxTokens = this.config.globalRpsLimit! * 10 // 10 second bucket depth
    this.tokenBucket = this.maxTokens
  }

  // TOKEN BUCKET RATE LIMITER: Intelligent global rate limiting
  private async waitForToken(): Promise<void> {
    const now = Date.now()
    const timeDelta = (now - this.lastRefill) / 1000 // seconds
    
    // Refill tokens based on time elapsed
    this.tokenBucket = Math.min(
      this.maxTokens,
      this.tokenBucket + (timeDelta * this.config.globalRpsLimit!)
    )
    this.lastRefill = now

    if (this.tokenBucket >= 1) {
      this.tokenBucket -= 1
      return // Token available immediately
    }

    // Wait until we can get a token
    const waitTimeMs = (1 - this.tokenBucket) / this.config.globalRpsLimit! * 1000
    console.log(`[RATE_LIMITER] Waiting ${Math.round(waitTimeMs)}ms for rate limit token`)
    await new Promise(resolve => setTimeout(resolve, waitTimeMs))
    this.tokenBucket = 0 // Consume the token we waited for
  }

  // DELTA WINDOW CALCULATION: Calculate what data to fetch based on high-water marks
  private async calculateDeltaWindow(reportId: string): Promise<DeltaWindow> {
    if (!this.config.enableDeltaIngestion) {
      return {} // Full sync - no filtering
    }

    try {
      const checkpoint = await prisma.reportCheckpoint.findUnique({
        where: { reportId }
      })

      if (!checkpoint || !checkpoint.lastSeenUpdatedAt) {
        console.log(`[DELTA_SYNC] ${reportId}: No previous sync found, performing full sync`)
        return {} // First sync - get all data
      }

      // Use last seen updated_at as high-water mark for delta filtering
      const updatedSince = checkpoint.lastSeenUpdatedAt.toISOString().split('T')[0] // YYYY-MM-DD format
      console.log(`[DELTA_SYNC] ${reportId}: Using delta sync from ${updatedSince}`)
      
      return {
        updatedSince,
        lastSeenId: checkpoint.lastSeenId || undefined
      }
    } catch (error) {
      console.warn(`[DELTA_SYNC] ${reportId}: Error calculating delta window, falling back to full sync:`, error)
      return {} // Fallback to full sync on error
    }
  }

  // ENHANCED API CALL: Add delta filtering to API parameters
  private buildOptimizedUrl(report: AppFolioReportConfig, deltaWindow: DeltaWindow): string {
    const baseUrl = `https://${this.config.tenantDomain}/api/v1/reports/${report.id}.json`
    const params = new URLSearchParams()
    
    params.set('paginate_results', 'true')
    
    // Add date range for reports that require it
    if (report.requiresDateRange) {
      if (deltaWindow.updatedSince) {
        // Delta sync: use updated_since for filtering
        params.set('updated_since', deltaWindow.updatedSince)
        console.log(`[DELTA_FILTER] ${report.id}: Using updated_since=${deltaWindow.updatedSince}`)
      } else {
        // Full sync: use default date range
        const { from_date, to_date } = getDefaultDateRange()
        params.set('from_date', from_date)
        params.set('to_date', to_date)
      }
    }

    // Add sorting by updated_at for delta efficiency
    if (deltaWindow.updatedSince) {
      params.set('sort', 'updated_at')
      params.set('order', 'asc')
    }

    // Add default parameters
    if (report.defaultParams) {
      Object.entries(report.defaultParams).forEach(([key, value]) => {
        params.set(key, value)
      })
    }

    return `${baseUrl}?${params.toString()}`
  }

  // OPTIMIZED FETCH: Fetch with delta filtering and intelligent pagination
  private async fetchReportWithDelta(
    report: AppFolioReportConfig, 
    deltaWindow: DeltaWindow
  ): Promise<{ data: any[], metrics: IngestorMetrics }> {
    const startTime = Date.now()
    const allData: any[] = []
    let pageNumber = 1
    let deltaRecordsSkipped = 0
    let apiCallsReduced = 0
    
    const currentUrl = this.buildOptimizedUrl(report, deltaWindow)
    console.log(`[OPTIMIZED_FETCH] ${report.id}: Starting fetch with delta filtering`)

    let nextUrl: string | null = currentUrl
    
    while (nextUrl && pageNumber <= 100) {
      // Apply token bucket rate limiting
      await this.waitForToken()
      
      try {
        const response: Response = await fetch(nextUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${this.basicAuth}`,
            'Accept': 'application/json',
            'User-Agent': 'CynthiaGardens-Optimized-Ingestor/1.0'
          }
        })

        if (!response.ok) {
          if (response.status === 429) {
            // Handle rate limiting with Retry-After
            const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10)
            console.log(`[RATE_LIMIT] ${report.id}: Page ${pageNumber} - waiting ${retryAfter}s`)
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
            continue // Retry the same page
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const responseData: any = await response.json()
        const pageData = responseData.data || responseData.results || []
        
        // DELTA OPTIMIZATION: Early termination when records are older than high-water mark
        if (deltaWindow.updatedSince && pageData.length > 0) {
          let foundOldRecords = 0
          const filteredData = []
          
          // Parse the delta window date for proper comparison
          const deltaWindowDate = new Date(deltaWindow.updatedSince!)
          
          for (const record of pageData) {
            const recordUpdated = record.updated_at || record.modified_at
            if (recordUpdated) {
              const recordDate = new Date(recordUpdated)
              if (recordDate <= deltaWindowDate) {
                foundOldRecords++
                deltaRecordsSkipped++
              } else {
                filteredData.push(record)
              }
            } else {
              // No updated_at field - include the record to be safe
              filteredData.push(record)
            }
          }
          
          // If more than 80% of page is old records, stop fetching
          if (foundOldRecords / pageData.length > 0.8) {
            console.log(`[DELTA_OPTIMIZATION] ${report.id}: Page ${pageNumber} - 80%+ old records, stopping fetch`)
            apiCallsReduced = Math.max(0, 20 - pageNumber) // Estimate pages saved
            allData.push(...filteredData)
            break
          }
          
          allData.push(...filteredData)
        } else {
          allData.push(...pageData)
        }

        console.log(`[OPTIMIZED_FETCH] ${report.id}: Page ${pageNumber} - ${pageData.length} records`)
        
        // Check for next page
        nextUrl = responseData.next_page_url || null
        pageNumber++
        
      } catch (error) {
        console.error(`[OPTIMIZED_FETCH] ${report.id}: Page ${pageNumber} error:`, error)
        throw error
      }
    }

    const duration = Date.now() - startTime
    const throughputRowsPerSec = allData.length / (duration / 1000)
    
    return {
      data: allData,
      metrics: {
        reportId: report.id,
        totalRecords: allData.length,
        deltaRecordsSkipped,
        apiCallsReduced,
        duration,
        throughputRowsPerSec
      }
    }
  }

  // UPDATE HIGH-WATER MARKS: Track latest data for next delta sync
  private async updateHighWaterMarks(reportId: string, data: any[], metrics: IngestorMetrics): Promise<void> {
    if (data.length === 0) return

    try {
      // Find latest updated_at timestamp using proper date comparison
      const latestRecord = data.reduce((latest, record) => {
        const recordUpdated = record.updated_at || record.modified_at
        const latestUpdated = latest.updated_at || latest.modified_at
        
        if (!recordUpdated) return latest
        if (!latestUpdated) return record
        
        const recordDate = new Date(recordUpdated)
        const latestDate = new Date(latestUpdated)
        
        return recordDate > latestDate ? record : latest
      })

      const lastSeenUpdatedAt = latestRecord.updated_at || latestRecord.modified_at
      const lastSeenId = latestRecord.id || latestRecord.source_id

      if (lastSeenUpdatedAt) {
        await withPrismaRetry(async () => {
          await prisma.reportCheckpoint.upsert({
            where: { reportId },
            create: {
              reportId,
              status: 'completed',
              lastIngestedAt: new Date(),
              lastSuccessfulRun: new Date(),
              totalRecordsIngested: metrics.totalRecords,
              lastSeenUpdatedAt: new Date(lastSeenUpdatedAt),
              lastSeenId,
              deltaRecordsSkipped: metrics.deltaRecordsSkipped
            },
            update: {
              status: 'completed',
              lastIngestedAt: new Date(),
              lastSuccessfulRun: new Date(),
              totalRecordsIngested: metrics.totalRecords,
              lastSeenUpdatedAt: new Date(lastSeenUpdatedAt),
              lastSeenId,
              deltaRecordsSkipped: metrics.deltaRecordsSkipped,
              lastError: null
            }
          })
        })
        
        console.log(`[HIGH_WATER_MARK] ${reportId}: Updated to ${lastSeenUpdatedAt} (ID: ${lastSeenId})`)
      }
    } catch (error) {
      console.error(`[HIGH_WATER_MARK] ${reportId}: Error updating:`, error)
    }
  }

  // PARALLEL INGESTION: Process multiple reports with controlled concurrency
  public async ingestAllReports(): Promise<{
    success: boolean
    totalRecords: number
    metrics: IngestorMetrics[]
    error?: string
  }> {
    const startTime = Date.now()
    const reports = getEnabledReports()
    
    console.log(`[OPTIMIZED_INGESTOR] Starting optimized ingestion of ${reports.length} reports with ${this.config.concurrency} concurrency`)

    try {
      const allMetrics: IngestorMetrics[] = []
      
      // Process reports in parallel with controlled concurrency
      const chunks = []
      for (let i = 0; i < reports.length; i += this.config.concurrency!) {
        chunks.push(reports.slice(i, i + this.config.concurrency!))
      }

      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (report) => {
          const deltaWindow = await this.calculateDeltaWindow(report.id)
          const { data, metrics } = await this.fetchReportWithDelta(report, deltaWindow)
          
          // Store in staging table and MERGE (to be implemented)
          await this.stageAndMergeData(report.id, data)
          
          // Update high-water marks for next delta sync
          await this.updateHighWaterMarks(report.id, data, metrics)
          
          return metrics
        })

        const chunkMetrics = await Promise.all(chunkPromises)
        allMetrics.push(...chunkMetrics)
      }

      const totalRecords = allMetrics.reduce((sum, m) => sum + m.totalRecords, 0)
      const totalDuration = Date.now() - startTime
      
      console.log(`[OPTIMIZED_INGESTOR] ✅ Completed in ${totalDuration}ms:`)
      console.log(`  • Total records: ${totalRecords}`)
      console.log(`  • Delta skipped: ${allMetrics.reduce((sum, m) => sum + m.deltaRecordsSkipped, 0)}`)
      console.log(`  • API calls saved: ${allMetrics.reduce((sum, m) => sum + m.apiCallsReduced, 0)}`)
      console.log(`  • Throughput: ${(totalRecords / (totalDuration / 1000)).toFixed(0)} rows/sec`)

      return {
        success: true,
        totalRecords,
        metrics: allMetrics
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[OPTIMIZED_INGESTOR] ❌ Failed:', errorMessage)
      
      return {
        success: false,
        totalRecords: 0,
        metrics: [],
        error: errorMessage
      }
    }
  }

  // MAP APPFOLIO REPORT IDs TO ANALYTICS STORE TABLE NAMES
  private getAnalyticsTableName(reportId: string): string {
    const reportToTableMapping: Record<string, string> = {
      // Directory reports - direct mapping
      'unit_directory': 'raw_appfolio_units',
      'tenant_directory': 'raw_appfolio_tenants', 
      'property_directory': 'raw_appfolio_properties',
      
      // Lease-related reports
      'rent_roll': 'raw_appfolio_leases',
      'rent_roll_itemized': 'raw_appfolio_leases',
      'lease_expiration_detail': 'raw_appfolio_leases',
      'renewal_summary': 'raw_appfolio_leases',
      
      // Financial/transaction reports
      'cash_flow': 'raw_appfolio_transactions',
      'income_statement': 'raw_appfolio_transactions',
      'balance_sheet': 'raw_appfolio_transactions',
      'general_ledger': 'raw_appfolio_transactions',
      'delinquency': 'raw_appfolio_transactions',
      'aged_receivables_detail': 'raw_appfolio_transactions',
      
      // Unit-related reports (map to units when about unit status)
      'unit_vacancy': 'raw_appfolio_units',
      'unit_turn_detail': 'raw_appfolio_units',
      
      // Default fallback for unknown reports
      'default': 'raw_appfolio_transactions'
    }
    
    return reportToTableMapping[reportId] || reportToTableMapping['default']
  }

  // STAGING AND MERGE: Store data safely before updating high-water marks
  private async stageAndMergeData(reportId: string, data: any[]): Promise<void> {
    if (data.length === 0) return

    try {
      console.log(`[STAGING] ${reportId}: Storing ${data.length} records...`)
      
      // Store data using existing raw data storage methods
      const { upsertRawAppfolioDataInPG } = await import('./analytics-store-v2')
      
      // Get the correct table name for the analytics store
      const tableName = this.getAnalyticsTableName(reportId)
      console.log(`[TABLE_MAPPING] ${reportId} → ${tableName}`)
      
      // Store each record with upsert to handle duplicates
      for (const record of data) {
        const sourceId = record.id || record.source_id || String(Math.random())
        await upsertRawAppfolioDataInPG(tableName, {
          sourceId,
          payloadJson: record,
          ingestedAt: new Date()
        })
      }
      
      console.log(`[STAGING] ${reportId}: ✅ Successfully stored ${data.length} records`)
    } catch (error) {
      console.error(`[STAGING] ${reportId}: ❌ Failed to store data:`, error)
      throw error // Don't update high-water marks if storage fails
    }
  }
}