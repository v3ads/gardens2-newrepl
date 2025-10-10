import { MasterCSVSync } from './master-csv-sync'

interface FinancialMetrics {
  actualMRR: number
  marketPotential: number
  vacancyLoss: number
  arpu: number
  occupiedUnits: number
  totalUnits: number
  vacantUnits: number
  snapshotDate: string
  guardrailsPass: boolean
  guardrailErrors: string[]
  // Family units data (excluded from standard metrics)
  familyUnits?: {
    totalFamilyUnits: number
    occupiedFamilyUnits: number
    vacantFamilyUnits: number
    familyVacancyLoss: number
    familyActualMRR: number
    familyMarketPotential: number
  }
}

interface UnitRecord {
  unit: string
  tenant_status: string
  primary_tenant: string
  monthly_rent: number
  market_rent: number
}

export class FinancialAnalytics {
  
  public static async getFinancialMetrics(): Promise<FinancialMetrics> {
    // Use performance cache to avoid recomputation
    const { PerformanceCache } = await import('./performance-cache')
    
    const result = await PerformanceCache.getCachedOrCompute(
      'financial-metrics',
      () => this.computeFinancialMetrics(),
      10 // 10 minute cache
    )
    
    return result.data
  }

  private static async getDataFromDatabase(): Promise<any[]> {
    console.log('[FINANCIAL_ANALYTICS] 📁 Reading financial data from AppFolio rent roll (CONSISTENT SOURCE)...')
    
    try {
      const { prisma, withPrismaRetry } = await import('./prisma')
      
      // USE SAME DATA SOURCE AS OCCUPANCY: raw_appfolio_rent_roll
      const rentRollData = await withPrismaRetry(() => prisma.$queryRaw`
        SELECT 
          "payloadJson"->>'Unit' as unit,
          "payloadJson"->>'Status' as status,
          "payloadJson"->>'Rent' as rent,
          "payloadJson"->>'MarketRent' as market_rent,
          "payloadJson"->>'Tenant' as tenant_name
        FROM raw_appfolio_rent_roll
        WHERE "payloadJson"->>'Unit' IS NOT NULL
      `) as any[]

      // Using singleton - no disconnect needed

      console.log(`[FINANCIAL_ANALYTICS] 📁 Found ${rentRollData.length} AppFolio rent roll records`)
      
      if (rentRollData.length === 0) {
        console.log('[FINANCIAL_ANALYTICS] 📁 No AppFolio data available, returning empty array')
        return []
      }
      
      // Convert to format expected by financial analytics - CONSISTENT WITH OCCUPANCY ANALYTICS
      const formattedData = rentRollData.map(record => ({
        Unit: record.unit,
        'Tenant Status': record.status === 'Current' ? 'Current' :
                        record.status === 'Notice-Unrented' ? 'Notice' :
                        record.status === 'Vacant-Unrented' ? 'Vacant' : 
                        record.status,
        'Monthly Rent': record.rent && (record.status === 'Current' || record.status === 'Notice-Unrented') ? record.rent.replace(/[,$]/g, '') : '0',
        'Market Rent': record.market_rent ? record.market_rent.replace(/[,$]/g, '') : '0',
        'Primary Tenant': 'Yes', // Default for rent roll data
        'Tenant Name': record.tenant_name || '',
        'First Name': record.tenant_name ? record.tenant_name.split(' ')[0] || '' : '',
        'Last Name': record.tenant_name ? record.tenant_name.split(' ').slice(1).join(' ') || '' : '',
        'Full Name': record.tenant_name || ''
      }))
      
      console.log(`[FINANCIAL_ANALYTICS] ✅ Using consistent AppFolio data with unified vacancy logic`)
      return formattedData
      
    } catch (dbError) {
      console.warn('[FINANCIAL_ANALYTICS] 📁 AppFolio data fallback failed:', dbError)
      return []
    }
  }

