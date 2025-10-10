import fs from 'fs'
import path from 'path'
import { prisma } from './prisma'
import { normalizeUnitCode, isStudentUnit } from './units'
import { findColumnMatch } from './data-coercion'

// The 4 specific AppFolio reports needed for occupancy KPIs (unit_vacancy now from Google Sheets)
export const OCCUPANCY_REPORTS = [
  'rent_roll',
  'lease_history',
  'lease_expiration_detail',
  'unit_directory'
] as const

export type OccupancyReportId = typeof OCCUPANCY_REPORTS[number]

// Column mappings for consistent field names
export interface ColumnMaps {
  [reportId: string]: {
    [canonicalName: string]: string | {
      sniffed_at: string
      available_columns: string[]
      unmapped_canonicals: string[]
    }
  }
}

// Canonical column names we need to map
const CANONICAL_COLUMNS = {
  rent_roll: [
    'unit_code', 'property_id', 'lease_id', 'tenant_id', 
    'lease_start_date', 'lease_end_date', 'move_in_date', 'move_out_date',
    'monthly_recurring_rent', 'market_rent', 'primary_tenant_flag', 
    'unit_status', 'lease_status', 'residents_count'
  ],
  lease_history: [
    'unit_code', 'lease_id', 'move_in_date', 'move_out_date', 
    'lease_start_date', 'lease_end_date'
  ],
  lease_expiration_detail: [
    'unit_code', 'lease_id', 'lease_end_date'
  ],
  unit_directory: [
    'unit_code', 'property_id', 'bedspace_code'
  ]
}

export class OccupancyIngestor {
  private clientId: string
  private clientSecret: string
  private tenantDomain: string
  private columnMapsPath: string
  private columnMaps: ColumnMaps = {}

  constructor(options: {
    clientId: string
    clientSecret: string  
    tenantDomain: string
  }) {
    this.clientId = options.clientId
    this.clientSecret = options.clientSecret
    this.tenantDomain = options.tenantDomain
    this.columnMapsPath = path.join(process.cwd(), 'data', 'column_maps.appfolio.json')
    this.loadColumnMaps()
  }

  private loadColumnMaps(): void {
    try {
      if (fs.existsSync(this.columnMapsPath)) {
        const data = fs.readFileSync(this.columnMapsPath, 'utf8')
        this.columnMaps = JSON.parse(data)
        console.log('[OCCUPANCY_INGESTOR] Loaded existing column maps')
      } else {
        console.log('[OCCUPANCY_INGESTOR] No existing column maps, will create new ones')
      }
    } catch (error) {
      console.warn('[OCCUPANCY_INGESTOR] Failed to load column maps, starting fresh:', error)
      this.columnMaps = {}
    }
  }

  private saveColumnMaps(): void {
    try {
      const dir = path.dirname(this.columnMapsPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.columnMapsPath, JSON.stringify(this.columnMaps, null, 2))
      console.log('[OCCUPANCY_INGESTOR] Saved column maps to', this.columnMapsPath)
    } catch (error) {
      console.error('[OCCUPANCY_INGESTOR] Failed to save column maps:', error)
    }
  }

