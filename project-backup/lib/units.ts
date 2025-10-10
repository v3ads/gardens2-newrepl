// Single source-of-truth for student unit classification

/**
 * Normalizes unit code to a standard format
 * - Trim and collapse spaces
 * - Convert to uppercase
 * - Replace en/em dashes with standard dash
 * - Remove leading/trailing dashes
 */
export function normalizeUnitCode(unitCode: string): string {
  if (!unitCode) return ''
  
  return unitCode
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .toUpperCase()
    .replace(/[–—]/g, '-') // Replace en/em dashes with standard dash
    .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
}

/**
 * Parses unit code into base and bedspace components
 * Pattern: base-bedspace (e.g., "101-A" -> {base: "101", bedspace: "A"})
 */
export function parseUnitCode(unitCode: string): { 
  base: string
  bedspace: string | null 
} {
  const normalized = normalizeUnitCode(unitCode)
  
  // Regex pattern for base-bedspace format
  const match = normalized.match(/^\s*([A-Z0-9]+)\s*-\s*([A-Z0-9]+)\s*$/)
  
  if (match) {
    return {
      base: match[1].trim(),
      bedspace: match[2].trim()
    }
  }
  
  return {
    base: normalized,
    bedspace: null
  }
}

/**
 * Determines if a unit is a student unit based on code pattern
 * Student units have a dash suffix (e.g., "101-A")
 */
export function isStudentUnit(unitCode: string): boolean {
  const parsed = parseUnitCode(normalizeUnitCode(unitCode))
  return parsed.bedspace !== null
}

/**
 * Gets display-friendly unit code parts for UI
 */
export function getUnitDisplayInfo(unitCode: string) {
  const normalized = normalizeUnitCode(unitCode)
  const parsed = parseUnitCode(normalized)
  
  return {
    normalized,
    base: parsed.base,
    bedspace: parsed.bedspace,
    isStudent: parsed.bedspace !== null,
    displayName: parsed.bedspace ? `${parsed.base}-${parsed.bedspace}` : parsed.base
  }
}