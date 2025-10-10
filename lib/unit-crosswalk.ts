// ARCHITECTURE FIX: Use Prisma for PostgreSQL operations instead of raw SQL
import { prisma } from './prisma'
import { normalizeUnitCode } from './units'

/**
 * ARCHITECTURE FIX: PostgreSQL initialization handled by Prisma migrations
 * Unit crosswalk table structure managed in prisma/schema.prisma
 */
export function initializeUnitCrosswalk() {
  // PostgreSQL table creation handled by Prisma migrations
  // No manual SQL needed for external database safety
  console.log('[UNIT_CROSSWALK] Using Prisma-managed PostgreSQL schema')
}

/**
 * Extract unit code from address string using heuristics
 * Looks for token before city/state segment
 */
function extractUnitFromAddress(addressStr: string): string | null {
  if (!addressStr) return null
  
  // Look for pattern: unit number before city, state, zip
  // e.g., "1675 NW 4th Avenue 101 Boca Raton, FL 33432" -> "101"
  const regex = /\b([A-Z0-9]+(?:-[A-Z0-9]+)?)\b(?=\s+[A-Z][a-z]+,\s*[A-Z]{2}\s*\d{5}\b)/
  const match = addressStr.match(regex)
  
  if (match) {
    return match[1]
  }
  
  // Fallback: look for any alphanumeric token that looks like a unit
  // This is more aggressive but less reliable
  const fallbackRegex = /\b([0-9]+[A-Z]?|[A-Z]?[0-9]+(?:-[A-Z0-9]+)?)\b/g
  const tokens = addressStr.match(fallbackRegex) || []
  
  // Filter out obvious non-unit tokens (years, zip codes, etc.)
  const filtered = tokens.filter(token => {
    if (token.length === 4 && /^\d{4}$/.test(token)) return false // likely year
    if (token.length === 5 && /^\d{5}$/.test(token)) return false // likely zip
    if (token.length > 6) return false // too long
    return true
  })
  
  return filtered.length > 0 ? filtered[filtered.length - 1] : null
}

/**
 * Check if a unit field value looks like an address (contains ZIP or comma)
 */
export function isAddressyUnitValue(value: string): boolean {
  if (!value) return false
  
  // Contains ZIP code pattern
  if (/\b\d{5}(-\d{4})?\b/.test(value)) return true
  
  // Contains comma (likely city, state format)
  if (value.includes(',')) return true
  
  // Contains multiple space-separated words that look like address
  const words = value.trim().split(/\s+/)
  if (words.length >= 4) {
    // Look for street indicators
    const streetIndicators = ['avenue', 'ave', 'street', 'st', 'road', 'rd', 'lane', 'ln', 'drive', 'dr', 'boulevard', 'blvd']
    if (words.some(word => streetIndicators.includes(word.toLowerCase()))) {
      return true
    }
  }
  
  return false
}

/**
 * Derive clean unit code from raw data
 */
