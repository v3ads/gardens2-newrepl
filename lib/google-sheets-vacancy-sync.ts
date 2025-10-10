// ARCHITECTURE FIX: Use PostgreSQL adapter for complete database unification
import { analyticsDb } from './analytics-db-pg'

interface GoogleSheetsVacancyRecord {
  Unit: string
  DaysVacant: string
  UnitStatus: string
  LastMoveOut: string
  UnitId: string
}

export class GoogleSheetsVacancySync {
  private static readonly SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1fhliwX7Ps0l9ISyhNdmvAd5CFKY8xtsICdxVmWXvKlc/gviz/tq?tqx=out:csv&sheet=unit_vacancy'
  
  /**
   * Fetch unit vacancy data from Google Sheets
   */
  async fetchVacancyData(): Promise<GoogleSheetsVacancyRecord[]> {
    console.log('[GOOGLE_SHEETS_VACANCY] Fetching vacancy data from Google Sheets...')
    
    try {
      const response = await fetch(GoogleSheetsVacancySync.SHEETS_URL)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const csvText = await response.text()
      const records = this.parseCSV(csvText)
      
      console.log(`[GOOGLE_SHEETS_VACANCY] Successfully fetched ${records.length} vacancy records`)
      return records
      
    } catch (error) {
      console.error('[GOOGLE_SHEETS_VACANCY] Failed to fetch vacancy data:', error)
      throw error
    }
  }
  
  /**
   * Parse CSV text into structured records
   */
  private parseCSV(csvText: string): GoogleSheetsVacancyRecord[] {
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) return []
    
    // Parse header to get column indices
    const header = this.parseCSVLine(lines[0])
    const unitIndex = header.indexOf('Unit')
    const daysVacantIndex = header.indexOf('DaysVacant')
    const unitStatusIndex = header.indexOf('UnitStatus')
    const lastMoveOutIndex = header.indexOf('LastMoveOut')
    const unitIdIndex = header.indexOf('UnitId')
    
    if (unitIndex === -1 || daysVacantIndex === -1) {
      throw new Error('Required columns (Unit, DaysVacant) not found in CSV')
    }
    
    const records: GoogleSheetsVacancyRecord[] = []
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCSVLine(lines[i])
      
      if (row.length > unitIndex && row[unitIndex]) {
        records.push({
          Unit: row[unitIndex] || '',
          DaysVacant: row[daysVacantIndex] || '0',
          UnitStatus: row[unitStatusIndex] || '',
          LastMoveOut: row[lastMoveOutIndex] || '',
          UnitId: row[unitIdIndex] || ''
        })
      }
    }
    
    return records
  }
  
  /**
   * Parse a single CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    
    result.push(current.trim())
    return result
  }
  
  /**
   * Store vacancy data in the database
   */
  async storeVacancyData(records: GoogleSheetsVacancyRecord[]): Promise<void> {
    console.log('[GOOGLE_SHEETS_VACANCY] Storing vacancy data in database...')
    
    try {
      // Clear existing Google Sheets vacancy data
      analyticsDb.exec('DELETE FROM raw_occupancy_unit_vacancy')
      
      // Prepare insert statement - match existing table structure
      const insertStmt = analyticsDb.prepare(`
        INSERT INTO raw_occupancy_unit_vacancy (
          id, payload_json, ingested_at
        ) VALUES (?, ?, datetime('now'))
      `)
      
      const now = new Date().toISOString()
      let insertedCount = 0
      
      for (const record of records) {
        // Convert to AppFolio-compatible format
        const payload = {
          UnitId: record.UnitId || record.Unit,
          DaysVacant: record.DaysVacant,
          LastMoveOut: record.LastMoveOut,
          UnitStatus: record.UnitStatus,
          Unit: record.Unit
        }
        
        try {
          const id = `google_sheets_vacancy_${record.Unit}_${Date.now()}`
          insertStmt.run(id, JSON.stringify(payload))
          insertedCount++
        } catch (error) {
          console.warn(`[GOOGLE_SHEETS_VACANCY] Failed to insert record for unit ${record.Unit}:`, error)
        }
      }
      
      console.log(`[GOOGLE_SHEETS_VACANCY] Successfully stored ${insertedCount} vacancy records`)
      
    } catch (error) {
      console.error('[GOOGLE_SHEETS_VACANCY] Failed to store vacancy data:', error)
      throw error
    }
  }
  
  /**
   * Complete sync process: fetch and store vacancy data
   */
  async syncVacancyData(): Promise<number> {
    console.log('[GOOGLE_SHEETS_VACANCY] Starting vacancy data sync...')
    
    try {
      const records = await this.fetchVacancyData()
      await this.storeVacancyData(records)
      
      console.log('[GOOGLE_SHEETS_VACANCY] ✅ Vacancy sync completed successfully')
      return records.length
      
    } catch (error) {
      console.error('[GOOGLE_SHEETS_VACANCY] ❌ Vacancy sync failed:', error)
      throw error
    }
  }
}