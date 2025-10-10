import { NextResponse } from 'next/server'
import { FinancialAnalytics } from '@/lib/financial-analytics'

export async function GET() {
  try {
    console.log('[FINANCIAL_API] Getting financial metrics...')
    const metrics = await FinancialAnalytics.getFinancialMetrics()
    
    const response = {
      success: true,
      metrics: {
        actual_mrr: metrics.actualMRR,
        market_potential: metrics.marketPotential,
        vacancy_loss: metrics.vacancyLoss,
        arpu: metrics.arpu,
        occupied_units: metrics.occupiedUnits,
        total_units: metrics.totalUnits,
        vacant_units: metrics.vacantUnits,
        snapshot_date: metrics.snapshotDate,
        guardrails_pass: metrics.guardrailsPass,
        guardrail_errors: metrics.guardrailErrors,
        family_units: {
          total_family_units: metrics.familyUnits?.totalFamilyUnits || 0,
          family_vacancy_loss: metrics.familyUnits?.familyVacancyLoss || 0,
          family_actual_mrr: metrics.familyUnits?.familyActualMRR || 0,
          family_market_potential: metrics.familyUnits?.familyMarketPotential || 0
        }
      }
    }

    console.log('[FINANCIAL_API] ✅ Returning financial metrics')
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('[FINANCIAL_API] ❌ Error getting financial metrics:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metrics: null
    }, { status: 500 })
  }
}