import { prisma } from './prisma'
import { withPrismaRetry } from './prisma-retry'

// Types for KPI data
export interface OccupancyKPIData {
  snapshotDate: string // YYYY-MM-DD format
  scope?: string
  totalUnits: number
  occupiedUnits: number
  vacantUnits: number
  occupancyRatePct: number
  occupancyStudent?: number
  occupancyNonStudent?: number
  avgVacancyDays?: number
  moveInsMTD?: number
  moveOutsMTD?: number
  expirations30?: number
  expirations60?: number
  expirations90?: number
  calcVersion?: string
}

export interface OccupancyKPIResult extends OccupancyKPIData {
  id: string
  computedAt: Date
  createdAt: Date
  updatedAt: Date
  stale: boolean // True if data is older than today
}

/**
 * Get the latest KPI data for a given scope
 */
export async function getLatestKPI(scope: string = 'portfolio'): Promise<OccupancyKPIResult | null> {
  return withPrismaRetry(async () => {
    const today = new Date().toISOString().split('T')[0]
    
    const kpi = await prisma.occupancyDailyKPI.findFirst({
      where: { scope },
      orderBy: { snapshotDate: 'desc' }
    })
    
    if (!kpi) return null
    
    return {
      id: kpi.id,
      snapshotDate: kpi.snapshotDate.toISOString().split('T')[0],
      scope: kpi.scope,
      totalUnits: kpi.totalUnits,
      occupiedUnits: kpi.occupiedUnits,
      vacantUnits: kpi.vacantUnits,
      occupancyRatePct: kpi.occupancyRatePct,
      occupancyStudent: kpi.occupancyStudent || undefined,
      occupancyNonStudent: kpi.occupancyNonStudent || undefined,
      avgVacancyDays: kpi.avgVacancyDays || undefined,
      moveInsMTD: kpi.moveInsMTD,
      moveOutsMTD: kpi.moveOutsMTD,
      expirations30: kpi.expirations30,
      expirations60: kpi.expirations60,
      expirations90: kpi.expirations90,
      calcVersion: kpi.calcVersion,
      computedAt: kpi.computedAt,
      createdAt: kpi.createdAt,
      updatedAt: kpi.updatedAt,
      stale: kpi.snapshotDate.toISOString().split('T')[0] < today
    }
  })
}

/**
 * Get KPI data for a specific date and scope
 */
export async function getKPIByDate(snapshotDate: string, scope: string = 'portfolio'): Promise<OccupancyKPIResult | null> {
  return withPrismaRetry(async () => {
    const targetDate = new Date(snapshotDate)
    const today = new Date().toISOString().split('T')[0]
    
    const kpi = await prisma.occupancyDailyKPI.findUnique({
      where: {
        snapshotDate_scope: {
          snapshotDate: targetDate,
          scope
        }
      }
    })
    
    if (!kpi) return null
    
    return {
      id: kpi.id,
      snapshotDate: kpi.snapshotDate.toISOString().split('T')[0],
      scope: kpi.scope,
      totalUnits: kpi.totalUnits,
      occupiedUnits: kpi.occupiedUnits,
      vacantUnits: kpi.vacantUnits,
      occupancyRatePct: kpi.occupancyRatePct,
      occupancyStudent: kpi.occupancyStudent || undefined,
      occupancyNonStudent: kpi.occupancyNonStudent || undefined,
      avgVacancyDays: kpi.avgVacancyDays || undefined,
      moveInsMTD: kpi.moveInsMTD,
      moveOutsMTD: kpi.moveOutsMTD,
      expirations30: kpi.expirations30,
      expirations60: kpi.expirations60,
      expirations90: kpi.expirations90,
      calcVersion: kpi.calcVersion,
      computedAt: kpi.computedAt,
      createdAt: kpi.createdAt,
      updatedAt: kpi.updatedAt,
      stale: snapshotDate < today
    }
  })
}

/**
 * Upsert KPI data - insert if not exists, update if exists
 */
