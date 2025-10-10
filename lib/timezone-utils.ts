/**
 * EASTERN TIMEZONE NORMALIZATION UTILITY
 * 
 * All sync operations, data processing, and record timestamps must use Eastern USA time
 * to ensure data consistency regardless of where the sync is triggered from.
 * 
 * This prevents timezone confusion when manual syncs are triggered from different timezones.
 * 
 * ARCHITECTURE FIX: Using date-fns-tz for proper timezone handling to eliminate
 * the fundamental flaws in string-parsing and timezone conversion.
 */

import { toZonedTime, formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { addDays, parseISO, format } from 'date-fns'

export class EasternTimeManager {
  private static readonly EASTERN_TIMEZONE = 'America/New_York'
  
  /**
   * DEFENSIVE: Validate if a date is valid before timezone conversion
   * Prevents RangeError from corrupt AppFolio data
   */
  private static isValidDate(date: Date): boolean {
    return date instanceof Date && !isNaN(date.getTime())
  }
  
  /**
   * Get current Eastern date as YYYY-MM-DD string
   * Use this for all sync operations and snapshot dates
   * FIXED: No longer uses string parsing that causes timezone issues
   */
  static getCurrentEasternDate(): string {
    const now = new Date()
    return formatInTimeZone(now, this.EASTERN_TIMEZONE, 'yyyy-MM-dd')
  }

  /**
   * CONVENIENCE WRAPPER: Convert Date to Eastern YYYY-MM-DD string
   * Use this instead of `date.toISOString().split('T')[0]` 
   * This is the standard date formatter for all data ingestion and analytics
   * DEFENSIVE: Returns null for invalid dates instead of throwing
   */
  static toDateString(date: Date): string | null {
    if (!this.isValidDate(date)) {
      console.warn('[TIMEZONE_UTILS] Invalid date provided to toDateString:', date)
      return null
    }
    return formatInTimeZone(date, this.EASTERN_TIMEZONE, 'yyyy-MM-dd')
  }
  
  /**
   * Get current Eastern datetime as Date object
   * Use this for precise timestamp operations
   * FIXED: Now properly handles timezone conversion without string round-trips
   */
  static getCurrentEasternDateTime(): Date {
    const now = new Date()
    return toZonedTime(now, this.EASTERN_TIMEZONE)
  }
  
  /**
   * Get current Eastern datetime as ISO string
   * Use this for database timestamps and logging
   * FIXED: Now uses proper timezone conversion
   */
  static getCurrentEasternISO(): string {
    const easternTime = this.getCurrentEasternDateTime()
    return easternTime.toISOString()
  }
  
  /**
   * Convert any date to Eastern timezone date string (YYYY-MM-DD)
   * FIXED: No longer uses string parsing
   * DEFENSIVE: Returns null for invalid dates instead of throwing
   */
  static toEasternDate(date: Date): string | null {
    if (!this.isValidDate(date)) {
      console.warn('[TIMEZONE_UTILS] Invalid date provided to toEasternDate:', date)
      return null
    }
    return formatInTimeZone(date, this.EASTERN_TIMEZONE, 'yyyy-MM-dd')
  }
  
  /**
   * Convert any date to Eastern timezone datetime
   * FIXED: Proper timezone conversion without string round-trips
   * DEFENSIVE: Returns null for invalid dates instead of throwing
   */
  static toEasternDateTime(date: Date): Date | null {
    if (!this.isValidDate(date)) {
      console.warn('[TIMEZONE_UTILS] Invalid date provided to toEasternDateTime:', date)
      return null
    }
    return toZonedTime(date, this.EASTERN_TIMEZONE)
  }
  
  /**
   * Format Eastern date for human-readable display
   * Use this for email subjects and user-facing timestamps
   */
  static formatEasternDateForDisplay(): string {
    const now = new Date()
    return formatInTimeZone(now, this.EASTERN_TIMEZONE, 'MMMM d, yyyy')
  }
  
  /**
   * Format Eastern datetime for human-readable display
   */
  static formatEasternDateTimeForDisplay(): string {
    const now = new Date()
    return formatInTimeZone(now, this.EASTERN_TIMEZONE, 'MMMM d, yyyy h:mm aa zzz')
  }
  
  /**
   * Create a Date object for a specific Eastern date (YYYY-MM-DD)
   * Use this when you need to work with Eastern dates as Date objects
   * FIXED: Proper timezone handling without ambiguous parsing
   */
  static createEasternDate(easternDateString: string): Date {
    // Parse the date string as midnight in Eastern timezone
    const [year, month, day] = easternDateString.split('-').map(Number)
    
    // Create date at noon Eastern to avoid DST edge cases
    const easternDate = new Date(year, month - 1, day, 12, 0, 0, 0)
    
    // Return the date as-is since we created it correctly
    return easternDate
  }
  
  /**
   * Get Eastern date for X days ago
   * Use this for data retention and cleanup operations
   * FIXED: Proper date arithmetic in Eastern timezone
   */
  static getEasternDateDaysAgo(daysAgo: number): string {
    const now = new Date()
    const easternNow = toZonedTime(now, this.EASTERN_TIMEZONE)
    const pastDate = addDays(easternNow, -daysAgo)
    return formatInTimeZone(pastDate, this.EASTERN_TIMEZONE, 'yyyy-MM-dd')
  }
  
  /**
   * Check if a date string represents today in Eastern time
   * FIXED: More reliable comparison
   */
  static isToday(dateString: string): boolean {
    return dateString === this.getCurrentEasternDate()
  }
  
  /**
   * Check if a date string represents yesterday in Eastern time
   * NEW: Added for better date comparisons
   */
  static isYesterday(dateString: string): boolean {
    return dateString === this.getEasternDateDaysAgo(1)
  }
  
  /**
   * Get Eastern date for tomorrow
   * NEW: Added for comprehensive date operations
   */
  static getTomorrowEasternDate(): string {
    const now = new Date()
    const easternNow = toZonedTime(now, this.EASTERN_TIMEZONE)
    const tomorrow = addDays(easternNow, 1)
    return formatInTimeZone(tomorrow, this.EASTERN_TIMEZONE, 'yyyy-MM-dd')
  }
  
  /**
   * Parse a date string as Eastern timezone
   * NEW: Added for safe date parsing
   */
  static parseEasternDate(dateString: string): Date {
    // Handle both ISO strings and YYYY-MM-DD format
    if (dateString.includes('T')) {
      // ISO string - parse and convert to Eastern
      const utcDate = parseISO(dateString)
      return toZonedTime(utcDate, this.EASTERN_TIMEZONE)
    } else {
      // Date-only string - treat as Eastern
      return this.createEasternDate(dateString)
    }
  }
  
  /**
   * Format any timestamp in Eastern timezone for display
   * Use this for all UI timestamp displays to ensure EST consistency
   */
  static formatTimestampForDisplay(timestamp: string | Date): string {
    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
      return formatInTimeZone(date, this.EASTERN_TIMEZONE, 'M/d/yyyy, h:mm:ss aa')
    } catch (error) {
      console.error('Error formatting timestamp:', error)
      return 'Invalid date'
    }
  }

  /**
   * Log sync operation with Eastern timestamp
   */
  static logSyncOperation(operation: string, details?: any): void {
    const easternTimestamp = this.formatEasternDateTimeForDisplay()
    console.log(`[EASTERN_SYNC] ${easternTimestamp} - ${operation}`, details || '')
  }
  
  /**
   * Get current Eastern time components for detailed operations
   * NEW: Added for comprehensive time operations
   */
  static getCurrentEasternTimeComponents(): {
    date: string
    time: string
    hour: number
    minute: number
    dayOfWeek: number
  } {
    const now = new Date()
    return {
      date: formatInTimeZone(now, this.EASTERN_TIMEZONE, 'yyyy-MM-dd'),
      time: formatInTimeZone(now, this.EASTERN_TIMEZONE, 'HH:mm:ss'),
      hour: parseInt(formatInTimeZone(now, this.EASTERN_TIMEZONE, 'H')),
      minute: parseInt(formatInTimeZone(now, this.EASTERN_TIMEZONE, 'm')),
      dayOfWeek: parseInt(formatInTimeZone(now, this.EASTERN_TIMEZONE, 'e'))
    }
  }
  
  /**
   * Convert Eastern date to UTC start of day
   * Use this for querying UTC timestamps that cover an entire Eastern day
   * Example: "2025-10-05" Eastern → 2025-10-05T04:00:00.000Z (EDT) or 2025-10-05T05:00:00.000Z (EST)
   */
  static toUTCStartOfDay(easternDateString: string): Date {
    // Use fromZonedTime to convert Eastern midnight to UTC instant
    return fromZonedTime(`${easternDateString} 00:00:00`, this.EASTERN_TIMEZONE)
  }
  
  /**
   * Convert Eastern date to UTC end of day
   * Use this for querying UTC timestamps that cover an entire Eastern day
   * Example: "2025-10-05" Eastern → 2025-10-06T03:59:59.999Z (EDT) or 2025-10-06T04:59:59.999Z (EST)
   */
  static toUTCEndOfDay(easternDateString: string): Date {
    // DST-safe approach: Get next day's midnight and subtract 1ms
    // This avoids invalid local times on DST transition days
    const [year, month, day] = easternDateString.split('-').map(Number)
    const nextDay = new Date(year, month - 1, day + 1)
    const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`
    const utcNextDayMidnight = fromZonedTime(`${nextDayStr} 00:00:00`, this.EASTERN_TIMEZONE)
    // Subtract 1ms to get 23:59:59.999 of the target day
    return new Date(utcNextDayMidnight.getTime() - 1)
  }
}

/**
 * LEGACY COMPATIBILITY: Ensure existing code gets Eastern time
 * FIXED: Now uses proper timezone utilities
 */
export const getEasternDate = () => EasternTimeManager.getCurrentEasternDate()
export const getEasternDateTime = () => EasternTimeManager.getCurrentEasternDateTime()
export const getEasternISO = () => EasternTimeManager.getCurrentEasternISO()