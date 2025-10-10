import { normalizeUnitCode } from './units'

/**
 * Convert various values to 0 or 1
 * Returns 1 for: ["1", 1, true, "true", "yes", "y", "occupied", "current"]
 * Returns 0 for everything else
 */
export function to01(value: any): number {
  if (value === null || value === undefined || value === '') {
    return 0
  }

  const stringValue = String(value).toLowerCase().trim()
  
  const trueValues = [
    '1', 'true', 'yes', 'y', 
    'occupied', 'current', 'active'
  ]
  
  return trueValues.includes(stringValue) || value === 1 || value === true ? 1 : 0
}

/**
 * Determine if a unit is a student unit based on dash in unit code
 * Returns 1 if unit code contains a dash, 0 otherwise
 * Respects overrides if they exist
 */
export function dashIsStudent(unitCodeNorm: string, overrides?: { [unitCode: string]: boolean }): number {
  if (!unitCodeNorm) return 0
  
  // Check for override first
  if (overrides && unitCodeNorm in overrides) {
    return overrides[unitCodeNorm] ? 1 : 0
  }
  
  // Default rule: contains dash = student unit
  return unitCodeNorm.includes('-') ? 1 : 0
}

/**
 * Derive occupancy status using layered logic
 * Returns { isOccupied: 0|1, source: string }
 */
export function deriveOccupancyStatus(data: {
  leaseStart?: string
  leaseEnd?: string
  unitStatus?: string
  leaseStatus?: string
  residentsCount?: number
  snapshotDate: string
  tenantStatus?: string  // NEW: Add tenant status from rent_roll
  hasTenant?: boolean    // NEW: Add tenant presence flag
  tenantName?: string    // NEW: Add tenant name for checking
}): { isOccupied: number, source: string } {
  const { leaseStart, leaseEnd, unitStatus, leaseStatus, residentsCount, snapshotDate, tenantStatus, hasTenant, tenantName } = data
  
  // Layer 1: Check if there's an actual tenant (HIGHEST PRIORITY)
  if (tenantName && tenantName.trim() && tenantName.toLowerCase() !== 'vacant') {
    return { isOccupied: 1, source: 'has_tenant_name' }
  }
  
  // Layer 2: Check tenant status from rent_roll 
  if (tenantStatus) {
    const statusStr = String(tenantStatus).toLowerCase()
    if (/current|active|financially responsible/i.test(statusStr)) {
      return { isOccupied: 1, source: 'tenant_current' }
    }
  }
  
  // Layer 3: Check if there's an actual tenant flag
  if (hasTenant === true) {
    return { isOccupied: 1, source: 'has_tenant' }
  }
  
  // Layer 4: Check if snapshot date is within lease period
  if (leaseStart && leaseEnd && snapshotDate) {
    if (leaseStart <= snapshotDate && snapshotDate <= leaseEnd) {
      return { isOccupied: 1, source: 'lease_dates' }
    }
  }
  
  // Layer 5: Check unit/lease status fields (LOWER PRIORITY than tenant data)
  const statusFields = [unitStatus, leaseStatus].filter(Boolean)
  for (const status of statusFields) {
    const statusStr = String(status).toLowerCase()
    // Check for occupied status
    if (/occupied|current|active|rented/i.test(statusStr)) {
      return { isOccupied: 1, source: 'status_fields' }
    }
    // Check for explicitly vacant status (only if no tenant data contradicts)
    if (/vacant|notice|available|unrented/i.test(statusStr)) {
      return { isOccupied: 0, source: 'status_vacant' }
    }
  }
  
  // Layer 6: Check residents count
  if (residentsCount && residentsCount > 0) {
    return { isOccupied: 1, source: 'residents_count' }
  }
  
  // Default: vacant
  return { isOccupied: 0, source: 'default_vacant' }
}

/**
 * Enhanced column mapping with robust synonyms and preferred ordering
 */
