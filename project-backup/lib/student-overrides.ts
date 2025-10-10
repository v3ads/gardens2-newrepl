// ARCHITECTURE FIX: Use Prisma for PostgreSQL operations instead of raw SQL
import { prisma } from './prisma'
import { normalizeUnitCode, isStudentUnit } from './units'

/**
 * Student classification overrides for edge cases
 * Allows manual override of the dash-based student rule
 */

// Initialize overrides table
export function initializeStudentOverrides(): void {
  // ARCHITECTURE FIX: PostgreSQL table creation handled by Prisma migrations
  // StudentOverride model defined in prisma/schema.prisma with proper indexing
  console.log('[STUDENT_OVERRIDES] Using Prisma-managed PostgreSQL schema')
}

/**
 * Resolves student flag for a unit code
 * 1. Check for override first
 * 2. Fall back to dash-based rule
 */
export async function resolveStudentFlag(unitCode: string): Promise<boolean> {
  const normalized = normalizeUnitCode(unitCode)
  
  try {
    // ARCHITECTURE FIX: Check for override using Prisma for PostgreSQL safety
    const override = await prisma.studentOverride.findUnique({
      where: { unitCode: normalized },
      select: { isStudent: true }
    })
    
    if (override) {
      return override.isStudent
    }
    
    // Fall back to dash rule
    return isStudentUnit(normalized)
  } catch (error) {
    console.error('[STUDENT_OVERRIDES] Error resolving student flag:', error)
    // Fallback to dash rule on error
    return isStudentUnit(normalized)
  }
}

/**
 * Gets the source of student classification for a unit
 */
export async function getStudentFlagSource(unitCode: string): Promise<'override' | 'dash_rule'> {
  const normalized = normalizeUnitCode(unitCode)
  
  try {
    // ARCHITECTURE FIX: Check existence using Prisma for PostgreSQL safety
    const override = await prisma.studentOverride.findUnique({
      where: { unitCode: normalized },
      select: { unitCode: true }
    })
    
    return override ? 'override' : 'dash_rule'
  } catch (error) {
    console.error('[STUDENT_OVERRIDES] Error getting flag source:', error)
    return 'dash_rule'
  }
}

/**
 * Set an override for a unit's student classification
 */
export async function setStudentOverride(unitCode: string, isStudent: boolean): Promise<void> {
  const normalized = normalizeUnitCode(unitCode)
  
  try {
    // ARCHITECTURE FIX: Safe upsert using Prisma for PostgreSQL compatibility 
    await prisma.studentOverride.upsert({
      where: { unitCode: normalized },
      update: { 
        isStudent,
        updatedAt: new Date()
      },
      create: {
        unitCode: normalized,
        isStudent
      }
    })
    
    console.log(`[STUDENT_OVERRIDES] Set override: ${normalized} -> ${isStudent ? 'student' : 'non-student'}`)
  } catch (error) {
    console.error('[STUDENT_OVERRIDES] Failed to set override:', error)
    throw error
  }
}

/**
 * Remove an override for a unit
 */
export async function removeStudentOverride(unitCode: string): Promise<void> {
  const normalized = normalizeUnitCode(unitCode)
  
  try {
    // ARCHITECTURE FIX: Safe delete using Prisma for PostgreSQL compatibility
    const result = await prisma.studentOverride.deleteMany({
      where: { unitCode: normalized }
    })
    
    if (result.count > 0) {
      console.log(`[STUDENT_OVERRIDES] Removed override for: ${normalized}`)
    } else {
      console.log(`[STUDENT_OVERRIDES] No override found for: ${normalized}`)
    }
  } catch (error) {
    console.error('[STUDENT_OVERRIDES] Failed to remove override:', error)
    throw error
  }
}

/**
 * Get all active overrides
 */
export async function getAllOverrides(): Promise<Array<{
  unit_code: string
  is_student: boolean
  created_at: string
  updated_at: string
}>> {
  try {
    // ARCHITECTURE FIX: Get all overrides using Prisma for PostgreSQL safety
    const result = await prisma.studentOverride.findMany({
      orderBy: { unitCode: 'asc' },
      select: {
        unitCode: true,
        isStudent: true,
        createdAt: true,
        updatedAt: true
      }
    })
    
    return result.map(row => ({
      unit_code: row.unitCode,
      is_student: row.isStudent,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString()
    }))
  } catch (error) {
    console.error('[STUDENT_OVERRIDES] Failed to get overrides:', error)
    return []
  }
}