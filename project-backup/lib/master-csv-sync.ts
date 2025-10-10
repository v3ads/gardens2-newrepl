import { AnalyticsRepository } from './analytics-repositories'
import { emailService } from './email-service'
import * as fs from 'fs'
import * as path from 'path'

// Production-safe direct CSV export with proper user agent and redirect handling
const GOOGLE_SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1fhliwX7Ps0l9ISyhNdmvAd5CFKY8xtsICdxVmWXvKlc/export?format=csv'

interface MasterCSVRow {
  Unit: string
  'First Name': string
  'Last Name': string
  'Full Name': string
  'Phone Number': string
  Email: string
  'Lease Start Date': string
  'Lease End Date': string
  'Move In Date': string
  'Monthly Rent': string
  'Market Rent': string
  'Days Vacant': string
  'Security Deposit': string
  'Tenant Status': string
  'Tenant Type': string
  'Primary Tenant': string
  'Square Feet': string
  'Unit Type': string
  'Unit Category': string
  'Leasing Agent': string
  'Next Rent Increase': string
  'Last Rent Increase': string
}

export class MasterCSVSync {
  // Robust CSV fetch with retries and timeout handling
  private static async fetchCSVWithRetries(url: string, maxRetries: number = 3): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[MASTER_CSV_SYNC] Fetch attempt ${attempt}/${maxRetries}`)

        // Create AbortController for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Cynthia Gardens Command Center/7.0.0'
          }
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          // Handle redirects manually if needed
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location')
            if (location && attempt < maxRetries) {
              console.log(`[MASTER_CSV_SYNC] Following redirect to: ${location}`)
              return this.fetchCSVWithRetries(location, maxRetries - attempt + 1)
            }
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const csvText = await response.text()

        // Validate CSV content
        if (!csvText || csvText.length < 100) {
          throw new Error('Received empty or invalid CSV data')
        }

        console.log(`[MASTER_CSV_SYNC] ✅ Successfully fetched CSV on attempt ${attempt}`)
        return csvText

      } catch (error) {
        console.error(`[MASTER_CSV_SYNC] Fetch attempt ${attempt} failed:`, error)

        if (attempt === maxRetries) {
          throw new Error(`Failed to fetch CSV after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }

        // Exponential backoff: wait 2^attempt seconds
        const waitTime = Math.pow(2, attempt) * 1000
        console.log(`[MASTER_CSV_SYNC] Retrying in ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }

    throw new Error('Max retries exceeded')
  }

  public static async syncMasterCSV(): Promise<{
    success: boolean
    recordsProcessed: number
    duration: number
    csvFilePath?: string
    metrics?: any
    error?: string
  }> {
    const startTime = Date.now()
    console.log('[MASTER_CSV_SYNC] Starting master.csv sync from Google Sheets...')

    try {
      // Fetch CSV data from Google Sheets FIRST (data safety - don't clear until we have new data)
      console.log('[MASTER_CSV_SYNC] Fetching CSV from Google Sheets...')
      const csvText = await this.fetchCSVWithRetries(GOOGLE_SHEETS_CSV_URL)
      console.log(`[MASTER_CSV_SYNC] Retrieved CSV data: ${csvText.length} characters`)

      // Parse CSV data
      const lines = csvText.split('\n').filter(line => line.trim())
      const header = lines[0].split(',').map(col => col.replace(/"/g, '').trim())

      console.log(`[MASTER_CSV_SYNC] Processing ${lines.length - 1} data rows...`)

      // Process records for bulk insert using proper async Prisma operations
      const records: any[] = []
      let recordsProcessed = 0

      // Process each data row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        // Parse CSV line (handling quoted values)
        const values = this.parseCSVLine(line)
        if (values.length < header.length) continue // Skip malformed rows

        const rowData: any = {}
        header.forEach((col, index) => {
          rowData[col] = values[index] || ''
        })

        // Convert numeric fields
        const monthlyRent = parseFloat(rowData['Monthly Rent']?.replace(/[,$]/g, '') || '0')
        const marketRent = parseFloat(rowData['Market Rent']?.replace(/[,$]/g, '') || '0')
        const securityDeposit = parseFloat(rowData['Security Deposit']?.replace(/[,$]/g, '') || '0')
        const daysVacant = parseInt(rowData['Days Vacant'] || '0')

        // Collect record for bulk insert using proper async Prisma operations
        records.push({
          unit: rowData['Unit'] || '',
          firstName: rowData['First Name'] || '',
          lastName: rowData['Last Name'] || '',
          fullName: rowData['Full Name'] || '',
          phoneNumber: rowData['Phone Number'] || '',
          email: rowData['Email'] || '',
          leaseStartDate: rowData['Lease Start Date'] || '',
          leaseEndDate: rowData['Lease End Date'] || '',
          moveInDate: rowData['Move In Date'] || '',
          monthlyRent,
          marketRent,
          daysVacant,
          securityDeposit,
          tenantStatus: rowData['Tenant Status'] || '',
          tenantType: rowData['Tenant Type'] || '',
          primaryTenant: rowData['Primary Tenant'] || '',
          squareFeet: rowData['Square Feet'] || '',
          unitType: rowData['Unit Type'] || '',
          unitCategory: rowData['Unit Category'] || '',
          leasingAgent: rowData['Leasing Agent'] || '',
          nextRentIncrease: rowData['Next Rent Increase'] || '',
          lastRentIncrease: rowData['Last Rent Increase'] || ''
        })

        recordsProcessed++
      }

      // PERFORMANCE IMPROVEMENT: Use upsert instead of delete+rebuild for better efficiency
      console.log('[MASTER_CSV_SYNC] Using incremental upsert instead of full rebuild for better performance...')

      // PERFORMANCE IMPROVEMENT: Use incremental upsert instead of delete+rebuild
      if (records.length > 0) {
        const result = await AnalyticsRepository.masterCsv.upsertMany(records)
        console.log(`[MASTER_CSV_SYNC] ✅ Successfully upserted ${result.count} CSV records to PostgreSQL (incremental)`)
      }

      // Save CSV file locally for email attachment
      const csvFilePath = await this.saveMasterCSVFile(csvText)

      // Create master_tenant_data table for query system consistency
      await this.createMasterTenantDataTable()

      // Get summary metrics (email will be sent by DailySyncManager after full completion)
      const metrics = this.getMasterCSVMetrics()

      const duration = Date.now() - startTime
      console.log(`[MASTER_CSV_SYNC] ✅ Master CSV sync completed: ${recordsProcessed} records in ${duration}ms`)

      return { success: true, recordsProcessed, duration, csvFilePath, metrics }

    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[MASTER_CSV_SYNC] ❌ Master CSV sync failed:', error)
      return { success: false, recordsProcessed: 0, duration, error: errorMessage }
    }
  }

  private static parseCSVLine(line: string): string[] {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    values.push(current.trim())
    return values
  }

  /**
   * Get current Eastern Time date in YYYY-MM-DD format
   */
  private static getCurrentEasternDate(): string {
    // EASTERN TIMEZONE NORMALIZATION: Use centralized utility for consistency
    const { EasternTimeManager } = require('./timezone-utils')
    return EasternTimeManager.getCurrentEasternDate()
  }

  private static async saveMasterCSVFile(csvContent: string): Promise<string> {
    try {
      // Use absolute path to ensure file can be found from any working directory (worker vs Next.js)
      const dataDir = path.join(process.cwd(), 'data')
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }

      // Save with current Eastern Time date
      const todayEastern = this.getCurrentEasternDate()
      const filePath = path.join(dataDir, `master-${todayEastern}.csv`)

      fs.writeFileSync(filePath, csvContent, 'utf8')
      console.log(`[MASTER_CSV_SYNC] ✅ CSV file saved to: ${filePath}`)

      return filePath
    } catch (error) {
      console.error('[MASTER_CSV_SYNC] ❌ Failed to save CSV file:', error)
      throw error
    }
  }

  public static async getMasterCSVMetrics() {
    try {
      console.log('[MASTER_CSV_SYNC] 📊 Getting metrics using unified analytics (CONSISTENT WITH DASHBOARD)...')
      
      // Use unified analytics for consistent data and business rule application  
      const { UnifiedAnalytics } = await import('./unified-analytics')
      const unifiedMetrics = await UnifiedAnalytics.getAnalyticsMetrics({ excludeFamilyUnits: false })
      
      console.log(`[MASTER_CSV_SYNC] 🔄 Using unified analytics data: ${unifiedMetrics.totalUnits} total units`)
      console.log(`[MASTER_CSV_SYNC] 🏠 Family unit business rule applied: ${unifiedMetrics.familyUnits?.totalFamilyUnits || 0} family units always occupied`)
      
      // Use unified metrics directly since they already apply business rules correctly
      const metrics = {
        snapshot_date: unifiedMetrics.snapshotDate,
        total_units: unifiedMetrics.totalUnits,
        occupied_units: unifiedMetrics.occupiedUnits,
        vacant_units: unifiedMetrics.vacantUnits,
        actual_mrr: Math.round(unifiedMetrics.actualMRR),
        market_potential: Math.round(unifiedMetrics.marketPotential || (unifiedMetrics.actualMRR + unifiedMetrics.vacancyLoss)),
        vacancy_loss: Math.round(unifiedMetrics.vacancyLoss)
      }

      console.log('[MASTER_CSV_SYNC] ✅ EMAIL METRICS now CONSISTENT WITH DASHBOARD:', {
        total_units: metrics.total_units,
        occupied_units: metrics.occupied_units,
        vacant_units: metrics.vacant_units,
        actual_mrr: metrics.actual_mrr,
        market_potential: metrics.market_potential,
        vacancy_loss: metrics.vacancy_loss
      })

      return metrics
    } catch (error) {
      console.error('[MASTER_CSV_SYNC] ❌ Failed to get metrics, falling back to CSV data:', error)
      
      // Fallback to original CSV logic
      try {
        const masterData = this.getMasterCSVData()
        if (!masterData || masterData.length === 0) {
          throw new Error('No master CSV data available')
        }

        // Create canonical table (one row per unit)
        const unitGroups = new Map<string, any[]>()

        for (const record of masterData) {
          const unit = record.unit?.toString()?.trim()
          if (!unit) continue

          if (!unitGroups.has(unit)) {
            unitGroups.set(unit, [])
          }
          unitGroups.get(unit)!.push(record)
        }

        const canonicalUnits: any[] = []

        for (const [unit, records] of unitGroups) {
          const primaryTenantRecord = records.find(r => r.primary_tenant === 'Yes')
          const selectedRecord = primaryTenantRecord || records[0]

          canonicalUnits.push({
            unit,
            tenant_status: selectedRecord.tenant_status || '',
            primary_tenant: selectedRecord.primary_tenant || '',
            monthly_rent: parseFloat(selectedRecord.monthly_rent) || 0,
            market_rent: parseFloat(selectedRecord.market_rent) || 0
          })
        }
        
        const occupiedUnits = canonicalUnits.filter(unit => unit.tenant_status === 'Current' || unit.tenant_status === 'Notice')
        const vacantUnits = canonicalUnits.filter(unit => unit.tenant_status === 'Vacant')

        const actualMRR = occupiedUnits.reduce((sum, unit) => sum + (unit.monthly_rent || 0), 0)
        const vacancyLoss = vacantUnits.reduce((sum, unit) => sum + (unit.market_rent || 0), 0)
        const marketPotential = actualMRR + vacancyLoss

        return {
          snapshot_date: this.getCurrentEasternDate(),
          total_units: canonicalUnits.length,
          occupied_units: occupiedUnits.length,
          vacant_units: vacantUnits.length,
          actual_mrr: Math.round(actualMRR),
          market_potential: Math.round(marketPotential),
          vacancy_loss: Math.round(vacancyLoss)
        }
      } catch (csvError) {
        console.error('[MASTER_CSV_SYNC] ❌ CSV fallback also failed:', csvError)
        return {
          snapshot_date: new Date().toISOString().split('T')[0],
          total_units: 0,
          occupied_units: 0,
          vacant_units: 0,
          actual_mrr: 0,
          market_potential: 0,
          vacancy_loss: 0
        }
      }
    }
  }

  // Parse money string (remove $ and commas, convert to number)
  private static parseMoneyString(value: string | undefined): number {
    if (!value) return 0
    return parseFloat(value.toString().replace(/[,$]/g, '') || '0')
  }

  // Get latest master CSV data from saved file on disk
  public static getMasterCSVData(): any[] {
    try {
      // Find the latest master CSV file
      const dataDir = './data'
      if (!fs.existsSync(dataDir)) {
        console.warn('[MASTER_CSV] Data directory does not exist')
        return []
      }

      const files = fs.readdirSync(dataDir)
        .filter(file => file.startsWith('master-') && file.endsWith('.csv'))
        .sort()
        .reverse() // Latest first

      if (files.length === 0) {
        console.warn('[MASTER_CSV] No master CSV files found in data directory')
        return []
      }

      const latestFile = path.join(dataDir, files[0])
      console.log(`[MASTER_CSV] Reading from latest CSV file: ${files[0]}`)

      // Parse the CSV file
      const csvContent = fs.readFileSync(latestFile, 'utf-8')
      const rows = csvContent.split('\n').filter(row => row.trim())

      if (rows.length < 2) {
        console.warn('[MASTER_CSV] CSV file appears to be empty or invalid')
        return []
      }

      // Parse header and data rows using proper CSV parsing
      const headers = this.parseCSVLine(rows[0])
      const data = rows.slice(1).map(row => {
        const values = this.parseCSVLine(row)
        const rawRecord: any = {}
        headers.forEach((header, index) => {
          rawRecord[header] = values[index] || ''
        })

        // Normalize to snake_case fields expected by Financial Analytics
        const record: any = {
          unit: rawRecord['Unit']?.toString()?.trim(),
          tenant_status: rawRecord['Tenant Status']?.toString()?.trim(),
          primary_tenant: rawRecord['Primary Tenant']?.toString()?.trim(),
          monthly_rent: this.parseMoneyString(rawRecord['Monthly Rent']),
          market_rent: this.parseMoneyString(rawRecord['Market Rent']),
          days_vacant: parseInt(rawRecord['Days Vacant'] || '0'),
          security_deposit: this.parseMoneyString(rawRecord['Security Deposit']),
          first_name: rawRecord['First Name']?.toString()?.trim(),
          last_name: rawRecord['Last Name']?.toString()?.trim(),
          full_name: rawRecord['Full Name']?.toString()?.trim(),
          phone_number: rawRecord['Phone Number']?.toString()?.trim(),
          email: rawRecord['Email']?.toString()?.trim(),
          lease_start_date: rawRecord['Lease Start Date']?.toString()?.trim(),
          lease_end_date: rawRecord['Lease End Date']?.toString()?.trim(),
          move_in_date: rawRecord['Move In Date']?.toString()?.trim(),
          square_feet: rawRecord['Square Feet']?.toString()?.trim(),
          unit_type: rawRecord['Unit Type']?.toString()?.trim(),
          unit_category: rawRecord['Unit Category']?.toString()?.trim(),
          leasing_agent: rawRecord['Leasing Agent']?.toString()?.trim(),
          next_rent_increase: rawRecord['Next Rent Increase']?.toString()?.trim(),
          last_rent_increase: rawRecord['Last Rent Increase']?.toString()?.trim()
        }
        return record
      })

      console.log(`[MASTER_CSV] Loaded ${data.length} records from ${files[0]}`)
      return data

    } catch (error) {
      console.error('[MASTER_CSV_SYNC] Error reading master CSV from disk:', error)
      return []
    }
  }


  private static async createMasterTenantDataTable(): Promise<void> {
    try {
      const today = this.getCurrentEasternDate()
      const snapshotDate = new Date(today)

      console.log(`[MASTER_CSV_SYNC] Creating master_tenant_data table for ${today}`)

      // Clear existing data for today using proper async Prisma operations
      await AnalyticsRepository.masterTenant.deleteByDate(snapshotDate)

      // Get canonical unit data from PostgreSQL CSV table instead of file system
      const masterData = await AnalyticsRepository.masterCsv.findAll()
      if (!masterData || masterData.length === 0) {
        console.log('[MASTER_CSV_SYNC] ⚠️ No CSV data available for master_tenant_data')
        return
      }

      console.log(`[MASTER_CSV_SYNC] Processing ${masterData.length} CSV records for master_tenant_data`)

      // Create canonical table (one row per unit)
      const unitMap = new Map()

      for (const row of masterData) {
        if (!row.unit || row.unit.trim() === '') continue

        const unitKey = row.unit.trim()

        if (!unitMap.has(unitKey)) {
          unitMap.set(unitKey, {
            unit: unitKey,
            tenant_status: row.tenantStatus === 'Current' ? 'Current' : 'Vacant',
            monthly_rent: row.tenantStatus === 'Current' ? (row.monthlyRent || 0) : 0,
            market_rent: row.marketRent || 0
          })
        } else {
          // Update with current tenant if exists
          const existing = unitMap.get(unitKey)
          if (row.tenantStatus === 'Current') {
            existing.tenant_status = 'Current'
            existing.monthly_rent = row.monthlyRent || 0
          }
        }
      }

      // Insert canonical data using proper async Prisma operations
      const records = Array.from(unitMap).map(([unitCode, unitData]) => ({
        snapshotDate,
        unitCode,
        isOccupied: unitData.tenant_status === 'Current',
        mrrAmount: unitData.monthly_rent || 0,
        marketRent: unitData.marketRent || 0
      }))

      const result = await AnalyticsRepository.masterTenant.createMany(records)
      const recordsCreated = result.count

      console.log(`[MASTER_CSV_SYNC] ✅ Created master_tenant_data table with ${recordsCreated} units for ${today}`)

    } catch (error) {
      console.error('[MASTER_CSV_SYNC] ❌ Failed to create master_tenant_data table:', error)
    }
  }

  // Get the path to the latest CSV file
  public static getLatestCSVPath(): string | null {
    try {
      const dataDir = './data'
      if (!fs.existsSync(dataDir)) {
        return null
      }

      const files = fs.readdirSync(dataDir)
        .filter(file => file.startsWith('master-') && file.endsWith('.csv'))
        .sort()
        .reverse() // Latest first

      if (files.length === 0) {
        return null
      }

      return path.join(dataDir, files[0])
    } catch (error) {
      console.error('[MASTER_CSV_SYNC] ❌ Failed to get latest CSV path:', error)
      return null
    }
  }
}