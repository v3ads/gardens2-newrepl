import { AnalyticsRepository } from './analytics-repositories'
import { prisma, withPrismaRetry } from './prisma'
import { getEnabledReports, getDefaultDateRange, type AppFolioReportConfig } from './appfolioReportsRegistry'

interface IngestorConfig {
  clientId: string
  clientSecret: string
  tenantDomain: string
  concurrency?: number
  delayBetweenRequests?: number
  maxConsecutive429s?: number // Circuit breaker for rate limiting
  rateLimitBackoffMs?: number // Longer delay for rate limits
}

interface IngestorResult {
  reportId: string
  success: boolean
  recordsIngested: number
  error?: string
  duration: number
}

export class AppFolioReportIngestor {
  private config: IngestorConfig
  private basicAuth: string
  private consecutive429Count: Map<string, number> = new Map() // Track consecutive 429s per report
  private responseTimes: Map<string, number[]> = new Map() // Track response times for adaptive rate limiting
  private slowResponseCount: Map<string, number> = new Map() // Track slow responses per report

  constructor(config: IngestorConfig) {
    this.config = {
      concurrency: 1, // Process one report at a time to avoid rate limits
      delayBetweenRequests: 6000, // 6 second delay between requests (more conservative)
      maxConsecutive429s: 3, // Circuit breaker: fail after 3 consecutive 429s (more sensitive)
      rateLimitBackoffMs: 30000, // 30 second delay for rate limits (much longer)
      ...config
    }
    this.basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  }

  // Schema is managed by Prisma - no need to create tables
  private createReportTable(reportId: string): void {
    // Tables are already created via Prisma schema
    console.log(`[APPFOLIO_INGESTOR] Using Prisma-managed table for ${reportId}`)
  }

  // Update report checkpoint with resumable page progress
  private async updateCheckpoint(
    reportId: string, 
    status: 'pending' | 'running' | 'completed' | 'failed', 
    recordsIngested: number = 0, 
    error: string | null = null,
    resumeData?: { pageNumber: number; nextPageUrl?: string }
  ): Promise<void> {
    const now = new Date()
    
    try {
      const lastSuccessfulRun = status === 'completed' ? now : null
      const resumeMetadata = resumeData ? JSON.stringify(resumeData) : null
      
      await withPrismaRetry(async () => {
        return await prisma.reportCheckpoint.upsert({
          where: { reportId },
          create: {
            reportId,
            lastIngestedAt: now,
            lastSuccessfulRun,
            totalRecordsIngested: recordsIngested,
            lastError: error,
            status,
            resumeMetadata
          },
          update: {
            lastIngestedAt: now,
            lastSuccessfulRun: status === 'completed' ? now : undefined,
          totalRecordsIngested: recordsIngested,
          lastError: error,
          status,
          resumeMetadata
          }
        })
      })
      
      const progressInfo = resumeData ? ` (page ${resumeData.pageNumber})` : ''
      console.log(`[APPFOLIO_INGESTOR] ✅ Updated checkpoint for ${reportId}: ${status}${progressInfo}`)
    } catch (err) {
      console.error(`[APPFOLIO_INGESTOR] Failed to update checkpoint for ${reportId}:`, err)
    }
  }

  // Get resume data from previous run
  private async getResumeData(reportId: string): Promise<{ pageNumber: number; nextPageUrl?: string } | null> {
    try {
      const checkpoint = await withPrismaRetry(async () => {
        return await prisma.reportCheckpoint.findUnique({
          where: { reportId }
        })
      })
      
      if (checkpoint?.resumeMetadata && checkpoint.status === 'running') {
        const resumeData = JSON.parse(checkpoint.resumeMetadata)
        console.log(`[APPFOLIO_INGESTOR] 🔄 Resuming ${reportId} from page ${resumeData.pageNumber}`)
        return resumeData
      }
    } catch (err) {
      console.warn(`[APPFOLIO_INGESTOR] Could not parse resume data for ${reportId}:`, err)
    }
    
    return null
  }

  // Reset 429 counter for successful requests
  private reset429Counter(reportId: string): void {
    this.consecutive429Count.set(reportId, 0)
  }

  // Track response times for adaptive rate limiting
  private trackResponseTime(reportId: string, responseTime: number): void {
    if (!this.responseTimes.has(reportId)) {
      this.responseTimes.set(reportId, [])
    }
    const times = this.responseTimes.get(reportId)!
    times.push(responseTime)
    
    // Keep only last 10 response times
    if (times.length > 10) {
      times.shift()
    }
  }