  private async makeRequest(url: string): Promise<any> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CynthiaGardens-CommandCenter/1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  private async sniffColumns(reportId: OccupancyReportId): Promise<{
    mappedColumns: string[]
    unmappedCanonicals: string[]
  }> {
    console.log(`[OCCUPANCY_INGESTOR] Sniffing columns for ${reportId}...`)
    
    const url = `https://${this.tenantDomain}/api/v1/reports/${reportId}.json?paginate_results=true&limit=1`
    
    try {
      const data = await this.makeRequest(url)
      
      if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
        console.log(`[OCCUPANCY_INGESTOR] No results found for ${reportId}, skipping column mapping`)
        const canonicalCols = CANONICAL_COLUMNS[reportId] || []
        return {
          mappedColumns: [],
          unmappedCanonicals: canonicalCols
        }
      }

      // Get keys from first record (single page sniff)
      const sampleRecord = data.results[0]
      const availableKeys = Object.keys(sampleRecord)
      
      console.log(`[OCCUPANCY_INGESTOR] Found ${availableKeys.length} columns in ${reportId}:`, availableKeys)

      // Map canonical names to actual keys using fuzzy matching
      const canonicalCols = CANONICAL_COLUMNS[reportId] || []
      const columnMap: { [canonical: string]: string } = {}
      const unmappedCanonicals: string[] = []

      for (const canonical of canonicalCols) {
        const matchResult = findColumnMatch(canonical, availableKeys)
        if (matchResult.match) {
          columnMap[canonical] = matchResult.match
          
          if (matchResult.isAddressy && canonical === 'unit_code') {
            console.log(`[OCCUPANCY_INGESTOR] ⚠️  Mapped ${canonical} → ${matchResult.match} (ADDRESSY - may need crosswalk)`)
          } else {
            console.log(`[OCCUPANCY_INGESTOR] ✅ Mapped ${canonical} → ${matchResult.match}`)
          }
        } else {
          console.log(`[OCCUPANCY_INGESTOR] ❌ Could not map ${canonical} in ${reportId}`)
          unmappedCanonicals.push(canonical)
        }
      }

      // Save the column mapping with metadata
      this.columnMaps[reportId] = {
        ...columnMap,
        _metadata: {
          sniffed_at: new Date().toISOString(),
          available_columns: availableKeys,
          unmapped_canonicals: unmappedCanonicals
        }
      }
      this.saveColumnMaps()

      return {
        mappedColumns: Object.values(columnMap),
        unmappedCanonicals
      }
    } catch (error) {
      console.error(`[OCCUPANCY_INGESTOR] Failed to sniff columns for ${reportId}:`, error)
      const canonicalCols = CANONICAL_COLUMNS[reportId] || []
      return {
        mappedColumns: [],
        unmappedCanonicals: canonicalCols
      }
    }
  }


  private async pullReportData(reportId: OccupancyReportId, columns?: string[]): Promise<any[]> {
    console.log(`[OCCUPANCY_INGESTOR] Pulling ${reportId} data...`)
    
    let baseUrl = `https://${this.tenantDomain}/api/v1/reports/${reportId}.json?paginate_results=true`
    
    // Add column filtering if we have mapped columns
    if (columns && columns.length > 0) {
      baseUrl += `&columns=${columns.join(',')}`
    }

    let allResults: any[] = []
    let nextPageUrl = baseUrl

    try {
      while (nextPageUrl) {
        console.log(`[OCCUPANCY_INGESTOR] Fetching ${reportId}: ${nextPageUrl}`)
        const data = await this.makeRequest(nextPageUrl)
        
        if (data.results && Array.isArray(data.results)) {
          allResults.push(...data.results)
          console.log(`[OCCUPANCY_INGESTOR] Got ${data.results.length} records from ${reportId} (total: ${allResults.length})`)
        }

        // Check for next page
        nextPageUrl = data.next_page_url || null
        
        if (nextPageUrl) {
          // Rate limiting: wait 2 seconds between pages
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      console.log(`[OCCUPANCY_INGESTOR] Completed ${reportId}: ${allResults.length} total records`)
      return allResults
    } catch (error) {
      console.error(`[OCCUPANCY_INGESTOR] Failed to pull ${reportId}:`, error)
      throw error
    }
  }

  public async ingestOccupancyReports(): Promise<{
    success: boolean
    reports: Array<{
      id: OccupancyReportId
      success: boolean
      recordCount: number
      unmappedCanonicals?: string[]
      error?: string
    }>
    totalRecords: number
  }> {
    console.log('[OCCUPANCY_INGESTOR] Starting occupancy reports ingestion...')
    
    const results = {
      success: true,
      reports: [] as any[],
      totalRecords: 0
    }

    for (const reportId of OCCUPANCY_REPORTS) {
      const reportResult = {
        id: reportId,
        success: false,
        recordCount: 0,
        unmappedCanonicals: [] as string[],
        error: undefined as string | undefined
      }

      try {
        // Step 1: Sniff columns (always sniff to get latest schema)
        const sniffResult = await this.sniffColumns(reportId)
        reportResult.unmappedCanonicals = sniffResult.unmappedCanonicals
        
        if (sniffResult.unmappedCanonicals.length > 0) {
          console.log(`[OCCUPANCY_INGESTOR] ⚠️ ${reportId} has unmapped canonicals:`, sniffResult.unmappedCanonicals)
        }

        // Step 2: Pull the data with mapped columns
        const records = await this.pullReportData(reportId, sniffResult.mappedColumns)
        
        // Step 3: Store in database
        await this.storeReportData(reportId, records)
        
        reportResult.success = true
        reportResult.recordCount = records.length
        results.totalRecords += records.length
        
        console.log(`[OCCUPANCY_INGESTOR] ✅ ${reportId}: ${records.length} records`)

      } catch (error) {
        console.error(`[OCCUPANCY_INGESTOR] ❌ ${reportId} failed:`, error)
        reportResult.error = error instanceof Error ? error.message : 'Unknown error'
        results.success = false
      }

      results.reports.push(reportResult)
      
      // Rate limiting between reports
      await new Promise(resolve => setTimeout(resolve, 3000))
    }

    console.log(`[OCCUPANCY_INGESTOR] Ingestion complete: ${results.totalRecords} total records`)
    return results
  }

  private async storeReportData(reportId: OccupancyReportId, records: any[]): Promise<void> {
    if (records.length === 0) return

    // ARCHITECTURE FIX: Use Prisma models for PostgreSQL data ingestion (replaces dynamic SQLite tables)
    const modelMap = {
      'rent_roll': prisma.rawAppfolioRentRoll,
      'lease_history': prisma.rawAppfolioLeaseHistory, 
      'lease_expiration_detail': prisma.rawAppfolioLeaseExpirationDetail,
      'unit_directory': prisma.rawAppfolioUnitDirectory
    } as const

    const model = modelMap[reportId]
    if (!model) {
      throw new Error(`Unknown report ID: ${reportId}`)
    }

    // ARCHITECTURE FIX: Atomic clear + insert using Prisma transaction (replaces SQLite prepare/transaction)
    await prisma.$transaction(async (tx) => {
      // Clear existing data using transaction-specific models
      if (reportId === 'rent_roll') {
        await tx.rawAppfolioRentRoll.deleteMany()
      } else if (reportId === 'lease_history') {
        await tx.rawAppfolioLeaseHistory.deleteMany()
      } else if (reportId === 'lease_expiration_detail') {
        await tx.rawAppfolioLeaseExpirationDetail.deleteMany()
      } else if (reportId === 'unit_directory') {
        await tx.rawAppfolioUnitDirectory.deleteMany()
      }
      
      // Chunk records for optimal batch performance (max 1000 per batch)
      const chunkSize = 1000
      const chunks = []
      for (let i = 0; i < records.length; i += chunkSize) {
        chunks.push(records.slice(i, i + chunkSize))
      }

      // Insert new data in chunks using transaction-specific models
      for (const chunk of chunks) {
        const data = chunk.map((record) => ({
          payloadJson: record
        }))
        
        if (reportId === 'rent_roll') {
          await tx.rawAppfolioRentRoll.createMany({ data })
        } else if (reportId === 'lease_history') {
          await tx.rawAppfolioLeaseHistory.createMany({ data })
        } else if (reportId === 'lease_expiration_detail') {
          await tx.rawAppfolioLeaseExpirationDetail.createMany({ data })
        } else if (reportId === 'unit_directory') {
          await tx.rawAppfolioUnitDirectory.createMany({ data })
        }
      }
    })

    console.log(`[OCCUPANCY_INGESTOR] Stored ${records.length} records in raw_appfolio_${reportId}`)
  }
}