export async function upsertKPI(data: OccupancyKPIData): Promise<OccupancyKPIResult> {
  return withPrismaRetry(async () => {
    const targetDate = new Date(data.snapshotDate)
    const scope = data.scope || 'portfolio'
    const today = new Date().toISOString().split('T')[0]
    
    const kpi = await prisma.occupancyDailyKPI.upsert({
      where: {
        snapshotDate_scope: {
          snapshotDate: targetDate,
          scope
        }
      },
      update: {
        totalUnits: data.totalUnits,
        occupiedUnits: data.occupiedUnits,
        vacantUnits: data.vacantUnits,
        occupancyRatePct: data.occupancyRatePct,
        occupancyStudent: data.occupancyStudent,
        occupancyNonStudent: data.occupancyNonStudent,
        avgVacancyDays: data.avgVacancyDays,
        moveInsMTD: data.moveInsMTD || 0,
        moveOutsMTD: data.moveOutsMTD || 0,
        expirations30: data.expirations30 || 0,
        expirations60: data.expirations60 || 0,
        expirations90: data.expirations90 || 0,
        calcVersion: data.calcVersion || 'v1',
        computedAt: new Date(),
        updatedAt: new Date()
      },
      create: {
        snapshotDate: targetDate,
        scope,
        totalUnits: data.totalUnits,
        occupiedUnits: data.occupiedUnits,
        vacantUnits: data.vacantUnits,
        occupancyRatePct: data.occupancyRatePct,
        occupancyStudent: data.occupancyStudent,
        occupancyNonStudent: data.occupancyNonStudent,
        avgVacancyDays: data.avgVacancyDays,
        moveInsMTD: data.moveInsMTD || 0,
        moveOutsMTD: data.moveOutsMTD || 0,
        expirations30: data.expirations30 || 0,
        expirations60: data.expirations60 || 0,
        expirations90: data.expirations90 || 0,
        calcVersion: data.calcVersion || 'v1',
        computedAt: new Date()
      }
    })
    
    return {
      id: kpi.id,
      snapshotDate: kpi.snapshotDate.toISOString().split('T')[0],
      scope: kpi.scope,
      totalUnits: kpi.totalUnits,
      occupiedUnits: kpi.occupiedUnits,
      vacantUnits: kpi.vacantUnits,
      occupancyRatePct: kpi.occupancyRatePct,
      occupancyStudent: kpi.occupancyStudent || undefined,
      occupancyNonStudent: kpi.occupancyNonStudent || undefined,
      avgVacancyDays: kpi.avgVacancyDays || undefined,
      moveInsMTD: kpi.moveInsMTD,
      moveOutsMTD: kpi.moveOutsMTD,
      expirations30: kpi.expirations30,
      expirations60: kpi.expirations60,
      expirations90: kpi.expirations90,
      calcVersion: kpi.calcVersion,
      computedAt: kpi.computedAt,
      createdAt: kpi.createdAt,
      updatedAt: kpi.updatedAt,
      stale: data.snapshotDate < today
    }
  })
}

/**
 * Get all available snapshot dates for a scope (for historical analysis)
 */
export async function getAvailableDates(scope: string = 'portfolio'): Promise<string[]> {
  return withPrismaRetry(async () => {
    const results = await prisma.occupancyDailyKPI.findMany({
      where: { scope },
      select: { snapshotDate: true },
      orderBy: { snapshotDate: 'desc' },
      distinct: ['snapshotDate']
    })
    
    return results.map((r: { snapshotDate: Date }) => r.snapshotDate.toISOString().split('T')[0])
  })
}

/**
 * Delete old KPI data (cleanup utility)
 */
export async function cleanupOldKPIs(keepDays: number = 90, scope: string = 'portfolio'): Promise<number> {
  return withPrismaRetry(async () => {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - keepDays)
    
    const result = await prisma.occupancyDailyKPI.deleteMany({
      where: {
        scope,
        snapshotDate: {
          lt: cutoffDate
        }
      }
    })
    
    return result.count
  })
}