export async function deriveUnitCode(row: any, source: string, unitDirectoryData?: any[]): Promise<{
  unitCode: string | null,
  derivedVia: 'direct' | 'directory' | 'regex' | 'failed'
}> {
  const rawUnitValue = row.unit_code || row.Unit || row['Unit Code'] || row['Unit Number'] || ''
  
  if (!rawUnitValue) {
    return { unitCode: null, derivedVia: 'failed' }
  }
  
  // ARCHITECTURE FIX: Check crosswalk cache using Prisma for PostgreSQL
  const cached = await prisma.unitCrosswalk.findUnique({
    where: { rawUnitText: rawUnitValue },
    select: { unitCodeNorm: true, derivedVia: true }
  })
  
  if (cached) {
    return { 
      unitCode: cached.unitCodeNorm, 
      derivedVia: cached.derivedVia as any
    }
  }
  
  // If not addressy, use directly
  if (!isAddressyUnitValue(rawUnitValue)) {
    const normalized = normalizeUnitCode(rawUnitValue)
    
    // ARCHITECTURE FIX: Cache result using Prisma upsert for PostgreSQL safety
    await prisma.unitCrosswalk.upsert({
      where: { rawUnitText: rawUnitValue },
      update: { unitCodeNorm: normalized, derivedVia: 'direct' },
      create: { rawUnitText: rawUnitValue, unitCodeNorm: normalized, derivedVia: 'direct' }
    })
    
    return { unitCode: normalized, derivedVia: 'direct' }
  }
  
  // Try directory lookup first
  if (unitDirectoryData && unitDirectoryData.length > 0) {
    const propertyId = row.property_id || row.Property || row['Property ID'] || ''
    
    const match = unitDirectoryData.find(dirRow => {
      const dirProperty = dirRow.property_id || dirRow.Property || dirRow['Property ID'] || ''
      const dirAddress = dirRow.unit_address || dirRow['Unit Address'] || dirRow.Address || ''
      
      return dirProperty === propertyId && dirAddress === rawUnitValue
    })
    
    if (match) {
      const dirUnitCode = match.unit_code || match['Unit Code'] || match['Unit Number'] || match.Unit || ''
      if (dirUnitCode && !isAddressyUnitValue(dirUnitCode)) {
        const normalized = normalizeUnitCode(dirUnitCode)
        
        // ARCHITECTURE FIX: Cache result using Prisma upsert for PostgreSQL safety
        await prisma.unitCrosswalk.upsert({
          where: { rawUnitText: rawUnitValue },
          update: { unitCodeNorm: normalized, derivedVia: 'directory' },
          create: { rawUnitText: rawUnitValue, unitCodeNorm: normalized, derivedVia: 'directory' }
        })
        
        return { unitCode: normalized, derivedVia: 'directory' }
      }
    }
  }
  
  // Try regex extraction
  const extracted = extractUnitFromAddress(rawUnitValue)
  if (extracted) {
    const normalized = normalizeUnitCode(extracted)
    
    // ARCHITECTURE FIX: Cache result using Prisma upsert for PostgreSQL safety
    await prisma.unitCrosswalk.upsert({
      where: { rawUnitText: rawUnitValue },
      update: { unitCodeNorm: normalized, derivedVia: 'regex' },
      create: { rawUnitText: rawUnitValue, unitCodeNorm: normalized, derivedVia: 'regex' }
    })
    
    return { unitCode: normalized, derivedVia: 'regex' }
  }
  
  // ARCHITECTURE FIX: Failed to derive - cache using Prisma upsert for PostgreSQL safety
  await prisma.unitCrosswalk.upsert({
    where: { rawUnitText: rawUnitValue },
    update: { unitCodeNorm: '', derivedVia: 'failed' },
    create: { rawUnitText: rawUnitValue, unitCodeNorm: '', derivedVia: 'failed' }
  })
  
  return { unitCode: null, derivedVia: 'failed' }
}

/**
 * Get crosswalk statistics
 */
// ARCHITECTURE FIX: Make async for PostgreSQL safety
export async function getCrosswalkStats(): Promise<{
  total: number,
  via_directory: number,
  via_regex: number,
  via_direct: number,
  failed: number
}> {
  // ARCHITECTURE FIX: Use Prisma groupBy for PostgreSQL safety
  const stats = await prisma.unitCrosswalk.groupBy({
    by: ['derivedVia'],
    _count: { derivedVia: true }
  })
  
  const result = {
    total: 0,
    via_directory: 0,
    via_regex: 0,
    via_direct: 0,
    failed: 0
  }
  
  // ARCHITECTURE FIX: Handle Prisma groupBy result format
  for (const stat of stats) {
    const count = stat._count.derivedVia
    result.total += count
    switch (stat.derivedVia) {
      case 'directory': result.via_directory = count; break
      case 'regex': result.via_regex = count; break
      case 'direct': result.via_direct = count; break
      case 'failed': result.failed = count; break
    }
  }
  
  return result
}

/**
 * Clear crosswalk cache (useful for rebuilds)
 */
// ARCHITECTURE FIX: Clear cache using Prisma for PostgreSQL safety
export async function clearCrosswalkCache() {
  await prisma.unitCrosswalk.deleteMany()
}

/**
 * PERFORMANCE FIX: Batch resolve unit codes for multiple rows
 * Eliminates N sequential database queries by preloading cache and bulk persisting
 * 
 * PROPERTY-AWARE: Directory lookups match on both property_id AND address to prevent
 * incorrect mappings across properties with similar addresses
 */