  // Intelligent rate limiting with Retry-After header support
  private async getIntelligentDelay(reportId: string, lastResponse?: Response): Promise<number> {
    // Check for Retry-After header first (most important)
    if (lastResponse?.headers?.has('retry-after')) {
      const retryAfter = parseInt(lastResponse.headers.get('retry-after') || '0', 10)
      if (retryAfter > 0) {
        // Add 20% jitter to avoid thundering herd
        const jitter = Math.random() * 0.2 * retryAfter * 1000
        const delay = (retryAfter * 1000) + jitter
        console.log(`[INTELLIGENT_RATE_LIMIT] ${reportId}: Retry-After ${retryAfter}s + jitter = ${Math.round(delay)}ms`)
        return delay
      }
    }
    
    // Rate limit detected but no Retry-After header - use adaptive delay
    if (lastResponse?.status === 429) {
      const baseDelay = Math.max(this.config.delayBetweenRequests! * 2, 5000) // Min 5 seconds for 429
      const jitter = Math.random() * 0.3 * baseDelay // 30% jitter
      const delay = baseDelay + jitter
      console.log(`[INTELLIGENT_RATE_LIMIT] ${reportId}: 429 without Retry-After, using ${Math.round(delay)}ms + jitter`)
      return delay
    }
    
    // Normal operation - use base delay with small jitter
    const baseDelay = this.config.delayBetweenRequests!
    const jitter = Math.random() * 0.1 * baseDelay // 10% jitter to avoid synchronization
    return baseDelay + jitter
  }

  // Track 429s but don't fail - use for adaptive rate limiting only
  private track429Response(reportId: string): void {
    const current = this.consecutive429Count.get(reportId) || 0
    this.consecutive429Count.set(reportId, current + 1)
    
    // Log warnings for excessive rate limiting but don't circuit break
    if (current > 5) {
      console.warn(`[RATE_LIMIT_WARNING] ${reportId}: ${current + 1} consecutive 429s - API may be heavily loaded`)
    }
  }
  
  // Increment 429 counter and check circuit breaker (legacy - now just tracks)
  private increment429Counter(reportId: string): boolean {
    this.track429Response(reportId)
    const current = this.consecutive429Count.get(reportId) || 0
    const newCount = current
    this.consecutive429Count.set(reportId, newCount)
    
    if (newCount >= this.config.maxConsecutive429s!) {
      console.warn(`[INGESTOR] Circuit breaker triggered for ${reportId}: ${newCount} consecutive 429s`)
      return true // Circuit breaker open
    }
    
    return false // Circuit breaker closed
  }