export const COLUMN_SYNONYMS: { [canonical: string]: { preferred: RegExp[], fallback?: RegExp } } = {
  unit_code: {
    preferred: [
      /^(unit(\s*#|\s*number|\s*no\.)|unit[_ ]?(id|code|name))$/i
    ],
    fallback: /^(unit|unit[_ ]?address)$/i
  },
  property_id: {
    preferred: [
      /^(property|property[_ ]?(id|code|name))$/i
    ]
  },
  lease_start_date: {
    preferred: [
      /^(lease[_ ]?start|start[_ ]?date)$/i
    ]
  },
  lease_end_date: {
    preferred: [
      /^(lease[_ ]?end|end[_ ]?date|expiration[_ ]?date)$/i
    ]
  },
  move_in_date: {
    preferred: [
      /^(move[_ ]?in|move[_ ]?in[_ ]?date)$/i
    ]
  },
  move_out_date: {
    preferred: [
      /^(move[_ ]?out|move[_ ]?out[_ ]?date)$/i
    ]
  },
  unit_status: {
    preferred: [
      /^(lease|resident|unit)[_ ]?status$/i
    ]
  },
  lease_status: {
    preferred: [
      /^(lease|resident|unit)[_ ]?status$/i
    ]
  },
  monthly_recurring_rent: {
    preferred: [
      /^(monthly[_ ]?(rent|recurring)|total[_ ]?recurring[_ ]?charges)$/i
    ]
  },
  market_rent: {
    preferred: [
      /^market[_ ]?rent$/i
    ]
  },
  residents_count: {
    preferred: [
      /^(residents?|occupants?)[_ ]?count$/i
    ]
  },
  primary_tenant_flag: {
    preferred: [
      /^(primary[_ ]?tenant|is[_ ]?primary)$/i
    ]
  },
  lease_id: {
    preferred: [
      /^(lease[_ ]?id|lease[_ ]?number)$/i
    ]
  },
  tenant_id: {
    preferred: [
      /^(tenant[_ ]?id|resident[_ ]?id)$/i
    ]
  },
  bedspace_code: {
    preferred: [
      /^(bedspace|bed[_ ]?space|room[_ ]?code)$/i
    ]
  },
  days_vacant: {
    preferred: [
      /^(days[_ ]?vacant|vacant[_ ]?days)$/i
    ]
  },
  vacancy_status: {
    preferred: [
      /^(vacancy[_ ]?status|vacant[_ ]?status)$/i
    ]
  },
  last_move_out_date: {
    preferred: [
      /^(last[_ ]?move[_ ]?out|previous[_ ]?move[_ ]?out)$/i
    ]
  }
}

/**
 * Check if a field value looks like an address (ZIP or comma)
 */
export function isAddressyField(value: string): boolean {
  if (!value) return false
  return /\b\d{5}\b/.test(value) || value.includes(',')
}

/**
 * Find best column match using enhanced synonyms with preferred ordering
 */
export function findColumnMatch(canonical: string, availableKeys: string[]): { 
  match: string | null, 
  isAddressy: boolean 
} {
  // Exact match first
  if (availableKeys.includes(canonical)) {
    return { match: canonical, isAddressy: false }
  }

  const synonymConfig = COLUMN_SYNONYMS[canonical]
  if (synonymConfig) {
    // Try preferred patterns first
    for (const preferredRegex of synonymConfig.preferred) {
      const match = availableKeys.find(key => preferredRegex.test(key))
      if (match) {
        return { match, isAddressy: false }
      }
    }
    
    // Try fallback pattern (may be addressy)
    if (synonymConfig.fallback) {
      const match = availableKeys.find(key => synonymConfig.fallback!.test(key))
      if (match) {
        // For unit_code fallback, check if it's addressy by looking at sample data
        const isAddressy = canonical === 'unit_code'
        return { match, isAddressy }
      }
    }
  }

  // Fallback to fuzzy matching
  const variations = [
    canonical.toLowerCase(),
    canonical.replace(/_/g, ''),
    canonical.replace(/_/g, ' '),
    canonical.charAt(0).toUpperCase() + canonical.slice(1).replace(/_/g, ''),
    canonical.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(''),
    canonical.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  ]

  for (const variation of variations) {
    const match = availableKeys.find(key => 
      key.toLowerCase() === variation.toLowerCase() ||
      key.toLowerCase().includes(variation.toLowerCase()) ||
      variation.toLowerCase().includes(key.toLowerCase())
    )
    if (match) return { match, isAddressy: false }
  }

  return { match: null, isAddressy: false }
}