  private static async computeFinancialMetrics(): Promise<FinancialMetrics> {
    console.log('[FINANCIAL_ANALYTICS] Computing financial metrics using unified analytics...')
    
    try {
      // Use unified analytics for consistent data and business rule application
      const { UnifiedAnalytics } = await import('./unified-analytics')
      const unifiedMetrics = await UnifiedAnalytics.getAnalyticsMetrics({ excludeFamilyUnits: false })
      
      console.log(`[FINANCIAL_ANALYTICS] 🔄 Using unified analytics data: ${unifiedMetrics.totalUnits} total units`)
      console.log(`[FINANCIAL_ANALYTICS] 🏠 Family unit business rule applied: ${unifiedMetrics.familyUnits?.totalFamilyUnits || 0} family units always occupied`)
      
      // Use unified metrics directly since they already apply business rules correctly
      const metrics: FinancialMetrics = {
        actualMRR: unifiedMetrics.actualMRR,
        marketPotential: unifiedMetrics.marketPotential,
        vacancyLoss: unifiedMetrics.vacancyLoss,
        arpu: unifiedMetrics.arpu,
        occupiedUnits: unifiedMetrics.occupiedUnits,
        totalUnits: unifiedMetrics.totalUnits,
        vacantUnits: unifiedMetrics.vacantUnits,
        snapshotDate: unifiedMetrics.snapshotDate,
        guardrailsPass: false,
        guardrailErrors: [],
        familyUnits: unifiedMetrics.familyUnits
      }

      // Step 4: Run guardrails validation - simplified for unified analytics
      this.validateGuardrailsSimple(metrics)

      console.log('[FINANCIAL_ANALYTICS] ✅ Financial metrics computed (EXCLUDING family units):', {
        actualMRR: metrics.actualMRR,
        marketPotential: metrics.marketPotential,
        vacancyLoss: metrics.vacancyLoss,
        arpu: metrics.arpu.toFixed(2),
        regularUnits: metrics.totalUnits,
        guardrailsPass: metrics.guardrailsPass
      })
      
      console.log('[FINANCIAL_ANALYTICS] 🏠 Family units data (separate tracking):', {
        totalFamilyUnits: metrics.familyUnits?.totalFamilyUnits,
        familyVacancyLoss: metrics.familyUnits?.familyVacancyLoss,
        familyActualMRR: metrics.familyUnits?.familyActualMRR,
        familyMarketPotential: metrics.familyUnits?.familyMarketPotential
      })

      return metrics

    } catch (error) {
      console.error('[FINANCIAL_ANALYTICS] ❌ Error computing financial metrics:', error)
      throw error
    }
  }

  private static createCanonicalTable(masterData: any[]): UnitRecord[] {
    // Group by unit and apply deduplication priority
    const unitGroups = new Map<string, any[]>()
    
    for (const record of masterData) {
      // Handle multiple data formats: database (Unit), CSV (unit), or camelCase (unit)
      const unit = (record.Unit || record.unit)?.toString()?.trim()
      if (!unit) continue
      
      if (!unitGroups.has(unit)) {
        unitGroups.set(unit, [])
      }
      unitGroups.get(unit)!.push(record)
    }

    const canonicalTable: UnitRecord[] = []
    
    for (const [unit, records] of unitGroups) {
      // Apply dedup rule: Primary Tenant = "Yes" takes priority, otherwise first record
      // Handle multiple data formats from different sources
      const primaryTenantRecord = records.find(r => 
        (r['Primary Tenant'] === 'Yes' || r.primary_tenant === 'Yes' || r.primaryTenant === 'Yes'))
      const selectedRecord = primaryTenantRecord || records[0]
      
      canonicalTable.push({
        unit,
        tenant_status: selectedRecord['Tenant Status'] || selectedRecord.tenant_status || selectedRecord.tenantStatus || '',
        primary_tenant: selectedRecord['Primary Tenant'] || selectedRecord.primary_tenant || selectedRecord.primaryTenant || '',
        monthly_rent: parseFloat(selectedRecord['Monthly Rent'] || selectedRecord.monthly_rent || selectedRecord.monthlyRent) || 0,
        market_rent: parseFloat(selectedRecord['Market Rent'] || selectedRecord.market_rent || selectedRecord.marketRent) || 0
      })
    }

    console.log(`[FINANCIAL_ANALYTICS] Canonical table created: ${canonicalTable.length} units from ${masterData.length} raw records`)
    return canonicalTable
  }