export async function batchResolveUnitCodes(
  rows: any[],
  source: string,
  unitDirectoryData?: any[]
): Promise<Map<string, { unitCode: string | null, derivedVia: 'direct' | 'directory' | 'regex' | 'failed' }>> {
  const startTime = Date.now()
  
  // Step 1: Collect all unique raw unit values AND their property IDs for directory matching
  const rawValues = new Set<string>()
  const rowsByRawValue = new Map<string, any[]>() // Group rows by raw value for property-aware lookups
  
  for (const row of rows) {
    const rawUnitValue = row.unit_code || row.Unit || row['Unit Code'] || row['Unit Number'] || ''
    if (rawUnitValue) {
      rawValues.add(rawUnitValue)
      if (!rowsByRawValue.has(rawUnitValue)) {
        rowsByRawValue.set(rawUnitValue, [])
      }
      rowsByRawValue.get(rawUnitValue)!.push(row)
    }
  }
  
  const uniqueValues = Array.from(rawValues)
  console.log(`[CROSSWALK_BATCH] Resolving ${uniqueValues.length} unique unit codes for ${rows.length} rows`)
  
  // Step 2: Load existing mappings in one query
  const existing = await prisma.unitCrosswalk.findMany({
    where: { rawUnitText: { in: uniqueValues } }
  })
  
  const cache = new Map<string, { unitCode: string | null, derivedVia: 'direct' | 'directory' | 'regex' | 'failed' }>()
  for (const row of existing) {
    cache.set(row.rawUnitText, {
      unitCode: row.unitCodeNorm || null,
      derivedVia: row.derivedVia as any
    })
  }
  
  console.log(`[CROSSWALK_BATCH] Found ${cache.size} existing mappings, resolving ${uniqueValues.length - cache.size} new ones`)
  
  // Step 3: Resolve missing mappings synchronously with property-aware directory matching
  const newMappings: Array<{ rawUnitText: string, unitCodeNorm: string, derivedVia: string }> = []
  
  for (const rawUnitValue of uniqueValues) {
    if (cache.has(rawUnitValue)) continue
    
    let unitCode: string | null = null
    let derivedVia: 'direct' | 'directory' | 'regex' | 'failed' = 'failed'
    
    // Not addressy - use directly
    if (!isAddressyUnitValue(rawUnitValue)) {
      unitCode = normalizeUnitCode(rawUnitValue)
      derivedVia = 'direct'
    }
    // Try directory lookup with property-aware matching
    else if (unitDirectoryData && unitDirectoryData.length > 0) {
      // Get property_id from the first row with this raw value
      const sampleRow = rowsByRawValue.get(rawUnitValue)?.[0]
      const propertyId = sampleRow?.property_id || sampleRow?.Property || sampleRow?.['Property ID'] || ''
      
      // CRITICAL FIX: Match on BOTH property_id AND address to prevent cross-property mapping
      const match = unitDirectoryData.find(dirRow => {
        const dirProperty = dirRow.property_id || dirRow.Property || dirRow['Property ID'] || ''
        const dirAddress = dirRow.unit_address || dirRow['Unit Address'] || dirRow.Address || ''
        return dirProperty === propertyId && dirAddress === rawUnitValue
      })
      
      if (match) {
        const dirUnitCode = match.unit_code || match['Unit Code'] || match['Unit Number'] || match.Unit || ''
        if (dirUnitCode && !isAddressyUnitValue(dirUnitCode)) {
          unitCode = normalizeUnitCode(dirUnitCode)
          derivedVia = 'directory'
        }
      }
    }
    
    // Try regex extraction if still not resolved
    if (!unitCode) {
      const extracted = extractUnitFromAddress(rawUnitValue)
      if (extracted) {
        unitCode = normalizeUnitCode(extracted)
        derivedVia = 'regex'
      }
    }
    
    // Cache the result
    cache.set(rawUnitValue, { unitCode, derivedVia })
    newMappings.push({
      rawUnitText: rawUnitValue,
      unitCodeNorm: unitCode || '',
      derivedVia
    })
  }
  
  // Step 4: Bulk persist new mappings
  if (newMappings.length > 0) {
    await prisma.unitCrosswalk.createMany({
      data: newMappings,
      skipDuplicates: true
    })
    console.log(`[CROSSWALK_BATCH] Persisted ${newMappings.length} new mappings`)
  }
  
  const duration = Date.now() - startTime
  console.log(`[CROSSWALK_BATCH] ✅ Resolved ${uniqueValues.length} unit codes in ${duration}ms`)
  
  return cache
}