  // Fetch single report data with pagination
  private async fetchReportData(report: AppFolioReportConfig): Promise<any[]> {
    const baseUrl = `https://${this.config.tenantDomain}/api/v1/reports/${report.id}.json`
    const allData: any[] = []
    let currentUrl = baseUrl
    let pageNumber = 1

    // Build query parameters
    const params = new URLSearchParams()
    params.set('paginate_results', 'true')
    
    // Add date range if required
    if (report.requiresDateRange) {
      const { from_date, to_date } = getDefaultDateRange()
      params.set('from_date', from_date)
      params.set('to_date', to_date)
    }

    // Add default parameters
    if (report.defaultParams) {
      Object.entries(report.defaultParams).forEach(([key, value]) => {
        params.set(key, value)
      })
    }

    const queryString = params.toString()
    if (queryString) {
      currentUrl = `${baseUrl}?${queryString}`
    }

    console.log(`[INGESTOR] Fetching ${report.id} from: ${currentUrl}`)

    while (currentUrl && pageNumber <= 100) { // Safety limit
      // Declare response variable in wider scope so it's accessible later
      let response: Response | undefined = undefined
      
      try {
        // Fetch with timeout and retry logic - NO HARD RETRY LIMIT
        const requestTimeout = 30000 // 30 second timeout per request
        const pageStartTime = Date.now()
        const maxPageDurationMs = 2 * 60 * 60 * 1000 // 2 hours per page max
        let lastError: Error | null = null
        let attempt = 1
        
        while (Date.now() - pageStartTime < maxPageDurationMs) {
          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), requestTimeout)
            const startTime = Date.now()
            
            response = await fetch(currentUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Basic ${this.basicAuth}`,
                'Accept': 'application/json',
                'User-Agent': 'CynthiaGardens-CommandCenter-Ingestor/1.0'
              },
              signal: controller.signal
            })
            
            clearTimeout(timeoutId)
            const responseTime = Date.now() - startTime
            this.trackResponseTime(report.id, responseTime)

            if (!response.ok) {
              const errorText = await response.text()
              
              // Handle rate limiting specifically
              if (response.status === 429) {
                console.log(`[INGESTOR] Rate limited for ${report.id}, will retry with longer delay`)
                
                // Track but don't break circuit - use exponential backoff only
                this.track429Response(report.id)
                const current429s = this.consecutive429Count.get(report.id) || 0
                
                // Exponential backoff with cap, don't abort entire report
                const backoffDelay = Math.min(
                  this.config.rateLimitBackoffMs! * Math.pow(2, Math.min(current429s, 5)), 
                  60000 // Max 60 second delay
                )
                await new Promise(resolve => setTimeout(resolve, backoffDelay))
                throw new Error(`API Error 429: Retry later`)
              }
              
              throw new Error(`API Error ${response.status}: ${errorText}`)
            }

            const responseText = await response.text()
            const pageData = JSON.parse(responseText)
            
            // Success - reset 429 counter and break out of retry loop
            this.reset429Counter(report.id)
            lastError = null
            // Continue with the rest of the logic after successful fetch
            
            // Handle different response structures
            if (Array.isArray(pageData)) {
              // Simple array response
              allData.push(...pageData)
              currentUrl = null
              break
            } else if (pageData.results && Array.isArray(pageData.results)) {
              // AppFolio paginated response with "results" key
              allData.push(...pageData.results)
              
              // Check for AppFolio pagination
              if (pageData.next_page_url) {
                currentUrl = pageData.next_page_url
              } else {
                currentUrl = null
                break
              }
            } else if (pageData.data && Array.isArray(pageData.data)) {
              // Other paginated response with "data" key
              allData.push(...pageData.data)
              
              if (pageData.meta?.next_page_url) {
                currentUrl = pageData.meta.next_page_url
              } else {
                currentUrl = null
                break
              }
            } else {
              // Single object
              allData.push(pageData)
              currentUrl = null
              break
            }
            
            // Break from retry loop on success
            break
            
          } catch (error: any) {
            const isTimeout = error.name === 'AbortError'
            const errorMsg = isTimeout ? 'Request timeout' : error.message
            lastError = error
            
            const timeElapsed = Date.now() - pageStartTime
            const timeRemaining = maxPageDurationMs - timeElapsed
            
            console.warn(`[INGESTOR] Attempt ${attempt} failed for ${report.id}: ${errorMsg} (${Math.round(timeElapsed/1000)}s elapsed)`)
            
            // Check if we're near the page timeout
            if (timeRemaining < 60000) { // Less than 1 minute remaining
              console.error(`[INGESTOR] Page timeout approaching for ${report.id} page ${pageNumber} - skipping page after ${Math.round(timeElapsed/1000)}s`)
              throw new Error(`Page timeout after ${Math.round(timeElapsed/1000)} seconds`)
            }
            
            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000)
            console.log(`[INGESTOR] Retrying in ${delay}ms... (${Math.round(timeRemaining/1000)}s remaining for this page)`)
            await new Promise(resolve => setTimeout(resolve, delay))
            attempt++
          }
        }
        
        // If we had an error that wasn't resolved, throw it
        if (lastError) {
          throw lastError
        }

        // Response handling logic moved into retry loop above

        pageNumber++
        
        // Save per-page checkpoint BEFORE rate limit delay
        if (pageNumber > 1) {
          const resumeMetadata = {
            pageNumber: pageNumber - 1,
            nextPageUrl: currentUrl
          }
          await this.updateCheckpoint(report.id, 'running', allData.length, null, resumeMetadata)
          console.log(`[CHECKPOINT] Saved page ${pageNumber - 1} progress: ${allData.length} total records`)
        }
        
        // Intelligent rate limiting delay with Retry-After support
        if (currentUrl) {
          const delay = await this.getIntelligentDelay(report.id, response)
          console.log(`[RATE_LIMIT] ${report.id}: Waiting ${Math.round(delay)}ms before next request (page ${pageNumber})`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }

      } catch (error) {
        console.error(`[INGESTOR] Error fetching ${report.id} page ${pageNumber}:`, error)
        throw error
      }
    }

    console.log(`[INGESTOR] Retrieved ${allData.length} records for ${report.id}`)
    return allData
  }

  // Store report data in database using proper async Prisma operations
  private async storeReportData(reportId: string, data: any[]): Promise<number> {
    console.log(`[APPFOLIO_INGESTOR] Storing ${data.length} records for ${reportId}`)

    // Use proper async Prisma operations instead of broken transaction
    try {
      const records = data.map(record => ({
        id: record.id || `${reportId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        payload: record
      }))

      const result = await AnalyticsRepository.appfolio.insertRawReport(reportId, records)
      console.log(`[APPFOLIO_INGESTOR] ✅ Successfully inserted ${result.count} records for ${reportId}`)
      return result.count
      
    } catch (error) {
      console.error(`[APPFOLIO_INGESTOR] ❌ Failed to insert records for ${reportId}:`, error)
      throw error
    }
  }

  // Ingest single report
  async ingestReport(report: AppFolioReportConfig): Promise<IngestorResult> {
    const startTime = Date.now()
    
    console.log(`[INGESTOR] Starting ingestion for report: ${report.id}`)
    await this.updateCheckpoint(report.id, 'running')

    try {
      // Fetch data
      const data = await this.fetchReportData(report)
      
      if (data.length === 0) {
        console.log(`[INGESTOR] No data found for report: ${report.id}`)
        this.updateCheckpoint(report.id, 'completed', 0)
        return {
          reportId: report.id,
          success: true,
          recordsIngested: 0,
          duration: Date.now() - startTime
        }
      }

      // Store data
      const recordsIngested = await this.storeReportData(report.id, data)
      
      // Update checkpoint
      await this.updateCheckpoint(report.id, 'completed', recordsIngested)
      
      console.log(`[INGESTOR] Successfully ingested ${recordsIngested} records for ${report.id}`)
      
      return {
        reportId: report.id,
        success: true,
        recordsIngested,
        duration: Date.now() - startTime
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[INGESTOR] Failed to ingest report ${report.id}:`, errorMessage)
      
      this.updateCheckpoint(report.id, 'failed', 0, errorMessage)
      
      return {
        reportId: report.id,
        success: false,
        recordsIngested: 0,
        error: errorMessage,
        duration: Date.now() - startTime
      }
    }
  }

  // Ingest all enabled reports
  async ingestAllReports(): Promise<IngestorResult[]> {
    const enabledReports = getEnabledReports()
    const results: IngestorResult[] = []
    
    console.log(`[INGESTOR] Starting ingestion for ${enabledReports.length} enabled reports`)
    
    // Process reports in batches to respect concurrency limits
    const batches = []
    for (let i = 0; i < enabledReports.length; i += this.config.concurrency!) {
      batches.push(enabledReports.slice(i, i + this.config.concurrency!))
    }

    for (const batch of batches) {
      const batchPromises = batch.map(report => this.ingestReport(report))
      const batchResults = await Promise.allSettled(batchPromises)
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          const report = batch[index]
          results.push({
            reportId: report.id,
            success: false,
            recordsIngested: 0,
            error: result.reason?.message || 'Promise rejected',
            duration: 0
          })
        }
      })

      // Delay between batches - longer delay to respect rate limits  
      if (batches.indexOf(batch) < batches.length - 1) {
        const batchDelay = await this.getIntelligentDelay('batch')
        console.log(`[INGESTOR] Waiting ${Math.round(batchDelay)}ms before next batch...`)
        await new Promise(resolve => setTimeout(resolve, batchDelay))
      }
    }

    const successful = results.filter(r => r.success).length
    const totalRecords = results.reduce((sum, r) => sum + r.recordsIngested, 0)
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)
    
    console.log(`[INGESTOR] Ingestion complete: ${successful}/${enabledReports.length} reports successful, ${totalRecords} total records, ${totalDuration}ms total duration`)
    
    return results
  }

  // Get ingestion status for all reports using proper async Prisma operations
  async getIngestionStatus(): Promise<any[]> {
    try {
      return await AnalyticsRepository.reportCheckpoint.getAll()
    } catch (error) {
      console.error('[APPFOLIO_INGESTOR] ❌ Failed to get ingestion status:', error)
      return []
    }
  }

  // Get report data count using proper async Prisma operations
  async getReportDataCount(reportId: string): Promise<number> {
    try {
      return await AnalyticsRepository.appfolio.getReportCount(reportId)
    } catch (error) {
      console.error(`[APPFOLIO_INGESTOR] ❌ Failed to get count for ${reportId}:`, error)
      return 0
    }
  }
}