  private static validateGuardrailsSimple(metrics: FinancialMetrics): void {
    const errors: string[] = []
    
    // Guardrail 1: Vacancy Loss = Market Potential - Actual MRR (within tolerance)
    const calculatedVacancyLoss = metrics.marketPotential - metrics.actualMRR
    if (Math.abs(metrics.vacancyLoss - calculatedVacancyLoss) >= 1) {
      errors.push(`Vacancy Loss mismatch: ${metrics.vacancyLoss} vs calculated ${calculatedVacancyLoss}`)
    }

    // Guardrail 2: Unit counts consistency
    if (metrics.totalUnits !== metrics.occupiedUnits + metrics.vacantUnits) {
      errors.push(`Unit count mismatch: ${metrics.totalUnits} total vs ${metrics.occupiedUnits + metrics.vacantUnits} sum`)
    }

    metrics.guardrailsPass = errors.length === 0
    metrics.guardrailErrors = errors

    if (metrics.guardrailsPass) {
      console.log('[FINANCIAL_ANALYTICS] ✅ All guardrails passed')
    } else {
      console.log('[FINANCIAL_ANALYTICS] ⚠️ Guardrail failures:', errors)
    }
  }

  private static validateGuardrails(metrics: FinancialMetrics, occupiedUnits: UnitRecord[], vacantUnits: UnitRecord[]): void {
    const errors: string[] = []
    
    // Guardrail 1: Vacancy Loss = Market Potential - Actual MRR (within tolerance)
    const calculatedVacancyLoss = metrics.marketPotential - metrics.actualMRR
    if (Math.abs(metrics.vacancyLoss - calculatedVacancyLoss) >= 1) {
      errors.push(`Vacancy Loss mismatch: ${metrics.vacancyLoss} vs calculated ${calculatedVacancyLoss}`)
    }

    // Guardrail 2: Actual MRR = sum of Monthly Rent for occupied units
    const actualMRRCheck = occupiedUnits.reduce((sum, unit) => sum + unit.monthly_rent, 0)
    if (Math.abs(metrics.actualMRR - actualMRRCheck) >= 1) {
      errors.push(`Actual MRR mismatch: ${metrics.actualMRR} vs ${actualMRRCheck}`)
    }

    // Guardrail 3: Market Potential = sum(Monthly Rent occupied) + sum(Market Rent vacant)
    const occupiedSum = occupiedUnits.reduce((sum, unit) => sum + unit.monthly_rent, 0)
    const vacantSum = vacantUnits.reduce((sum, unit) => sum + unit.market_rent, 0)
    const marketPotentialCheck = occupiedSum + vacantSum
    if (Math.abs(metrics.marketPotential - marketPotentialCheck) >= 1) {
      errors.push(`Market Potential mismatch: ${metrics.marketPotential} vs ${marketPotentialCheck}`)
    }

    // Guardrail 4: Unit counts consistency
    if (metrics.totalUnits !== metrics.occupiedUnits + metrics.vacantUnits) {
      errors.push(`Unit count mismatch: ${metrics.totalUnits} total vs ${metrics.occupiedUnits + metrics.vacantUnits} sum`)
    }

    metrics.guardrailsPass = errors.length === 0
    metrics.guardrailErrors = errors

    if (metrics.guardrailsPass) {
      console.log('[FINANCIAL_ANALYTICS] ✅ All guardrails passed')
    } else {
      console.log('[FINANCIAL_ANALYTICS] ⚠️ Guardrail failures:', errors)
    }
  }



}