'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, TrendingUp, DollarSign, AlertTriangle, Home, Building, ArrowLeft } from 'lucide-react'

interface FamilyUnits {
  total_family_units: number
  family_vacancy_loss: number
  family_actual_mrr: number
  family_market_potential: number
}

interface FinancialMetrics {
  actual_mrr: number
  market_potential: number
  vacancy_loss: number
  arpu: number
  occupied_units: number
  total_units: number
  vacant_units: number
  snapshot_date: string
  guardrails_pass: boolean
  guardrail_errors: string[]
  family_units?: FamilyUnits
}


export default function FinancialAnalyticsPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<FinancialMetrics>({
    actual_mrr: 0,
    market_potential: 0,
    vacancy_loss: 0,
    arpu: 0,
    occupied_units: 0,
    total_units: 0,
    vacant_units: 0,
    snapshot_date: '',
    guardrails_pass: true,
    guardrail_errors: [],
    family_units: {
      total_family_units: 0,
      family_vacancy_loss: 0,
      family_actual_mrr: 0,
      family_market_potential: 0
    }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = useCallback(async () => {
    try {
      // Try fast endpoint first for instant results
      const response = await fetch(`/api/analytics/financial/fast?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      const data = await response.json()
      
      console.log('[FINANCIAL_PAGE] Fast API Response:', data)
      
      if (data.success) {
        // Transform API camelCase to snake_case for consistency
        const transformedMetrics = {
          actual_mrr: data.metrics.actualMRR || data.metrics.actual_mrr || 0,
          market_potential: data.metrics.marketPotential || data.metrics.market_potential || 0,
          vacancy_loss: data.metrics.vacancyLoss || data.metrics.vacancy_loss || 0,
          arpu: data.metrics.arpu || 0,
          occupied_units: data.metrics.occupiedUnits || data.metrics.occupied_units || 0,
          total_units: data.metrics.totalUnits || data.metrics.total_units || 0,
          vacant_units: data.metrics.vacantUnits || data.metrics.vacant_units || 0,
          snapshot_date: data.metrics.snapshotDate || data.metrics.snapshot_date || '',
          guardrails_pass: data.metrics.guardrailsPass ?? data.metrics.guardrails_pass ?? true,
          guardrail_errors: data.metrics.guardrailErrors || data.metrics.guardrail_errors || [],
          family_units: data.metrics.family_units || data.metrics.familyUnits ? {
            total_family_units: data.metrics.family_units?.total_family_units || data.metrics.familyUnits?.totalFamilyUnits || 0,
            family_vacancy_loss: data.metrics.family_units?.family_vacancy_loss || data.metrics.familyUnits?.familyVacancyLoss || 0,
            family_actual_mrr: data.metrics.family_units?.family_actual_mrr || data.metrics.familyUnits?.familyActualMRR || 0,
            family_market_potential: data.metrics.family_units?.family_market_potential || data.metrics.familyUnits?.familyMarketPotential || 0
          } : {
            total_family_units: 0,
            family_vacancy_loss: 0,
            family_actual_mrr: 0,
            family_market_potential: 0
          }
        }
        setMetrics(transformedMetrics)
        setError(null)
        console.log('[FINANCIAL_PAGE] Setting metrics from', data.source, ':', transformedMetrics)
        
        // If we got instant data, preload fresh data in background
        if (data.source === 'instant') {
          setTimeout(() => {
            fetch(`/api/analytics/financial?t=${Date.now()}`)
              .then(res => res.json())
              .then(freshData => {
                if (freshData.success) {
                  const transformedFreshMetrics = {
                    actual_mrr: freshData.metrics.actualMRR || freshData.metrics.actual_mrr || 0,
                    market_potential: freshData.metrics.marketPotential || freshData.metrics.market_potential || 0,
                    vacancy_loss: freshData.metrics.vacancyLoss || freshData.metrics.vacancy_loss || 0,
                    arpu: freshData.metrics.arpu || 0,
                    occupied_units: freshData.metrics.occupiedUnits || freshData.metrics.occupied_units || 0,
                    total_units: freshData.metrics.totalUnits || freshData.metrics.total_units || 0,
                    vacant_units: freshData.metrics.vacantUnits || freshData.metrics.vacant_units || 0,
                    snapshot_date: freshData.metrics.snapshotDate || freshData.metrics.snapshot_date || '',
                    guardrails_pass: freshData.metrics.guardrailsPass ?? freshData.metrics.guardrails_pass ?? true,
                    guardrail_errors: freshData.metrics.guardrailErrors || freshData.metrics.guardrail_errors || [],
                    family_units: freshData.metrics.family_units || freshData.metrics.familyUnits ? {
                      total_family_units: freshData.metrics.family_units?.total_family_units || freshData.metrics.familyUnits?.totalFamilyUnits || 0,
                      family_vacancy_loss: freshData.metrics.family_units?.family_vacancy_loss || freshData.metrics.familyUnits?.familyVacancyLoss || 0,
                      family_actual_mrr: freshData.metrics.family_units?.family_actual_mrr || freshData.metrics.familyUnits?.familyActualMRR || 0,
                      family_market_potential: freshData.metrics.family_units?.family_market_potential || freshData.metrics.familyUnits?.familyMarketPotential || 0
                    } : {
                      total_family_units: 0,
                      family_vacancy_loss: 0,
                      family_actual_mrr: 0,
                      family_market_potential: 0
                    }
                  }
                  setMetrics(transformedFreshMetrics)
                  console.log('[FINANCIAL_PAGE] Updated with fresh data:', transformedFreshMetrics)
                }
              })
              .catch(err => console.log('[FINANCIAL_PAGE] Background refresh failed:', err))
          }, 100)
        }
      } else {
        throw new Error(data.error || 'Failed to fetch financial metrics')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      // Keep existing metrics, don't set to null
    } finally {
      setLoading(false)
    }
  }, [])


  useEffect(() => {
    fetchMetrics()
    
    // Auto-refresh every 5 minutes to ensure fresh data
    const interval = setInterval(() => {
      fetchMetrics()
    }, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [fetchMetrics])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }


  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Financial Analytics</h1>
                <p className="text-muted-foreground mt-1">
                  Revenue metrics from master tenant data
                </p>
              </div>
            </div>
            
            <Button
              variant="outline"
              onClick={() => router.push('/analytics')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Analytics</span>
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Financial Analytics</h1>
                <p className="text-muted-foreground mt-1">
                  Revenue metrics from master tenant data
                </p>
              </div>
            </div>
            
            <Button
              variant="outline"
              onClick={() => router.push('/analytics')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Analytics</span>
            </Button>
          </div>
        </div>
        
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load financial metrics: {error}
          </AlertDescription>
        </Alert>
        
        <Button onClick={fetchMetrics}>Try Again</Button>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <DollarSign className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Financial Analytics</h1>
                <p className="text-muted-foreground mt-1">
                  Revenue metrics from master tenant data
                </p>
              </div>
            </div>
            
            <Button
              variant="outline"
              onClick={() => router.push('/analytics')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Analytics</span>
            </Button>
          </div>
        </div>
        
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No financial metrics available
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="space-y-4">
          {/* Mobile-first title section - no text cut-off */}
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Financial Analytics</h1>
              <p className="text-muted-foreground mt-1">
                Revenue metrics from master tenant data • {metrics.snapshot_date}
              </p>
            </div>
          </div>
          
          {/* Buttons positioned below title to prevent text cut-off */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={() => router.push('/analytics')}
              className="flex items-center space-x-2 w-fit"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Analytics</span>
              <span className="sm:hidden">Back</span>
            </Button>
            
            <div className="flex items-center gap-2 flex-wrap">
              {!metrics.guardrails_pass && (
                <Badge variant="destructive" className="flex items-center space-x-1">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Validation Issues</span>
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {!metrics.guardrails_pass && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-2">Data validation issues detected:</div>
            <ul className="list-disc pl-4 space-y-1">
              {(metrics.guardrail_errors || []).map((error, index) => (
                <li key={index} className="text-sm">{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Actual MRR */}
        <Card className="relative overflow-hidden border-green-200 bg-gradient-to-br from-green-50 to-green-100">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-green-600/20" />
          <CardHeader className="relative pb-2">
            <CardDescription className="text-sm font-medium text-green-600">
              Actual MRR
            </CardDescription>
            <CardTitle className="text-3xl font-bold text-green-700">
              {formatCurrency(metrics.actual_mrr)}
            </CardTitle>
          </CardHeader>
          <CardContent className="relative pt-0 space-y-3">
            <div className="flex items-center justify-between text-sm text-green-600">
              <span>From {metrics.occupied_units} occupied units</span>
              <TrendingUp className="h-4 w-4" />
            </div>
            
            {/* Progress Bar showing % of Market Potential */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-green-600 font-medium">
                  {((metrics.actual_mrr / metrics.market_potential) * 100).toFixed(1)}% of Market Potential
                </span>
                <span className="text-gray-500 font-medium">
                  {formatCurrency(metrics.market_potential - metrics.actual_mrr)} remaining
                </span>
              </div>
              <div className="w-full bg-gray-300 rounded-full h-4 shadow-inner border border-gray-400">
                <div 
                  className="bg-gradient-to-r from-green-500 to-green-600 h-4 rounded-full transition-all duration-1000 shadow-sm relative"
                  style={{ width: `${(metrics.actual_mrr / metrics.market_potential) * 100}%` }}
                >
                  {/* Add a subtle highlight on the filled portion */}
                  <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-transparent rounded-full"></div>
                </div>
              </div>
              {/* Visual breakdown */}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Current: {formatCurrency(metrics.actual_mrr)}</span>
                <span>Target: {formatCurrency(metrics.market_potential)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Market Potential */}
        <Card className="relative overflow-hidden border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-blue-600/20" />
          <CardHeader className="relative pb-2">
            <CardDescription className="text-sm font-medium text-blue-600">
              Market Potential
            </CardDescription>
            <CardTitle className="text-3xl font-bold text-blue-700">
              {formatCurrency(metrics.market_potential)}
            </CardTitle>
          </CardHeader>
          <CardContent className="relative pt-0">
            <div className="flex items-center justify-between text-sm text-blue-600">
              <span>100% occupancy revenue</span>
              <Building className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Vacancy Loss */}
        <Card className="relative overflow-hidden border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-orange-600/20" />
          <CardHeader className="relative pb-2">
            <CardDescription className="text-sm font-medium text-orange-600">
              Vacancy Loss (opportunity cost)
            </CardDescription>
            <CardTitle className="text-3xl font-bold text-orange-700">
              {formatCurrency(metrics.vacancy_loss)}
            </CardTitle>
          </CardHeader>
          <CardContent className="relative pt-0 space-y-3">
            <div className="flex items-center justify-between text-sm text-orange-600">
              <span>From {metrics.vacant_units} vacant units</span>
              <Home className="h-4 w-4" />
            </div>
            
            {/* Family Units Section */}
            {metrics.family_units && metrics.family_units.total_family_units > 0 && (
              <div className="border-t border-orange-200 pt-3">
                <div className="text-xs font-medium text-orange-600 mb-2">🏠 Family Units (separate tracking)</div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-orange-600">
                    <span>Family Units:</span>
                    <span className="font-medium">{metrics.family_units.total_family_units}</span>
                  </div>
                  <div className="flex justify-between text-xs text-orange-600">
                    <span>Family Opportunity Cost:</span>
                    <span className="font-medium">{formatCurrency(metrics.family_units.family_vacancy_loss)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-orange-600">
                    <span>Family MRR:</span>
                    <span className="font-medium">{formatCurrency(metrics.family_units.family_actual_mrr)}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 4: ARPU */}
        <Card className="relative overflow-hidden border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-purple-600/20" />
          <CardHeader className="relative pb-2">
            <CardDescription className="text-sm font-medium text-purple-600">
              ARPU
            </CardDescription>
            <CardTitle className="text-3xl font-bold text-purple-700">
              {formatCurrency(metrics.arpu)}
            </CardTitle>
          </CardHeader>
          <CardContent className="relative pt-0">
            <div className="flex items-center justify-between text-sm text-purple-600">
              <span>Avg per occupied unit</span>
              <DollarSign className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Overview */}
      <Card className="bg-gradient-to-r from-gray-100 to-gray-200 border-2 border-gray-300 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-gray-800">🏢 Portfolio Overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            <div className="text-center p-4 bg-gray-50 rounded-lg shadow-md">
              <div className="text-3xl font-bold text-gray-600 mb-2">{metrics.total_units}</div>
              <div className="text-sm text-muted-foreground">Total Units</div>
              <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
                <div className="bg-gradient-to-r from-blue-400 to-purple-500 h-3 rounded-full w-full" />
              </div>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg shadow-md">
              <div className="text-3xl font-bold text-green-600 mb-2">{metrics.occupied_units}</div>
              <div className="text-sm text-muted-foreground">Occupied Units</div>
              <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-green-400 to-emerald-500 h-3 rounded-full transition-all duration-1000"
                  style={{ width: `${(metrics.occupied_units / metrics.total_units) * 100}%` }}
                />
              </div>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg shadow-md">
              <div className="text-3xl font-bold text-red-500 mb-2">{metrics.vacant_units}</div>
              <div className="text-sm text-muted-foreground">Vacant Units</div>
              <div className="mt-3 w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-red-400 to-pink-500 h-3 rounded-full transition-all duration-1000"
                  style={{ width: `${(metrics.vacant_units / metrics.total_units) * 100}%` }}
                />
              </div>
            </div>
          </div>
          
          {/* Unit Distribution */}
          <div className="mt-6 p-4 bg-white rounded-lg shadow-md">
            <h4 className="text-sm font-medium text-gray-600 mb-3">Unit Distribution</h4>
            <div className="flex rounded-lg overflow-hidden h-4 shadow-inner">
              <div 
                className="bg-gradient-to-r from-green-400 to-green-500 transition-all duration-1000"
                style={{ width: `${(metrics.occupied_units / metrics.total_units) * 100}%` }}
                title={`Occupied: ${metrics.occupied_units} units`}
              />
              <div 
                className="bg-gradient-to-r from-red-400 to-red-500 transition-all duration-1000"
                style={{ width: `${(metrics.vacant_units / metrics.total_units) * 100}%` }}
                title={`Vacant: ${metrics.vacant_units} units`}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>💚 {metrics.occupied_units} Occupied ({((metrics.occupied_units / metrics.total_units) * 100).toFixed(1)}%)</span>
              <span>❤️ {metrics.vacant_units} Vacant ({((metrics.vacant_units / metrics.total_units) * 100).toFixed(1)}%)</span>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
            <strong>Formula Check:</strong> Market Potential ({formatCurrency(metrics.market_potential)}) = 
            Actual MRR ({formatCurrency(metrics.actual_mrr)}) + Vacancy Loss ({formatCurrency(metrics.vacancy_loss)})
          </div>
        </CardContent>
      </Card>

      {/* Footnote */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="font-medium text-foreground mb-3">Metric Definitions:</div>
            
            <div>
              <span className="font-medium text-green-700">Actual MRR</span> shows the total rent currently being collected each month from occupied units.
            </div>
            
            <div>
              <span className="font-medium text-blue-700">Market Potential</span> is the total monthly rent we could collect if every unit were occupied (current rents plus expected rents for vacant units).
            </div>
            
            <div>
              <span className="font-medium text-orange-700">Vacancy Loss</span> is the amount of monthly rent we are missing because some units are vacant.
            </div>
            
            <div>
              <span className="font-medium text-purple-700">ARPU (Average Revenue Per Unit)</span> is the average monthly rent paid by each occupied unit.
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}